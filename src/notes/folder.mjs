import {deleteIdleScratch} from './delete-intent.mjs';
import {encodeImportReceipt, isImportReceiptFile, importReceiptMembers} from './import-storage.mjs';
import {createOwner, OWNER_JOURNAL_FILE} from './owner.mjs';
import {SYNC_STATE_FILE, readSyncStateBytes, syncStateWrite, decodeSyncState, encodeSyncState} from './sync-state.mjs';
import {createRecordings} from './recording.mjs';
import {planAttachment, rewriteAttachmentNames, attachmentIntake, attachmentsOf, attachmentLine} from './attachments.mjs';
import {exactBytes, sha256, storedFileDigest, checkByteAbort, blobByteChunks, digestByteChunks} from './integrity.mjs';
import {NOTES_INDEX_FILE, isNoteFile, isMarkdownNote, isCodeFile, codeFileName, isAttachmentName, attachmentFileName, reconcile, noteFileName, admitIdentities, parseIndex, addSection, setCollapsed, orderAfter, noteControlValues, setNoteControls, noteControlGroups, noteControlsSnapshot, stampNoteControls, NOTE_CONTROL_GROUPS} from './model.mjs';
import {recoverTrash, runTrash, markTrashed, reviveTrashed, deletionRefusal} from './trash.mjs';
import {buildLinkIndex, resolveLinkIndex, renameLinks} from './links.mjs';
import {inspectTextConflicts, mapTextConflictVariants, canonicalJSON} from './merge.mjs';
import {appendImportReceipt, finishImportReceipt, importUndoReadiness, planImportUndo, recordImportUndo, importUndoSections, prepareImportWrites, prepareImportHistory, recordImportSections} from './import-receipt.mjs';
import {validRecordingName, recordingName, audioMime, rewriteRecordingNames, recordingsOf} from './audio.mjs';
import {INPUT_OPERATION, manifestName, parseManifest, parseCanonical, materialize, recordVersion, serializeManifest, readCanonical, freshCanonical, appendCanonical, carryCanonical, adoptCanonical, canonicalSources, createHistoryPreparation, controlsAct, thin, bindMedia, checkVersionMedia, checkInverseMedia} from './history.mjs';
import {applyReminderActions, changeReminders} from './model.mjs';
import {restoreSnapshot as planSnapshot, restoreSnapshotStream as planSnapshotStream} from './restore.mjs';
import {backupNames} from './backup-folder.mjs';
import {prepareLockedNote, createPrivateDrafts as privateDraftStorage} from './locked.mjs';
export function createPrivateDrafts(options) { return privateDraftStorage(options); }

const copy = value => JSON.parse(JSON.stringify(value));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fail = (code, message) => Object.assign(new Error(message), {code});
const prepareMutation = async prepare => {
	try { return await prepare(); }
	catch (error) { throw Object.assign(new Error(error?.message || 'The note mutation was not admitted.'),
		{name: error?.name || 'Error', code: error?.code, cause: error, notesMutationStarted: false}); }
};
const decode = bytes => new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes);
const decodeIndex = bytes => new TextDecoder('utf-8', {fatal: true}).decode(bytes);
const digest = value => value == null ? null : sha256(value);
const sameBytes = (before, after) => {
	if (before == null || after == null) return before == null && after == null;
	if (before.length !== after.length) return false;
	for (let at = 0; at < before.length; at++) if (before[at] !== after[at]) return false;
	return true;
};
function inverseMediaRelocations(expected, actual) {
	if (expected.length !== actual.length) return null;
	const result = new Map();
	for (let i = 0; i < expected.length; i++) {
		const before = expected[i], after = actual[i];
		if (before.pos !== after.pos || before.removed !== after.removed) return null;
		let text = before.inserted;
		for (const [directory, scan, rewrite] of [['attachments', attachmentsOf, rewriteAttachmentNames], ['audio', recordingsOf, rewriteRecordingNames]]) {
			const from = scan(before.inserted), to = scan(after.inserted), mapping = new Map();
			if (from.length !== to.length) return null;
			for (let j = 0; j < from.length; j++) if (from[j].name !== to[j].name) {
				if (mapping.has(from[j].name) && mapping.get(from[j].name) !== to[j].name) return null;
				mapping.set(from[j].name, to[j].name);
				const destination = directory + '/' + to[j].name, source = directory + '/' + from[j].name;
				if (result.has(destination) && result.get(destination) !== source) return null;
				result.set(destination, source);
			}
			text = rewrite(text, mapping);
		}
		if (text !== after.inserted) return null;
	}
	return result;
}
const reserved = new Set(['deleteOwner', 'deleteCheckpoint', 'folderGeneration', 'folderDeviceId', 'ownerNotice', 'transaction', 'noteCounters', 'deletions', 'tombstones', 'assetTombstones', 'assetRevivals', 'missingFiles', 'imports']);

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
				if (!present) { const next = after.slice(after.indexOf(row) + 1).map(n => rows.findIndex(m => m.name === n.name)).find(i => i >= 0); rows.splice(next ?? rows.length, 0, copy(row)); }
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

export async function planFolderRename({index, files, bodies}, {file, id, expectedDigest, wanted, linking, ascii = false, now = Date.now(), readHistory, author = {kind: 'human', id: 'notes-local'}} = {}) {
	let dropped = 0, patched = 0;
	if (linking === undefined && files.some(name => !bodies.has(name))) throw fail('changed', 'The folder gained a note while its links were being checked. Try renaming again.');
	if (!bodies.has(file) || index.notes[file]?.id !== id || await digest(bodies.get(file)) !== expectedDigest) throw fail('changed', 'The note changed before it could be renamed. Its words and name were kept.');
	if (wanted === file) return {index, file, patched: 0, dropped: 0};
	const names = files;
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
	const links = buildLinkIndex(texts); links.files = new Set(files); resolveLinkIndex(links);
	const patches = [...new Map([...variantPatches, ...renameLinks(links, texts, file, destination).map(patch => [patch.file, patch])]).values()];
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
	const canonical = [];
	for (const row of writes.slice()) {
		const originalFile = row.file === destination ? file : row.file, entry = index.notes[row.file];
		if (!entry?.canonicalHistory) continue;
		if (typeof readHistory !== 'function') throw fail('notes_history_unavailable', 'Renaming this note requires its complete canonical history.');
		const path = 'history/' + manifestName(entry.id), prior = await readHistory(path), manifest = parseManifest(prior, {noteId: entry.id, now});
		const before = readCanonical(manifest, decode(bodies.get(originalFile)));
		if (before.ledger.sha256 !== entry.canonicalHistory) throw fail('notes_history_unavailable', 'The renamed note does not prove its history.');
		const appended = appendCanonical(manifest, {text: decode(row.bytes), metadata: {...before.metadata, filename: row.file}, author, now, operation: 'notes.rename.links'});
		entry.canonicalHistory = appended.ledger.sha256;
		const history = await recordVersion(appended.manifest, {file: row.file, text: decode(row.bytes), entry, reason: 'rename', now});
		for (const write of history.writes) {
			const name = 'history/' + write.name, held = name === path ? prior : await readHistory(name), existing = writes.find(row => row.file === name);
			if (existing) { if (await digest(existing.bytes) !== await digest(write.bytes)) throw fail('notes_history_unavailable', 'The rename produced conflicting history bytes.'); continue; }
			if (write.immutable && held != null) { if (await digest(held) !== await digest(write.bytes)) throw fail('notes_history_unavailable', 'A retained history object changed.'); continue; }
			writes.push({file: name, bytes: write.bytes, expectedDigest: await digest(held)});
		}
		canonical.push({file: row.file, id: entry.id, history: path, ledger: appended.ledger.sha256});
	}
	return {kind: 'rename', index, file: destination, patched, dropped, writes, removes: [{file, expectedDigest, requires: destination}], ...(canonical.length ? {canonical} : {})};
}

export function createFolder({store, scope = 'notes', locks, channel, shared = true, timeoutMs = 1500, onInvalidate, onPending, keep = null, clock = Date.now, namespace = () => crypto.randomUUID().replace(/-/g, '')} = {}) {
	const isShared = () => typeof shared === 'function' ? !!shared() : !!shared;
	let deviceId = '';
	const identify = index => {
		const previous = index.folderDeviceId;
		deviceId = index.folderDeviceId || namespace();
		index.folderDeviceId = deviceId;
		const assigned = admitIdentities(index, deviceId);
		return previous !== deviceId || assigned.length > 0;
	};
	const owner = createOwner({store, locks, channel, shared, timeoutMs, clock, onInvalidate, deleteKeep: keep, recover: async args => {
		const repaired = await recoverTrash({...args, clock, keep: file => owner.keepDeletion(file)});
		const listing = await store.list();
		const names = [...new Set([...Object.keys(repaired.index.notes), ...listing.filter(isNoteFile)])];
		const fixed = reconcile(repaired.index, names), index = fixed.index;
		let ranks = false;
		for (const [file, entry] of Object.entries(index.notes)) {
			if (!entry.id) index.notes[file] = {...entry};
			if (entry.order !== repaired.index.notes[file]?.order) ranks = true;
		}
		const identities = identify(index);
		if (fixed.added.length || ranks || identities) return args.commitIndex(index, {kind: 'identity', reconcileFiles: true});
		return {index, listing};
	}});
	const inputReceipts = new Map();
	const pending = new Set();
	const pendingChanged = () => { try { onPending?.(pending.size); } catch (_) {} };
	const tracked = job => {
		const task = (async () => await job())();
		pending.add(task);
		pendingChanged();
		const done = () => { pending.delete(task); pendingChanged(); };
		task.then(done, done);
		return task;
	};
	const settle = async () => {
		let failed;
		while (pending.size) {
			for (const result of await Promise.allSettled([...pending])) if (result.status === 'rejected') failed ||= result.reason;
		}
		if (failed) throw failed;
	};
	const underLease = (job, options) => tracked(async () => {
		const lease = await owner.acquire(scope, options);
		try { return await job(lease); } finally { await lease.release(); }
	});
	const owned = (job, options) => underLease(async lease => job(lease, await lease.read()), options);
	const createEntry = (index, name, extra = {}) => {
		const next = reconcile(index, [...Object.keys(index.notes), name]).index;
		next.notes[name] = {...next.notes[name], ...extra};
		const arrived = typeof extra.id === 'string' && extra.id && !Object.entries(next.notes).some(([other, entry]) => other !== name && entry.id === extra.id);
		if (!arrived) delete next.notes[name].id;
		identify(next);
		return next;
	};
	const createEntries = (index, rows) => {
		const fresh = new Set(rows.map(row => row.name)), scanned = reconcile(index, [...Object.keys(index.notes), ...fresh]).index, notes = {};
		let last = '';
		for (const [file, entry] of Object.entries(scanned.notes)) if (!fresh.has(file)) { notes[file] = entry; if (entry.order > last) last = entry.order; }
		const held = new Set(Object.values(notes).map(entry => entry.id).filter(Boolean));
		for (const {name, extra = {}} of rows) {
			const entry = {...scanned.notes[name], order: orderAfter(last), ...extra};
			if (typeof extra.id === 'string' && extra.id && !held.has(extra.id)) held.add(extra.id); else delete entry.id;
			if (entry.order > last) last = entry.order;
			notes[name] = entry;
		}
		const next = {...scanned, notes};
		identify(next);
		return next;
	};
	const available = (wanted, text, names) => {
		const taken = new Set(names.map(n => n.toLowerCase()));
		if (isNoteFile(wanted) && !taken.has(wanted.toLowerCase()) && !(store.ascii && /[^\x00-\x7f]/.test(wanted))) return wanted;
		if (isCodeFile(wanted)) { const name = codeFileName(wanted, names, {ascii: store.ascii}); if (name) return name; }
		return noteFileName(text, names, {ascii: store.ascii});
	};
	const withSyncState = async snapshot => {
		try { snapshot.syncState = (await readSyncStateBytes(store)).state; }
		catch (_) { snapshot.syncState = null; }
		return snapshot;
	};
	const read = async options => {
		let snapshot;
		if (options?.syncState) {
			try { snapshot = await underLease(async lease => withSyncState(await lease.read(options))); }
			catch (error) { if (error?.code !== 'read-only') throw error; }
		}
		snapshot ||= await owner.read(scope, options);
		if (snapshot?.index && !snapshot.pressurePending) identify(snapshot.index);
		return {...snapshot, recordings: snapshot.pressurePending ? [] : await recordingCustody.recover({snapshot})};
	};
	const rebuildIndex = (backup, options) => tracked(async () => {
		const lease = await owner.acquire(scope);
		try { const snapshot = await lease.rebuildIndex(backup); return options?.syncState ? await withSyncState(snapshot) : snapshot; }
		finally { await lease.release(); }
	});
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
	const metadata = (base, wanted, {touches = [], guard} = {}) => tracked(() => owner.transact(scope, ({index}) => {
		for (const row of touches) {
			const file = Object.keys(base.notes).find(file => base.notes[file].id === row.id);
			if (!file || index.notes[file]?.id !== row.id || wanted.notes[file]?.id !== row.id) throw fail('changed', 'This note moved before its choice was saved.');
			const before = noteControlGroups(base.notes[file]), after = noteControlGroups(wanted.notes[file]), fresh = noteControlGroups(index.notes[file]);
			for (const group of row.groups) if (canonicalJSON(fresh[group]) !== canonicalJSON(before[group]) && canonicalJSON(fresh[group]) !== canonicalJSON(after[group])) throw fail('changed', 'This choice changed in another page. Open the cards again.');
		}
		return {kind: 'metadata', index: applyMetadata(base, wanted, index), controlTouches: touches};
	}, {admissionGuard: guard}));
	const controls = ({file, id, fields, expected, undo}, {signal, app = false, guard = () => {}, canonical, sourceGuard, sourceInverseGuard, inverseGuard} = {}) => underLease(async lease => {
		const active = () => { checkByteAbort(signal); guard(); };
		const history = createHistoryPreparation({signal});
		await prepareMutation(active);
		let beforeValues, nextText, act = null, replayed = false, receiptValues = null;
		const snapshot = await lease.transact(({index, bodies}) => prepareMutation(async () => {
			active();
			if (!isNoteFile(file) || !Object.hasOwn(index.notes, file) || index.notes[file].id !== id || !bodies.has(file)) throw fail('notes_target_missing', 'This note is no longer in the folder.');
			const previousEntry = index.notes[file], priorText = decode(bodies.get(file)), now = clock();
			beforeValues = noteControlValues(index, file, priorText);
			const context = await canonicalOptions({canonical: {...canonical, operation: undo ? 'notes.undo' : 'notes.set'}}), requestDigest = await sha256(JSON.stringify(undo ? {undo} : fields)); active();
			const callerOwner = await sha256(JSON.stringify([canonical?.principal || '', canonical?.transport || 'platform', context.author.kind])); active();
			if (context.author.kind === 'agent' && (expected?.ownerEpoch !== owner.incarnation || expected?.writer !== index.folderDeviceId)) throw fail('notes_read_required', 'Read this note again in the current Notes store before changing or undoing its controls.');
			let priorManifest, past;
			const loadPast = async () => {
				if (past) return past;
				priorManifest = await store.read('history/' + manifestName(id)); active();
				try { past = history.parseManifest(priorManifest, {noteId: id, now}); }
				catch (_) { throw fail('notes_history_unavailable', 'This note has unreadable history. Its source and choices were kept.'); }
				const source = history.readCanonical(past, priorText);
				if (previousEntry.canonicalHistory !== source.ledger.sha256) throw fail('notes_history_unavailable', 'The note identity does not prove this history.');
				return past;
			};
			if (context.requestScope) {
				const prior = (await loadPast()).versions.find(version => version.controls?.requestScope === context.requestScope);
				if (prior) {
					if (prior.controls.owner !== callerOwner || prior.controls.requestDigest !== requestDigest) throw fail('notes_request_conflict', 'This request already names different choices.');
					act = controlsAct(id, prior); nextText = priorText; replayed = true; receiptValues = prior.controls; return {index};
				}
			}
			let target = null, appended = null;
			if (undo) {
				const versions = (await loadPast()).versions, byAct = new Map(versions.filter(row => row.controls).map(row => [row.controls.id, row.controls]));
				target = byAct.get(undo);
				if (!target) throw fail('notes_act_unavailable', 'This Notes act is no longer in retained history.');
				if (target.owner !== callerOwner || target.author.kind !== context.author.kind) throw fail('notes_act_not_owned', 'Only the caller that made this Notes act can undo it.');
				await inverseGuard?.(target); active();
				const activeActs = new Set();
				const toggle = key => { for (let left = versions.length; key && left--; key = byAct.get(key)?.reverses) activeActs.has(key) ? activeActs.delete(key) : activeActs.add(key); };
				for (const row of versions) if (row.controls) { activeActs.add(row.controls.id); if (row.controls.reverses) toggle(row.controls.reverses); }
				if (!activeActs.has(undo)) throw fail('notes_act_inactive', 'This Notes act is already undone.');
				const descends = row => { for (let key = row.id, left = versions.length; key && left--; key = byAct.get(key)?.reverses) if (key === undo) return true; return false; };
				const groups = noteControlGroups(previousEntry);
				for (const [group, effect] of Object.entries(target.groups)) {
					let latest = effect;
					for (const row of versions) if (row.controls?.groups[group] && descends(row.controls)) latest = row.controls.groups[group];
					if ((previousEntry.controlVersions?.[group] || 0) !== latest.version || canonicalJSON(groups[group]) !== canonicalJSON(latest.after)) throw fail('notes_controls_changed', 'A later edit changed one of these choices. Its current value was kept.');
				}
				index = copy(index);
				for (const [group, effect] of Object.entries(target.groups)) {
					for (const key of NOTE_CONTROL_GROUPS[group]) delete index.notes[file][key];
					Object.assign(index.notes[file], copy(effect.before));
				}
				if (target.sourceAct) { await sourceInverseGuard?.(); active(); }
				appended = await history.appendCanonical(past, {text: priorText, ...context, requestDigest, ...(target.sourceAct ? {undo: [target.sourceAct]} : {})}); active();
				nextText = history.readCanonical(appended.manifest).text;
			} else {
				if (context.author.kind === 'agent') {
					if (!expected || expected.id !== id) throw fail('notes_read_required', 'Read this whole current note and its fields before changing them.');
					const groups = noteControlGroups(previousEntry);
					for (const field of Object.keys(fields)) {
						const group = ['archived', 'trashed'].includes(field) ? 'archiveTrash' : field;
						if (group === 'tags') { if (expected.source !== await sha256(priorText)) throw fail('notes_controls_changed', 'The note source changed after it was read.'); active(); continue; }
						if (!Object.hasOwn(NOTE_CONTROL_GROUPS, group) || canonicalJSON(expected.groups?.[group]) !== canonicalJSON(groups[group]) || (expected.versions?.[group] || 0) !== (previousEntry.controlVersions?.[group] || 0)) throw fail('notes_controls_changed', 'These choices changed after the current read. Read again before editing.');
					}
				}
				const planned = setNoteControls(index, file, fields, {text: priorText, app});
				index = planned.index; nextText = planned.text;
			}
			if (nextText !== priorText) await sourceGuard?.(priorText, nextText); active();
			const values = noteControlValues(index, file, nextText), changed = {}, previous = {};
			for (const name of Object.keys(values)) if (!eq(beforeValues[name], values[name])) { changed[name] = values[name]; previous[name] = beforeValues[name]; }
			if (!Object.keys(changed).length && !undo) { nextText = priorText; return {index: {...index, notes: {...index.notes, [file]: previousEntry}}}; }
			if (exactBytes(JSON.stringify({changed, previous})).length > 8192) throw fail('notes_receipt_too_large', 'These choices cannot fit an exact change receipt. Change fewer fields.');
			const content = await sha256(nextText); active();
			if (index.notes[file].trashed && (!previousEntry.trashed || nextText !== priorText)) index = markTrashed(index, file, {digest: content, now});
			if (nextText !== priorText) index.notes[file] = {...index.notes[file], revision: 'sha256:' + content, modified: now};
			const path = manifestName(id); await loadPast();
			appended ||= await history.appendCanonical(past, {text: nextText, ...context, requestDigest}); active();
			stampNoteControls(previousEntry, index.notes[file], (index.folderGeneration || 0) + 1);
			const beforeGroups = noteControlGroups(previousEntry), afterGroups = noteControlGroups(index.notes[file]), groups = {};
			for (const group of Object.keys(NOTE_CONTROL_GROUPS)) if ((index.notes[file].controlVersions?.[group] || 0) !== (previousEntry.controlVersions?.[group] || 0)) groups[group] = {before: beforeGroups[group], after: afterGroups[group], version: index.notes[file].controlVersions[group]};
			const receipt = {id: 'notes-controls:' + id + ':' + crypto.randomUUID(), owner: callerOwner, author: context.author, requestScope: context.requestScope || null, requestDigest, groups, sourceAct: appended.act?.id || null, changed, previous,
				...(undo ? {reverses: undo} : {}), ...(context.turn_id ? {turn_id: context.turn_id} : {}), ...(context.label !== undefined ? {label: context.label} : {})};
			index.notes[file].canonicalHistory = appended.ledger.sha256;
			const before = await history.recordVersion(appended.manifest, {file, text: priorText, entry: previousEntry, reason: 'save', now}); active();
			const reason = !previousEntry.trashed && index.notes[file].trashed ? 'trash' : previousEntry.trashed && !index.notes[file].trashed ? 'untrash' : 'edit-card';
			const after = await history.recordVersion(history.orderManifest(before.manifest), {file, text: nextText, entry: index.notes[file], reason, now, controls: receipt}); active(); act = controlsAct(id, after.version);
			const byName = new Map([...before.writes, ...after.writes].map(write => [write.name, write]));
			try {
				const readObject = name => byName.has(name) ? byName.get(name).bytes : store.read('history/' + name);
				await history.materialize(before.manifest, before.version.id, readObject);
				await history.materialize(after.manifest, after.version.id, readObject);
			} catch (_) { throw fail('notes_history_unavailable', 'The exact words of this note could not be retained in history.'); }
			active();
			const manifestWrite = byName.get(path); byName.delete(path); byName.set(path, manifestWrite);
			const writes = [];
			for (const [name, write] of byName) {
				const held = name === path ? priorManifest : await store.read('history/' + name); active();
				if (write.immutable && held != null) {
					if (await sha256(held) !== await sha256(write.bytes)) throw fail('notes_history_unavailable', 'A retained history object has different bytes.');
					active(); continue;
				}
				writes.push({file: 'history/' + name, bytes: write.bytes, expectedDigest: await digest(held)}); active();
			}
			if (nextText !== priorText) writes.push({file, bytes: exactBytes(nextText), expectedDigest: await sha256(priorText), requires: 'history/' + path});
			active();
			return {kind: 'note-controls', index, writes, canonical: [canonicalProof(file, id, appended.ledger)], historyPreparation: history};
		}), {bodies: [file], admissionGuard: () => prepareMutation(active)});
		if (snapshot.dropped?.length || snapshot.kept?.length || snapshot.index.notes[file]?.id !== id) throw fail('notes_changed', 'This note changed while its controls were written.');
		const values = noteControlValues(snapshot.index, file, nextText), changed = {}, previous = {};
		for (const name of Object.keys(values)) if (!eq(beforeValues[name], values[name])) { changed[name] = values[name]; previous[name] = beforeValues[name]; }
		return {...snapshot, file, text: nextText, changed: receiptValues?.changed || changed, previous: receiptValues?.previous || previous, act, replayed, controls: {...noteControlsSnapshot(snapshot.index, file, nextText), ownerEpoch: owner.incarnation}};
	});
	const controlsUndo = (target, options) => controls(target, options);
	const reminderChange = (targets, change, now = clock()) => tracked(() => owner.transact(scope, ({index}) => ({kind: 'reminder', index: changeReminders(index, targets, change, now), controlTouches: targets.map(target => ({id: target.id, groups: ['reminder']}))})));
	const reminderActions = actions => tracked(() => owner.transact(scope, ({index}) => ({kind: 'reminder-actions', index: applyReminderActions(index, actions)})));
	const canonicalAuthor = () => ({kind: 'human', id: deviceId || 'notes-local'});
	const canonicalOptions = async options => {
		const value = options?.canonical || {};
		return {...value, transport: value.transport === 'webmcp' ? 'webmcp' : 'platform', author: value.author || canonicalAuthor(), now: value.now ?? clock(),
			...(value.requestId ? {requestScope: await sha256(JSON.stringify([value.principal || '', value.transport || 'platform', value.requestId]))} : {})};
	};
	const historyWrites = async (recorded, {entry, prior, history}) => {
		const path = manifestName(entry.id), rows = new Map(recorded.writes.map(row => [row.name, row]));
		rows.set(path, history ? history.writeManifest(recorded.manifest) : {name: path, bytes: exactBytes(serializeManifest(recorded.manifest))});
		const writes = [];
		for (const [name, row] of rows) {
			const held = name === path ? prior : await store.read('history/' + name);
			if (row.immutable && held != null) {
				if (!sameBytes(held, row.bytes)) throw fail('notes_history_unavailable', 'A retained history object changed.');
				continue;
			}
			writes.push({file: 'history/' + name, bytes: row.bytes, expectedDigest: await digest(held)});
		}
		const readObject = name => rows.has(name) ? rows.get(name).bytes : store.read('history/' + name);
		await (history ? history.materialize(recorded.manifest, recorded.version.id, readObject) : materialize(recorded.manifest, recorded.version.id, readObject));
		return writes;
	};
	const canonicalWrites = async (manifest, {file, text, entry, prior, now, reason = 'save', restoredFrom, history}) => {
		const details = {file, text, entry, reason, now, ...(restoredFrom === undefined ? {} : {restoredFrom})};
		if (reason === 'restore') await checkVersionMedia(manifest, restoredFrom, text, {names: mediaNames, digest: path => storedFileDigest(store, path)});
		const recorded = history ? await history.recordVersion(manifest, details) : await recordVersion(manifest, details);
		return historyWrites(recorded, {entry, prior, history});
	};
	const canonicalProof = (file, id, ledger) => ({file, id, history: 'history/' + manifestName(id), ledger: ledger.sha256});
	const planCanonicalChange = async (index, {file, current, next, operation, now = clock()}) => {
		const entry = index.notes[file], path = 'history/' + manifestName(entry.id), prior = await store.read(path);
		if (prior == null) throw fail('notes_history_unavailable', 'This note has no canonical history. Its bytes were kept.');
		const proved = parseCanonical(prior, {noteId: entry.id, now, text: current});
		if (proved.ledger.sha256 !== entry.canonicalHistory) throw fail('notes_history_unavailable', 'The note identity does not prove this history.');
		const appended = appendCanonical(proved.manifest, {text: next, metadata: proved.metadata, author: canonicalAuthor(), operation, now});
		const source = exactBytes(appended.text ?? next);
		index.notes[file] = {...entry, revision: 'sha256:' + await sha256(source), modified: now, canonicalHistory: appended.ledger.sha256};
		const writes = await canonicalWrites(appended.manifest, {file, text: next, entry: index.notes[file], prior, now, reason: 'merge'});
		return {writes, canonical: [canonicalProof(file, entry.id, appended.ledger)]};
	};
	const readCanonicalOwned = async (lease, {file, id, checkpoint = false}, history = createHistoryPreparation()) => {
		const snapshot = await lease.read({bodies: [file]});
		if (!snapshot.index.notes[file] || id && snapshot.index.notes[file].id !== id || !snapshot.bodies.has(file)) throw fail('notes_changed', 'This note moved or changed.');
		id = snapshot.index.notes[file].id;
		const indexBytes = await store.read(NOTES_INDEX_FILE), liveIndex = parseIndex(indexBytes == null ? null : decodeIndex(indexBytes));
		if (liveIndex.notes[file]?.id !== id || liveIndex.notes[file]?.canonicalHistory !== snapshot.index.notes[file].canonicalHistory) throw fail('notes_changed', 'The note identity changed while it was read.');
		const body = snapshot.bodies.get(file), path = 'history/' + manifestName(id);
		let bytes;
		try { bytes = await store.read(path); }
		catch (cause) { throw Object.assign(fail('notes_history_unavailable', 'The canonical history could not be read. Its original bytes were kept.'), {cause}); }
		if (bytes == null) throw fail('notes_history_unavailable', 'This note has no canonical history. Its original bytes were kept.');
		const text = decode(body), proved = history.parseCanonical(bytes, {noteId: id, now: clock(), text});
		if (checkpoint) {
			const held = await history.materialize(proved.manifest, proved.manifest.current, name => store.read('history/' + name));
			if (held.hash !== proved.ledger.head.sha256) throw fail('notes_history_unavailable', 'The current checkpoint does not hold these words.');
		}
		if (snapshot.index.notes[file].canonicalHistory !== proved.ledger.sha256 || !sameBytes(await store.read(file), body) || !sameBytes(await store.read(path), bytes) || !sameBytes(await store.read(NOTES_INDEX_FILE), indexBytes) || await store.read(OWNER_JOURNAL_FILE) != null) throw fail('notes_changed', 'The note changed while its history was read.');
		return {...snapshot, file, id, text, digest: proved.ledger.head.sha256, ledger: proved.ledger, metadata: proved.metadata, documentAuthority: proved.ledger.documentAuthority};
	};
	const admitHistory = async (lease, {file, id}) => {
		let admitted = false;
		await lease.transact(({index, readBodies}) => prepareMutation(async () => {
			const entry = index.notes[file];
			if (!entry || id && entry.id !== id || entry.canonicalHistory || await store.read('history/' + manifestName(entry.id)) != null) return {index};
			const text = decode((await readBodies([file])).get(file)), now = clock();
			const result = appendCanonical(freshCanonical(parseManifest(null, {noteId: entry.id, now}), {filename: file, docKind: isCodeFile(file) ? 'code' : 'markdown'}), {text, author: canonicalAuthor(), operation: 'notes.admit', now});
			const next = {...index, notes: {...index.notes, [file]: {...entry, canonicalHistory: result.ledger.sha256, revision: 'sha256:' + await sha256(text)}}};
			const writes = await canonicalWrites(result.manifest, {file, text, entry: next.notes[file], prior: null, now});
			admitted = true;
			return {kind: 'admit', index: next, writes, canonical: [canonicalProof(file, entry.id, result.ledger)]};
		}));
		return admitted;
	};
	const checkEditorInverse = async ({file, id, text, ledger, inverse}) => {
		const history = createHistoryPreparation();
		ledger = history.captureLedger(ledger, text); inverse = copy(inverse);
		return underLease(async lease => {
			const current = await readCanonicalOwned(lease, {file, id}, history);
			const manifest = history.parseManifest(await store.read('history/' + manifestName(current.id)), {noteId: current.id, now: clock()});
			history.carryCanonical(manifest, ledger, text);
			if (isCodeFile(file)) return true;
			const original = copy(inverse.splices), mapping = new Map();
			if (inverse.redo) {
				const undone = ledger.records.findLast(row => row.transaction.operation === 'history.undo' && row.transaction.reverts === inverse.subject);
				if (undone) inverse.splices = undone.splices.slice().reverse().map(row => ({pos: row.pos, removed: row.inserted, inserted: row.removed}));
			}
			const media = {inverse, names: mediaNames, digest: path => storedFileDigest(store, path), relocate: inverseMediaRelocations};
			await checkInverseMedia(manifest, ledger, {...media, recover: async (path, content) => {
				const [directory, name] = path.split('/');
				for (const candidate of (await store.list(directory)).sort()) {
					if (candidate === name || !(directory === 'audio' ? validRecordingName(candidate) : isAttachmentName(candidate))) continue;
					if (await storedFileDigest(store, directory + '/' + candidate) === content) { mapping.set(path, candidate); return content; }
				}
				if (directory === 'audio') {
					const recovered = await recordingCustody.restoreOriginal(lease, current, current.id, content, name);
					if (recovered) { mapping.set(path, recovered.name); return content; }
				}
				return null;
			}});
			if (mapping.size) inverse.splices = inverse.splices.map(row => ({...row,
				inserted: rewriteRecordingNames(rewriteAttachmentNames(row.inserted,
					new Map([...mapping].filter(([path]) => path.startsWith('attachments/')).map(([path, name]) => [path.slice(12), name]))),
					new Map([...mapping].filter(([path]) => path.startsWith('audio/')).map(([path, name]) => [path.slice(6), name])))}));
			await checkInverseMedia(manifest, ledger, {...media, inverse});
			return eq(original, inverse.splices) ? true : {splices: inverse.splices};
		});
	};
	const readCanonicalNote = async target => {
		try {
			return await underLease(async lease => {
				try { return await readCanonicalOwned(lease, target); }
				catch (error) { if (error?.code !== 'notes_history_unavailable' || !await admitHistory(lease, target)) throw error; return readCanonicalOwned(lease, target); }
			});
		}
		catch (error) { if (error?.code !== 'read-only') throw error; return readCanonicalOwned({read: options => owner.read(scope, options)}, target); }
	};
	const createOwned = async (lease, text, wanted, extra = {}, request, media = null, options = {}) => {
		const active = async () => { checkByteAbort(options.signal); await options.guard?.(); checkByteAbort(options.signal); };
		let file, result;
		const snapshot = await lease.transact(({index, files}) => prepareMutation(async () => {
			await active();
			const context = await canonicalOptions(options), requestDigest = await sha256(JSON.stringify({text, wanted}));
			const kept = request && Object.keys(index.notes).find(name => index.notes[name].createdByRequest === request);
			if (kept) {
				file = kept;
				const bytes = await store.read('history/' + manifestName(index.notes[file].id));
				const manifest = parseManifest(bytes, {noteId: index.notes[file].id, now: clock()});
				result = appendCanonical(manifest, {text, ...context, requestDigest});
				if (!result.replayed && !result.unchanged) throw fail('notes_request_conflict', 'The creation request names different words.');
				return {index};
			}
			file = available(wanted, text, files);
			const now = clock(), next = createEntry(media ? reviveMedia(index, media.path, media.digest) : index, file, {created: now, modified: now, ...extra, ...(request ? {createdByRequest: request} : {})});
			const id = next.notes[file].id, manifest = freshCanonical(parseManifest(null, {noteId: id, now}), {filename: file, docKind: isCodeFile(file) ? 'code' : 'markdown'});
			result = appendCanonical(manifest, {text, ...context, requestDigest});
			next.notes[file].canonicalHistory = result.ledger.sha256;
			next.notes[file].revision = 'sha256:' + await sha256(text);
			const writes = await canonicalWrites(result.manifest, {file, text, entry: next.notes[file], prior: null, now});
			await active();
			return {kind: 'canonical-create', index: next, writes: [{file, bytes: exactBytes(text), createOnly: true}, ...writes], canonical: [canonicalProof(file, id, result.ledger)]};
		}), {admissionGuard: () => prepareMutation(active)});
		const proved = await readCanonicalOwned(lease, {file, id: snapshot.index.notes[file]?.id, checkpoint: true});
		return {...snapshot, file, id: proved.id, text: proved.text, digest: proved.digest, ledger: proved.ledger, act: result.act, replayed: !!result.replayed};
	};
	const create = (text, wanted, extra = {}, request, options) => owned(lease => createOwned(lease, text, wanted, extra, request, null, options));
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
	const save = async ({file, id, expectedDigest, expectedLedger, text, ledger, metadata, undo}, options = {}) => {
		const history = createHistoryPreparation({signal: options.signal});
		await prepareMutation(() => {
			if (ledger) ledger = history.captureLedger(ledger, text);
			if (metadata) metadata = copy(metadata);
			if (undo) undo = copy(undo);
			if (Array.isArray(expectedDigest)) expectedDigest = expectedDigest.slice();
			if (Array.isArray(expectedLedger)) expectedLedger = expectedLedger.slice();
			options = {...options, ...(options.canonical ? {canonical: copy(options.canonical)} : {})};
		});
		return underLease(async lease => {
			let destination, result, targetIndex, inputReceipt, copied = false;
			const active = async () => { checkByteAbort(options.signal); await options.guard?.(); await options.admissionGuard?.(); if (targetIndex) await options.guardTarget?.(targetIndex, destination, id); checkByteAbort(options.signal); };
			await prepareMutation(active);
			const admitted = Array.isArray(expectedDigest) ? expectedDigest : [expectedDigest];
			const expectedLedgers = expectedLedger == null ? [] : Array.isArray(expectedLedger) ? expectedLedger : [expectedLedger];
			const snapshot = await lease.transact(({index, files, readBodies}) => prepareMutation(async () => {
				await active();
				const matches = id ? Object.keys(index.notes).filter(name => index.notes[name].id === id) : [];
				const found = matches.length === 1 ? matches[0] : !id && index.notes[file] ? file : null;
				if (!found) throw fail('notes_changed', 'The note identity changed.');
				destination = found; id = index.notes[destination].id;
				targetIndex = index; await active();
				const bodies = await readBodies([destination]), body = bodies.get(destination);
				const prior = await store.read('history/' + manifestName(id));
				if (prior == null) throw fail('notes_history_unavailable', 'This note has no canonical history. Its bytes were kept.');
				let proved = null;
				try { proved = history.parseCanonical(prior, {noteId: id, now: clock(), text: decode(body)}); }
				catch (error) { if (error?.code !== 'notes_history_unavailable' || !/do not agree/.test(error.message) || undo) throw error; }
				const manifest = proved?.manifest;
				const actual = proved ? proved.ledger.head.sha256 : await digest(body);
				if (proved && index.notes[destination].canonicalHistory !== proved.ledger.sha256) throw fail('notes_history_unavailable', 'The note identity does not prove this history.');
				const context = await canonicalOptions(options), requestDigest = context.requestScope ? await sha256(JSON.stringify({text: text ?? null, base: admitted, metadata: metadata || null, undo: undo || null})) : null;
				let carried = null, carryFault = null;
				if (ledger && proved) {
					try { carried = history.carryCanonical(manifest, ledger, text); }
					catch (error) { if (error?.code !== 'notes_history_unavailable') throw error; carryFault = error; }
				}
				const appended = ledger || !proved ? null : await history.appendCanonical(manifest, {text, metadata, undo, ...context, requestDigest, input: options.input === true});
				if (appended?.replayed) { result = appended; return {index, historyPreparation: history}; }
				const landed = !!carried?.unchanged || !undo && !options.canonical && !expectedLedgers.length && !!appended?.unchanged;
				const inputBefore = inputReceipts.get(id)?.get(proved?.ledger.sha256);
				const ownInput = inputBefore?.incarnation === owner.incarnation ? inputBefore.bases : null;
				const settlesInput = !undo && !options.canonical && (carried?.supersededInput || options.input === true && appended) &&
					ownInput?.some(base => admitted.includes(base.digest) && (!expectedLedgers.length || expectedLedgers.includes(base.ledger)));
				const inverseMedia = !landed && (ledger || appended) && !isCodeFile(destination) ? await checkInverseMedia(manifest || parseManifest(prior, {noteId: id, now: clock()}), ledger || appended.ledger, {names: mediaNames, digest: path => storedFileDigest(store, path), relocate: inverseMediaRelocations}) : manifest?.media;
				await active();
				const stale = !proved || !landed && !settlesInput && (!!carryFault || !admitted.includes(actual) || expectedLedgers.length > 0 && !expectedLedgers.includes(proved.ledger.sha256));
				if (stale) {
					if (undo || options.canonical || !ledger && expectedLedgers.length) throw fail('notes_changed', 'The note changed since its exact source and history were read.');
					if (proved && text === proved.text) throw fail('notes_changed', 'The note changed since its exact source and history were read.');
					const stem = destination.replace(/\.[^./\\]*$/, ''), ext = destination.slice(stem.length);
					const names = [...new Set([...files, ...Object.keys(index.notes)])];
					const keptName = isCodeFile(destination) ? codeFileName(stem + ' kept' + ext, names, {ascii: store.ascii}) : noteFileName(stem + ' kept', names, {ascii: store.ascii});
					const now = clock(), made = createEntry(index, keptName, {created: now, modified: now, keptFrom: {file: destination, digest: actual}});
					const keptId = made.notes[keptName].id, start = history.parseManifest(null, {noteId: keptId, now});
					let first = ledger ? history.adoptCanonical(start, ledger, text)
						: await history.appendCanonical(history.freshCanonical(start, {filename: keptName, docKind: isCodeFile(keptName) ? 'code' : 'markdown'}), {text, ...context, requestDigest});
					if (inverseMedia?.length) first = {...first, manifest: {...first.manifest, media: inverseMedia}};
					const source = await history.source(text);
					made.notes[keptName].canonicalHistory = first.ledger.sha256;
					made.notes[keptName].revision = 'sha256:' + source.hash;
					const writes = await canonicalWrites(first.manifest, {file: keptName, text, entry: made.notes[keptName], prior: null, now, history});
					await active();
					destination = keptName; id = keptId; result = first; copied = true;
					return {kind: 'canonical-create', index: made, writes: [{file: keptName, bytes: source.bytes, createOnly: true}, ...writes], canonical: [canonicalProof(keptName, keptId, first.ledger)], historyPreparation: history};
				}
				result = carried ?? appended;
				if (options.input === true && result.ledger.records.at(-1)?.transaction.operation === INPUT_OPERATION) {
					const bases = [...(ownInput || [])];
					if (!bases.some(base => base.ledger === proved.ledger.sha256)) bases.push({digest: actual, ledger: proved.ledger.sha256});
					inputReceipt = {id, ledger: result.ledger.sha256, incarnation: owner.incarnation, bases};
				}
				if (inverseMedia !== result.manifest.media) result = {...result, manifest: {...result.manifest, media: inverseMedia}};
				if (result.unchanged && !index.notes[destination].trashed) return {index, historyPreparation: history};
				text = result.text ?? text;
				await options.sourceGuard?.(proved.text, text, proved.metadata); await active();
				const source = await history.source(text), nextDigest = source.hash, now = clock();
				if (index.notes[destination].trashed) index = reviveTrashed(index, destination, nextDigest);
				index.notes[destination] = {...index.notes[destination], revision: 'sha256:' + nextDigest, modified: now, canonicalHistory: result.ledger.sha256};
				const writes = await canonicalWrites(result.manifest, {file: destination, text, entry: index.notes[destination], prior, now, reason: options.reason || 'save', restoredFrom: options.restoredFrom, history});
				await active();
				return {kind: 'canonical-save', index, writes: [{file: destination, bytes: source.bytes, expectedDigest: actual}, ...writes], canonical: [canonicalProof(destination, id, result.ledger)], historyPreparation: history};
			}), {bodies: [], ordinarySave: {file, id, expectedDigest: admitted}, admit: () => {
				checkByteAbort(options.signal); options.guard?.();
				if (inputReceipt) {
					let receipts = inputReceipts.get(inputReceipt.id);
					if (!receipts) inputReceipts.set(inputReceipt.id, receipts = new Map());
					receipts.set(inputReceipt.ledger, inputReceipt);
				}
			}, admissionGuard: () => prepareMutation(active)});
			const proved = await readCanonicalOwned(lease, {file: destination, id, checkpoint: true}, history);
			if (result.replayed) {
				const original = result.ledger.records.find(row => row.transaction.id === result.act?.id);
				const kept = proved.ledger.records.find(row => row.transaction.id === result.act?.id);
				if (proved.ledger.documentAuthority !== result.ledger.documentAuthority || !original || !kept || canonicalJSON(kept) !== canonicalJSON(original)) throw fail('notes_changed', 'The saved act could not be verified.');
			} else if (proved.ledger.sha256 !== result.ledger.sha256) throw fail('notes_changed', 'The saved history could not be verified.');
			const ownedInput = inputReceipts.get(id)?.get(proved.ledger.sha256);
			if (proved.ledger.records.at(-1)?.transaction.operation !== INPUT_OPERATION || ownedInput?.incarnation !== owner.incarnation) inputReceipts.delete(id);
			else inputReceipts.set(id, new Map([[proved.ledger.sha256, ownedInput]]));
			await recordingCustody.settleRestored(proved, snapshot);
			return {...snapshot, index: proved.index, files: proved.files, generation: proved.generation, readOnly: proved.readOnly,
				file: destination, copied, id, digest: proved.digest, text: proved.text, ledger: proved.ledger, act: result.act, unchanged: !!result.unchanged, replayed: !!result.replayed};
		});
	};
	const recordHistory = ({file, id, expectedDigest, reason = 'save', restoredFrom}) => underLease(async lease => {
		if (await store.read('history/' + manifestName(id)) == null) await admitHistory(lease, {file, id});
		const history = createHistoryPreparation(); let recorded;
		const snapshot = await lease.transact(({index, readBodies}) => prepareMutation(async () => {
			const entry = index.notes[file];
			if (!entry || entry.id !== id || reason === 'trash' && !entry.trashed || reason === 'untrash' && entry.trashed)
				throw fail('notes_changed', 'The note changed before its history could be recorded.');
			const body = (await readBodies([file])).get(file), text = decode(body), prior = await store.read('history/' + manifestName(id));
			const proved = history.parseCanonical(prior, {noteId: id, now: clock(), text});
			if (proved.ledger.sha256 !== entry.canonicalHistory || expectedDigest !== undefined && proved.ledger.head.sha256 !== expectedDigest)
				throw fail('notes_changed', 'The note changed before its history could be recorded.');
			recorded = await history.recordVersion(proved.manifest, {file, text, entry, reason, now: clock(), ...(restoredFrom === undefined ? {} : {restoredFrom})});
			if (recorded.unchanged) {
				await history.materialize(recorded.manifest, recorded.version.id, name => store.read('history/' + name));
				return {index};
			}
			const writes = await historyWrites(recorded, {entry, prior, history});
			return {kind: 'history-checkpoint', index, writes, canonical: [canonicalProof(file, id, proved.ledger)], historyPreparation: history};
		}), {bodies: []});
		if (snapshot.dropped?.length) throw fail('notes_changed', 'The note history changed before its checkpoint could be recorded.');
		await readCanonicalOwned(lease, {file, id, checkpoint: true}, history);
		return {...snapshot, version: recorded.version, unchanged: recorded.unchanged};
	});
	const historyInventory = async (includeBytes = false, index) => {
		index ||= (await owner.read(scope)).index;
		const list = [], unreadable = [], bytes = includeBytes ? new Map() : null;
		const listed = new Set((await store.list('history/manifests')).filter(name => !name.startsWith('.')).map(name => 'manifests/' + name));
		const entries = new Map([...Object.values(index.missingFiles || {}).map(row => row.entry), ...Object.values(index.notes)]
			.filter(entry => entry?.id).map(entry => [manifestName(entry.id), entry]));
		const roots = new Set([...listed, ...entries.keys(), ...Object.keys(index.tombstones || {}).map(manifestName)]);
		for (const path of roots) {
			const held = await store.read('history/' + path), entry = entries.get(path); bytes?.set(path, held);
			if (held == null && !listed.has(path) && !entry?.canonicalHistory) continue;
			try {
				const noteId = path.slice('manifests/'.length).replace(/\.json$/, '').replace('!', ':');
				if (held == null || manifestName(noteId) !== path) throw fail('history', 'History manifest missing or misnamed.');
				const manifest = parseManifest(held, {noteId, now: clock()});
				if (entry?.canonicalHistory && manifest.canonical?.sha256 !== entry.canonicalHistory) throw fail('history', 'The indexed history changed.');
				list.push(manifest);
			} catch (_) { unreadable.push(path); }
		}
		return {list, unreadable, ...(bytes ? {bytes} : {})};
	};
	const historyRoots = list => canonicalJSON([...list].sort((a, b) => a.noteId < b.noteId ? -1 : a.noteId > b.noteId ? 1 : 0));
	const tidyHistory = (expected, {now, dayOf}) => {
		const reviewed = historyRoots(expected);
		return underLease(async lease => {
			let plan;
			const snapshot = await lease.transact(async ({index}) => {
				const fresh = await historyInventory(true, index);
				if (fresh.unreadable.length || historyRoots(fresh.list) !== reviewed) throw fail('history_changed', 'History changed while Tidy was open.');
				plan = thin(fresh.list, undefined, {now, dayOf, complete: true});
				const writes = await Promise.all(plan.writes.map(async row => ({file: 'history/' + row.name, bytes: row.bytes, expectedDigest: await digest(fresh.bytes.get(row.name))})));
				return {kind: 'history-tidy', index, writes};
			});
			const fresh = await historyInventory(false, (await lease.read()).index);
			if (snapshot.dropped?.length || fresh.unreadable.length || historyRoots(fresh.list) !== historyRoots(plan.manifests))
				throw fail('history_cleanup_refused', 'History changed before Tidy could remove its unused objects.');
			let stuck = 0;
			for (const path of [...plan.textsFree.map(hash => 'history/texts/' + hash), ...plan.blobsFree.map(hash => 'history/blobs/' + hash)])
				try { await store.remove(path); } catch (_) { stuck++; }
			return {...snapshot, stuck};
		});
	};
	const rename = ({file, id, expectedDigest, wanted, linking}, {guard} = {}) => owned(async (lease, before) => {
		if (linking !== undefined && !Array.isArray(linking)) throw fail('plan', 'A rename needs a list of linking notes.');
		let destination, dropped = 0, patched = 0;
		const snapshot = await lease.transact(async ({index, files, bodies}) => {
			const plan = await planFolderRename({index, files, bodies}, {file, id, expectedDigest, wanted, linking, ascii: store.ascii, now: clock(), readHistory: path => store.read(path), author: canonicalAuthor()});
			destination = plan.file; dropped = plan.dropped; patched = plan.patched;
			return plan;
		}, {bodies: linking === undefined ? before.files : [file, ...linking], admissionGuard: guard});
		if ((snapshot.dropped || []).includes(destination) || (snapshot.dropped || []).includes(file)) throw fail('changed', 'The rename could not finish because a file changed. Open the cards again; no changed file was replaced.');
		const late = (snapshot.dropped || []).filter(name => name !== destination && name !== file).length;
		return {...snapshot, file: destination, written: patched - late, dropped: dropped + late};
	});
	const trash = ({files, mode = 'expiry', expected = null} = {}) => owned(async (lease, before) => {
		const ready = snapshot => {
			if (snapshot.pressurePending) throw deletionRefusal(snapshot.pressurePending.failure || {message: snapshot.pressurePending.error}, {pending: true});
		};
		ready(before);
		if (expected) {
			if (!Array.isArray(files)) throw fail('trash', 'Confirmed deletion must name the chosen files.');
			before = await lease.read({bodies: files}); ready(before);
			for (const file of files) {
				const proof = expected.get(file), entry = before.index.notes[file];
				if (!proof || !entry || entry.id !== proof.id || entry.trashed !== proof.trashed || await digest(before.bodies.get(file)) !== proof.digest) throw fail('changed', 'A selected note changed. It was kept; review it before deleting.');
			}
		}
		const admitted = expected && new Map([...expected].map(([file, proof]) => [file, {id: proof.id, content: proof.digest}]));
		let result;
		try {
			result = await runTrash({store, index: before.index, files, mode, expected: admitted, deviceId: before.index.folderDeviceId, commitIndex: lease.commitIndex, pressureDelete: store.deletePressure ? lease.pressureDelete : null, now: clock(), clock, keep: owner.keepDeletion, checkpoint: (await readSyncStateBytes(store)).state.head?._key || null});
		} catch (error) { throw deletionRefusal(error); }
		return {...await lease.read(), result};
	}, {deletePressure: !!store.deletePressure});
	const finishLockOwned = async (lease, before, {file, id, digest, historyDigest, media = []}) => {
		const present = await store.read(file), entry = before.index.notes[file];
		if (present != null) {
			if (entry?.id !== id || await sha256(present) !== digest || await storedFileDigest(store, 'history/' + manifestName(id)) !== historyDigest)
				throw fail('changed', 'This note changed after locking began. Its original and encrypted copy were kept.');
			await runTrash({store, index: before.index, files: [file], mode: 'confirmed',
				expected: new Map([[file, {id, content: digest}]]), deviceId, commitIndex: lease.commitIndex,
				now: clock(), clock, keep: null, checkpoint: (await readSyncStateBytes(store)).state.head?._key || null});
		} else {
			await recoverTrash({store, index: before.index, commitIndex: lease.commitIndex, clock, keep: null});
		}
		if (await store.read(file) != null || await store.read('history/' + manifestName(id)) != null)
			throw fail('changed', 'Locking did not finish. The encrypted copy was kept.');
		const after = await lease.read(), references = await scanReferences(after, {}), privatePaths = [file];
		for (const {name: path, digest: expected} of media) {
			const slash = path.indexOf('/'), kind = path.slice(0, slash), name = path.slice(slash + 1);
			if (!['audio', 'attachments'].includes(kind) || name.includes('/')) throw fail('name', 'Invalid locked file');
			if ((kind === 'audio' ? references.recordings : references.attachments).has(name)) continue;
			privatePaths.push(path);
			const digest = await storedFileDigest(store, path);
			if (digest == null) continue;
			if (digest !== expected) throw fail('changed', 'A saved file changed while locking. It was kept.');
			await store.remove(path);
			if (await store.read(path) != null) throw fail('verify', 'A private file could not be removed from Notes.');
		}
		return lease.transact(async ({index}) => {
			const next = copy(index);
			for (const row of next.tombstones?.[id] || []) privatePaths.push(row.file);
			if (next.tombstones) { delete next.tombstones[id]; if (!Object.keys(next.tombstones).length) delete next.tombstones; }
			if (next.missingFiles?.[file]?.entry?.id === id) delete next.missingFiles[file];
			const {state, bytes} = await readSyncStateBytes(store), sync = copy(state);
			if (sync.plain?.base?.[id]) { privatePaths.push(sync.plain.base[id].name); delete sync.plain.base[id]; }
			for (const path of privatePaths) { if (sync.plain?.media) delete sync.plain.media[path]; if (sync.plain?.cards?.notes) delete sync.plain.cards.notes[path]; }
			sync.lockedFiles = [...new Set([...(sync.lockedFiles || []), ...await Promise.all(privatePaths.map(path => sha256(path)))])].sort();
			return {kind: 'lock-note', index: next, writes: [await syncStateWrite(sync, bytes)]};
		});
	};
	const resumeLock = target => owned((lease, before) => finishLockOwned(lease, before, target));
	const lockNote = ({file, id, digest}, seal) => owned(async (lease, before) => {
		const packet = await prepareLockedNote({store, index: before.index, file, id, digest});
		const target = {file, id, digest, historyDigest: await storedFileDigest(store, 'history/' + manifestName(id)),
			media: await Promise.all([...packet.media].map(async name => ({name, digest: await sha256(packet.files.get(name))})))};
		await seal(packet);
		return finishLockOwned(lease, before, target);
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
	const keepAttachment = async (lease, wanted, bytes, {exact = false, signal, onProgress, guard} = {}) => {
		await guard?.();
		if (bytes instanceof Blob) {
			const decision = attachmentIntake([{name: wanted, size: bytes.size}], {streaming: store.streamingAttachments === true});
			if (decision.refusal) throw fail('size', decision.refusal);
			if (!store.streamingAttachments || typeof store.writeBlob !== 'function') throw fail('storage', 'This store cannot keep a streamed file. Keep the original and open Notes with persistent storage.');
			checkByteAbort(signal);
			const name = attachmentFileName(wanted, await store.list('attachments'), {ascii: store.ascii});
			if (exact && name !== wanted) throw fail('collision', 'The attachment name is already in use: ' + wanted + '. Its file was kept.');
			await guard?.();
			const proof = await store.writeBlob('attachments/' + name, bytes, {signal, onProgress});
			try {
				const snapshot = await lease.transact(({index}) => ({kind: 'attachment', index: reviveMedia(index, 'attachments/' + name, proof.digest)}));
				return {...snapshot, name, proof};
			} catch (error) { throw Object.assign(new Error(name + ' was completely copied and remains in Saved files, but the library could not be refreshed. No link was added.'), {cause: error, keptName: name}); }
		}
		const plan = planAttachment(wanted, exactBytes(bytes), await store.list('attachments'), {ascii: store.ascii});
		if (exact && plan.name !== wanted) throw fail('collision', 'The attachment name is already in use: ' + wanted + '. Nothing replaced it; keep the source and retry Import.');
		const snapshot = await lease.transact(async ({index}) => ({kind: 'attachment', index: reviveMedia(index, plan.path, await digest(plan.bytes)), writes: [{file: plan.path, bytes: plan.bytes, createOnly: true}]}), {admissionGuard: guard});
		const rescued = snapshot.kept?.find(row => row.file === plan.path);
		const path = rescued?.name || plan.path;
		if (snapshot.dropped?.includes(plan.path) && !rescued || await digest(await store.read(path)) !== await digest(plan.bytes))
			throw fail('verify', 'The attachment copy could not be verified. Keep the original; check Saved files before trying again.');
		if (exact && rescued) throw fail('collision', 'Another file arrived under ' + wanted + '. Your copy was kept as ' + path.slice(12) + ' in Saved files. No note was linked to the competing file. Retry Import.');
		return {...snapshot, name: path.slice(12)};
	};
	const createAttachment = (wanted, bytes, options) => owned(lease => keepAttachment(lease, wanted, bytes, options));
	const emptyReferences = () => ({live: [], trash: [], history: []});
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
		const checked = new Map(), owners = new Map();
		for (const name of Object.keys(before.index.notes)) if (!owners.has(before.index.notes[name].id)) owners.set(before.index.notes[name].id, name);
		for (const leaf of (await store.list('history/manifests')).filter(name => !/^\..*\.tmp$/.test(name)).sort()) {
			checkByteAbort(signal);
			const id = leaf.replace(/\.json$/, '').replace('!', ':'); let manifest;
			try {
				if (manifestName(id) !== 'manifests/' + leaf) throw new Error('unrecognised manifest name');
				const raw = await store.read('history/manifests/' + leaf); if (raw === null) throw new Error('missing manifest');
				manifest = parseManifest(raw, {noteId: id, now: clock()});
			} catch (error) { throw fail('unreadable', 'Retained history ' + leaf + ' could not be checked. No file was deleted.'); }
			const owner = owners.get(id) ?? manifest.file;
			for (const historical of owner && isCodeFile(owner) ? [] : canonicalSources(manifest)) {
				const names = namesIn(historical.text);
				for (const which of ['attachments', 'recordings']) for (const [name, n] of names[which]) add(which, name, 'history', {file: manifest.file, noteId: id, act: historical.act, time: historical.time, count: n});
				measure(names);
			}
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

	const mediaNames = text => [...recordingsOf(text).map(row => 'audio/' + row.name), ...attachmentsOf(text).map(row => 'attachments/' + row.name)];
	const bindHistoryMedia = async (history, path, content) => {
		const writes = [];
		for (const id of new Set(history.map(row => row.noteId))) {
			const name = 'history/' + manifestName(id), prior = await store.read(name), manifest = parseManifest(prior, {noteId: id, now: clock()});
			const media = manifest.canonical && bindMedia(manifest.canonical, manifest.media, path, content, mediaNames, {close: true});
			if (media && media !== manifest.media) writes.push({file: name, bytes: exactBytes(serializeManifest({...manifest, media})), expectedDigest: await digest(prior)});
		}
		return writes;
	};
	const deleteAttachment = (reviewed, {confirmed = false, signal} = {}) => {
		if (confirmed !== true) return Promise.reject(fail('confirmation', 'Deleting a file forever needs its explicit confirmation. Nothing was deleted.'));
		return owned(async (lease, before) => {
			const current = await deletionReview(reviewed?.name, before, {signal});
			if (!eq(current, reviewed)) throw fail('changed', 'This file or the places that name it changed. Review Delete forever again; nothing was deleted.');
			checkByteAbort(signal);
			const path = 'attachments/' + current.name;
			const snapshot = await lease.transact(async ({index}) => ({kind: 'attachment-delete', index: await forgetMedia(index, path, current.digest), removes: [{file: path, expectedDigest: current.digest}], writes: await bindHistoryMedia(current.history, path, current.digest)}));
			if (snapshot.dropped?.includes('attachments/' + current.name) || await store.stat('attachments/' + current.name) !== null)
				throw fail('changed', 'The file changed, so it was not deleted.');
			return {...snapshot, name: current.name};
		});
	};

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
			const snapshot = await lease.transact(async ({index}) => ({kind: 'discard-recording', index: await forgetMedia(index, path, current.digest), removes: [{file: path, expectedDigest: current.digest}], writes: await bindHistoryMedia(current.history, path, current.digest)}));
			if (snapshot.dropped?.includes(path) || await store.stat(path) !== null) throw fail('changed', 'The recording changed, so it was not deleted.');
			return {...snapshot, name: current.name};
		});
	};
	const asset = (file, bytes) => tracked(() => owner.transact(scope, async ({index}) => {
		if (!/^(?:audio|attachments|thumbs)\//.test(file) && !isImportReceiptFile(file)) throw fail('name', 'This is not a local media or import receipt file.');
		const before = await store.read(file);
		if (before != null && await digest(before) !== await digest(bytes)) throw fail('collision', 'A file with this name is already here; it was kept.');
		return {kind: 'media', index: before == null && !isImportReceiptFile(file) ? reviveMedia(index, file, await digest(bytes)) : index, writes: before == null ? [{file, bytes, createOnly: true}] : []};
	}));
	const retainedReference = async (name, index, files) => {
		const checked = new Set();
		for (const file of files) {
			if (!isNoteFile(file)) continue;
			const id = index.notes?.[file]?.id;
			if (typeof id !== 'string' || !id) continue;
			let path;
			try { path = manifestName(id); } catch (_) { continue; }
			let manifest;
			try { manifest = parseManifest(await store.read('history/' + path), {noteId: id, now: clock()}); }
			catch (error) { throw fail('unreadable', 'The retained past of ' + file + ' could not be read, so this recording was kept in case one of its old versions plays it.'); }
			for (const historical of isCodeFile(file) ? [] : canonicalSources(manifest)) if (recordingsOf(historical.text).some(row => row.name === name)) throw fail('referenced', 'Canonical history still uses this recording. It was kept.');
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
		await retainedReference(name, index, files);
		const file = 'audio/' + name, bytes = await store.read(file);
		if (expectedDigest !== undefined && bytes != null && await digest(bytes) !== expectedDigest) throw fail('changed', 'This recording changed; nothing was lost.');
		const proof = bytes == null ? null : expectedDigest ?? await digest(bytes);
		return {kind: 'discard-recording', index: proof ? await forgetMedia(index, file, proof) : index, removes: bytes == null ? [] : [{file, expectedDigest: proof}]};
	}, {bodies: before.files}));
	const receiptPlan = async (index, receipt, checkpoint, readReceipt) => {
		const found = (index.imports || []).filter(row => row?.id === receipt.id), prior = found[0];
		if (found.length > 1) throw fail('import-undo', 'The import receipt is duplicated: ' + receipt.id + '.');
		const encoded = await encodeImportReceipt(receipt, {previous: checkpoint?.receipt, reference: checkpoint?.reference, generation: (index.folderGeneration || 0) + 1});
		const row = encoded.reference;
		if (prior && eq(prior, row)) {
			await readReceipt(receipt.id);
			return {index, writes: [], removes: [], receiptCheckpoint: {receipt: copy(receipt), reference: copy(row)}};
		}
		if (prior ? !checkpoint || !eq(prior, checkpoint.reference) : checkpoint)
			throw fail('changed', 'Import receipt ' + receipt.id + ' changed or was retired. This landing stopped; its files were kept.');
		let next = appendImportReceipt(index, row);
		const removes = [], retained = new Set(next.imports.map(value => value.id));
		for (const old of index.imports || []) {
			if (retained.has(old.id) && !(old.id === row.id && old.journal && !row.journal)) continue;
			const held = await readReceipt(old.id);
			for (const member of held.members) if (member.file !== row.file) removes.push({file:member.file, expectedDigest:member.digest});
		}
		return {index: next, writes: [{file:row.file,bytes:encoded.bytes,...(prior?.file === row.file ? {expectedDigest:prior.digest,replace:true} : {createOnly:true})}], removes,
			receiptCheckpoint:{receipt:copy(receipt),reference:copy(row)}};
	};
	const checkpointImportReceipt = (receipt, checkpoint) => owned(async lease => {
		let planned;
		const snapshot = await lease.transact(async ({index,readImportReceipt}) => {
			planned = await receiptPlan(index,receipt,checkpoint,readImportReceipt);
			return {kind:'import-receipt',index:planned.index,writes:planned.writes,removes:planned.removes};
		});
		return {...snapshot,receipt:copy(receipt),receiptCheckpoint:planned.receiptCheckpoint};
	});
	const importBatch = build => owned(async (lease, before) => {
		const result = await build({index: copy(before.index), files: before.files.slice(), bodies: before.bodies, audioNames: await store.list('audio'), attachmentNames: await store.list('attachments'), ascii: store.ascii});
		if ((result.alreadyImported || result.repeatConflict) && !result.notes?.length && !result.attachments?.length && !result.audio?.length && !result.backupFiles?.length && !result.sections?.length && !result.index) return {...before, result};
		const names = new Set(before.files.map(n => n.toLowerCase())), writes = new Map();
		for (const note of result.notes) {
			if (!isNoteFile(note.file) || names.has(note.file.toLowerCase())) throw fail('collision', 'An import name is occupied. The import was not renamed behind its links.');
			names.add(note.file.toLowerCase());
		}
		for (const row of result.backupFiles || []) {
			if (!isNoteFile(row.name) && !/^(?:audio|attachments|thumbs)\/[^/\\]+$/.test(row.name) && !isImportReceiptFile(row.name)) throw fail('name', 'This backup includes a file this Notes folder cannot safely restore: ' + row.name + '. Nothing from this pick was written.');
		}
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
			if (row.name.startsWith('attachments/')) await keepAttachment(lease, row.name.slice(12), row.bytes, {exact: true});
			else writes.set(row.name, {file: row.name, bytes: row.bytes, createOnly: true});
		}
		let receiptCommit; const canonical = [], historyTargets = new Map(), createdHistory = new Map();
		const snapshot = await lease.transact(async ({index,readImportReceipt}) => {
			const historyPreparation = createHistoryPreparation();
			if (result.index) { const generation = index.folderGeneration; index = copy(result.index); if (result.attachments?.length || result.backupFiles?.some(row => row.name.startsWith('attachments/'))) index.folderGeneration = generation; }
			for (const section of result.sections || []) index = addSection(index, section);
			for (const note of result.notes) {
				if (note.entry?.category) index = addSection(index, note.entry.category);
				if (!note.exactBackup && !isCodeFile(note.file)) note.text = rewriteRecordingNames(note.text, audioMap);
				if (!note.exactBackup || !writes.has(note.file)) writes.set(note.file, {file: note.file, bytes: (note.exactBackup || isCodeFile(note.file)) && note.bytes ? note.bytes : exactBytes(note.text), createOnly: true});
			}
			if (result.notes.length) index = createEntries(index, result.notes.map(note => ({name: note.file, extra: note.entry || {}})));
			for (const note of result.notes) {
				const entry = index.notes[note.file], id = entry.id, path = 'history/' + manifestName(id);
				const prior = writes.get(path)?.bytes || await store.read(path), now = clock();
				let text; try { text = decode(writes.get(note.file).bytes); } catch (_) { continue; }
				let manifest, ledger;
				if (prior != null) {
					manifest = historyPreparation.parseManifest(prior, {noteId: id, now}); ledger = historyPreparation.readCanonical(manifest, text).ledger;
				} else {
					if (entry.canonicalHistory) throw fail('notes_history_unavailable', 'The imported note is missing its canonical history.');
					manifest = historyPreparation.freshCanonical(historyPreparation.parseManifest(null, {noteId: id, now}), {filename: note.file, docKind: isCodeFile(note.file) ? 'code' : 'markdown'});
					const created = await historyPreparation.appendCanonical(manifest, {text, author: canonicalAuthor(), operation: 'notes.import', now});
					manifest = created.manifest; ledger = created.ledger;
				}
				entry.canonicalHistory = ledger.sha256; entry.revision = 'sha256:' + await sha256(text);
				if (entry.trashed && !note.exactBackup) {
					index = markTrashed(index, note.file, {digest: entry.revision.slice(7), now: entry.trashedAt ?? now});
					Object.assign(entry, index.notes[note.file]);
				}
				const history = await canonicalWrites(manifest, {file: note.file, text, entry, prior, now, reason: 'import', history: historyPreparation});
				for (const row of history) {
					writes.set(row.file, {...row, ...(row.expectedDigest === null ? {} : {replace: true})});
					historyTargets.set(row.file, row);
					if (row.expectedDigest === null) createdHistory.set(row.file, row);
				}
				canonical.push(canonicalProof(note.file, id, ledger));
			}

			for (const section of result.sectionsAdded || []) if (section?.collapsed === true && !before.index.sections.some(row => row.name === section.name)) index = setCollapsed(index, section.name, true);
			for (const row of writes.values()) if (/^(?:audio|attachments)\//.test(row.file)) index = reviveMedia(index, row.file, await digest(row.bytes));
			if (result.importReceipt) {
				let receipt = result.importReceipt;
				receipt = await prepareImportWrites(receipt, result.notes.map(note => ({note: {...note, bytes: writes.get(note.file).bytes}, entry: index.notes[note.file]})));
				receipt = await prepareImportHistory(receipt, [...historyTargets.values()]);
				receipt = recordImportSections(receipt, index.sections.filter(section => !before.index.sections.some(old => old.name === section.name)));
				receiptCommit = await receiptPlan(index, receipt, result.receiptCheckpoint, readImportReceipt); index = receiptCommit.index;
			}
			return {kind: 'import', index, writes: [...writes.values(), ...(receiptCommit?.writes || [])], removes: receiptCommit?.removes || [], ...(canonical.length ? {canonical, historyPreparation} : {})};
		});
		for (const row of writes.values()) if (/^audio\//.test(row.file) && !(snapshot.dropped || []).includes(row.file)) result.createdFiles.push({file: row.file, bytes: row.bytes});
		result.createdHistory = await Promise.all([...createdHistory.values()].map(async row => ({file: row.file, bytes: row.bytes, actual: await store.read(row.file)})));
		result.createdSections = snapshot.index.sections.filter(section => !before.index.sections.some(old => old.name === section.name));
		return {...snapshot, result, ...(receiptCommit ? {receiptCheckpoint:receiptCommit.receiptCheckpoint} : {})};
	});
	const restoreSnapshot = async (entries, {replace = false, signal, guard} = {}) => {
		const admit = async () => { checkByteAbort(signal); await guard?.(); checkByteAbort(signal); };
		await admit();
		const plan = entries?.parts ? await planSnapshotStream(entries) : await planSnapshot(entries), sidecar = plan.files.find(row => row.name === NOTES_INDEX_FILE);
		const identity = [];
		for (const row of plan.files) identity.push([row.name, row.size ?? row.bytes.length, row.sha256 ?? await sha256(row.bytes ?? await row.read())]);
		identity.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
		const restoreSource = await sha256(exactBytes(JSON.stringify(identity)));
		const sourceRows = new Map(plan.files.map(row => [row.name, row]));
		const scratch = await deleteIdleScratch(plan.index, [...sourceRows.keys()], async name => { const row = sourceRows.get(name); return row ? row.bytes ?? await row.read() : null; });
		plan.files = plan.files.filter(row => !scratch.has(row.name));
		let indexBytes = sidecar.bytes ?? await sidecar.read(), checkpoint = null;
		const restoredIndex = JSON.parse(decode(indexBytes).replace(/^﻿/, ''));
		const writes = [];
		for (const row of plan.files) {
			if (row === sidecar) continue;
			if (row.name === SYNC_STATE_FILE) {
				let bytes = row.bytes ?? await row.read();
				const state = decodeSyncState(bytes);
				if (state.vault || state.head) {
					bytes = encodeSyncState({rejoin: true, ...(state.vault ? {vault: {...state.vault, credential: null}} : {})});
				}
				checkpoint = {file: row.name, size: bytes.length, digest: await sha256(bytes), read: () => bytes, createOnly: true};
				continue;
			}
			writes.push({file: row.name, size: row.size ?? row.bytes.length, digest: row.sha256 ?? await sha256(row.bytes), read: row.read ?? (() => row.bytes), createOnly: true});
		}
		if (checkpoint) writes.push(checkpoint);
		return tracked(async () => {
			const lease = await owner.acquire(scope);
			try {
				await admit();
				restoredIndex.folderDeviceId = await lease.restoreWriter(restoreSource) || crypto.randomUUID().replace(/-/g, '');
				indexBytes = exactBytes(JSON.stringify(restoredIndex));
				plan.index = parseIndex(decodeIndex(indexBytes));
				const snapshot = await lease.transact({kind: 'restore', index: plan.index, exactIndex: indexBytes, writes, restoreSource},
					{exactRestore: true, replace, restoreGuard: admit});
				deviceId = snapshot.index.folderDeviceId || '';
				return {...snapshot, verification: plan.verification};
			} finally { await lease.release(); }
		});
	};
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
			before = await lease.transact(async ({index,readImportReceipt}) => {
				const held = await readImportReceipt(record.id);
				record = {...held.receipt, undo: {...held.receipt.undo, historyCleanup: {requested: removes.map(row => row.file), kept}}};
				const stored = await receiptPlan(index, record, held, readImportReceipt);
				return {kind:'import-undo-history',index:stored.index,writes:stored.writes,removes:[...removes,...stored.removes]};
			});
		}
		const refs = record.createdFiles?.length ? await scanReferences(before) : null, removes = [], kept = [], shared = new Set();
		for (const leaf of (await store.list('history/manifests')).filter(name => name.endsWith('.json') && !name.startsWith('.'))) {
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
		return lease.transact(async ({index,readImportReceipt}) => {
			const held = await readImportReceipt(record.id); record = held.receipt;
			const sections = importUndoSections(record, index), removedSections = index.sections.filter(row => !sections.includes(row)).map(row => row.name);
			index.sections = sections;
			record = {...record, undo: {...record.undo, cleanup: {requested: removes.map(row => row.file), kept, sections: removedSections}}};
			for (const row of removes) if (/^(?:attachments|audio)\//.test(row.file)) index = await forgetMedia(index, row.file, row.expectedDigest);
			const stored = await receiptPlan(index,record,held,readImportReceipt);
			return {kind:'import-undo-files',index:stored.index,writes:stored.writes,removes:[...removes,...stored.removes]};
		});
	};
	const importUndo = (receipt, {files, keep = []}, commit) => {
		const id = receipt?.id, options = {files: files?.slice(), keep: keep.slice()};
		return owned(async (lease, before) => {
			const recorded = held => {
				let row = held.receipt;
				if (held.reference.journal) row = finishImportReceipt(row,{status:'cancelled',why:'Stopped at the last durable import checkpoint; unverified arrivals were kept.'});
				const why = importUndoReadiness(row);
				if (why && why !== 'this import was already undone') throw fail('import-undo',why);
				return row;
			};
			let held = await lease.readImportReceipt(id), record = recorded(held);
			if (record.undo) {
				const snapshot = commit ? await finishImportUndo(lease,before,record) : before;
				const current = (await lease.readImportReceipt(id)).receipt;
				return {...snapshot,receipt:current,plan:planImportUndo(record,before.index,new Map()),result:{removed:[],kept:copy(record.undo.kept),alreadyUndone:true},history:[]};
			}
			const listed = new Set(before.files), names = record.written.map(row=>row.file).filter(file=>listed.has(file));
			if (!commit) {
				const snapshot = await lease.read({bodies:names}); held = await lease.readImportReceipt(id); record = recorded(held);
				return {...snapshot,receipt:copy(record),plan:planImportUndo(record,snapshot.index,snapshot.bodies,options)};
			}
			let plan;
			let snapshot = await lease.transact(async ({index,bodies,readImportReceipt}) => {
				held = await readImportReceipt(id); record = recorded(held);
				plan = planImportUndo(record,index,bodies,options);
				if (plan.refuse) throw fail('import-undo',plan.refuse);
				const proofs = new Map(record.written.map(row=>[row.file,row]));
				index.notes = Object.fromEntries(plan.entries);
				const stored = await receiptPlan(index,recordImportUndo(record,plan,{stamp:clock()}),held,readImportReceipt);
				return {kind:'import-undo',index:stored.index,writes:stored.writes,removes:[...plan.remove.map(file=>({file,expectedDigest:proofs.get(file).digest})),...stored.removes]};
			},{bodies:names});
			const present = new Set(snapshot.files), removed = plan.remove.filter(file=>!present.has(file)), kept = [...plan.kept,
				...plan.remove.filter(file=>present.has(file)).map(file=>({file,why:'changed while undo was being committed; its current words were kept'}))];
			record = (await lease.readImportReceipt(id)).receipt;
			snapshot = await finishImportUndo(lease,snapshot,record);
			return {...snapshot,receipt:(await lease.readImportReceipt(id)).receipt,plan,result:{removed,kept,alreadyUndone:false},history:[]};
		});
	};
	const previewImportUndo = (receipt, options = {}) => importUndo(receipt, options, false);
	const undoImport = (receipt, options = {}) => importUndo(receipt, options, true);
	const receiptMembers = (index, lease) => importReceiptMembers(index, row => lease ? lease.readImportReceipt(row.id) : owner.readImportReceipt(scope, row.id));
	const receiptMembersCurrent = async members => {
		for (const member of members) {
			const bytes = await store.read(member.file);
			if (bytes == null || bytes.length !== member.byteLength || await digest(bytes) !== member.digest) return false;
		}
		return true;
	};
	const assertNoPendingDeletion = async () => { if (await owner.pendingDeletion()) throw fail('delete-pending', 'Deletion recovery is still pending. The remaining bytes are kept; a normal backup cannot be certified yet.'); await owner.validateDeletionScratch(); };
	const captureFiles = async () => {
		await assertNoPendingDeletion();
		const rows = [];
		const names = await backupNames({readBytes: name => store.read(name), list: () => store.list(), attachmentNames: () => store.list('attachments'),
			audioNames: () => store.list('audio'), historyNames: sub => store.list('history/' + sub),
			importReceiptNames: () => store.list('imports'), thumbNames: () => store.list('thumbs')});
		if (names.includes(OWNER_JOURNAL_FILE)) throw fail('pending', 'The notes folder has a pending save. Let it finish before making a backup.');
		for (const path of names) {
			const bytes = await store.read(path);
			if (bytes == null) throw fail('changed', 'The notes changed while the backup was collected. Try Backup again.');
			rows.push({name: path, bytes, modified: clock()});
		}
		return rows;
	};
	const backupSnapshot = async () => {
		if (store.deviceOnly) throw fail('notes_locked', 'Locked notes cannot be backed up.');
		await assertNoPendingDeletion();
		let lease;
		try {
			if (store.writable !== false && (!isShared() || locks?.request && channel?.postMessage)) lease = await owner.acquire(scope);
			const snapshot = lease ? await lease.read() : await owner.read(scope);
			await assertNoPendingDeletion();
			const first = await store.read(NOTES_INDEX_FILE), pending = await store.read(OWNER_JOURNAL_FILE);
			if (pending != null) throw fail('pending', 'A note is still being saved. Try Backup again when it has finished.');
			const receipts = await receiptMembers(snapshot.index, lease);
			let released = false;
			return {index: snapshot.index, generation: snapshot.generation,
				current: async () => { if (released) return false; await assertNoPendingDeletion(); return await digest(first) === await digest(await store.read(NOTES_INDEX_FILE)) && await store.read(OWNER_JOURNAL_FILE) == null && await receiptMembersCurrent(receipts); },
				release: async () => { if (released) return; released = true; await lease?.release(); }};
		} catch (error) { await lease?.release(); throw error; }
	};
	const capture = async () => {
		if (store.deviceOnly) throw fail('notes_locked', 'Locked notes cannot be exported.');
		await assertNoPendingDeletion();
		if (store.writable === false || isShared() && (!locks?.request || !channel?.postMessage)) {
			const first = await store.read(NOTES_INDEX_FILE), pending = await store.read(OWNER_JOURNAL_FILE), snapshot = await read();
			const receipts = await receiptMembers(snapshot.index), entries = await captureFiles();
			await assertNoPendingDeletion();
			if (!await receiptMembersCurrent(receipts)) throw fail('changed', 'An import receipt changed during backup. Nothing was certified.');
			if (await digest(first) !== await digest(await store.read(NOTES_INDEX_FILE)) || await digest(pending) !== await digest(await store.read(OWNER_JOURNAL_FILE))) throw fail('busy', 'The folder changed while the backup was collected. Try Backup again.');
			return entries;
		}
		try { return await owned(async (lease, snapshot) => { const members = await receiptMembers(snapshot.index, lease), entries = await captureFiles(); if (!await receiptMembersCurrent(members)) throw fail('changed', 'An import receipt changed during backup. Nothing was certified.'); return entries; }); }
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
	const readImportReceipt = async id => (await owner.readImportReceipt(scope, id)).receipt;
	const recordingCustody = createRecordings({store, owned, underLease, locks, scope, shared: isShared, clock, audioName, discardAudio,
		canOwn: () => store.writable !== false && (!isShared() || !!(locks?.request && channel?.postMessage)), readSnapshot: () => owner.read(scope)});
	return {beginRecording: recordingCustody.begin, recoverRecordings: recordingCustody.recover, openRecording: recordingCustody.open, readRecording: recordingCustody.preview, acknowledgeRecording: recordingCustody.acknowledge,
		admitOpen: owner.admitOpen, captureDeletionRecovery: () => owner.captureDeletion(scope), owner, store, scope, read, readCanonical: readCanonicalNote, planCanonicalChange, checkEditorInverse, rebuildIndex, metadata, controls, controlsUndo, reminderActions, reminderChange, leaveVault, create, createShared, save, recordHistory, historyInventory, tidyHistory, rename, trash, lockNote, resumeLock, discardEmpty, mark, createAudio, createAttachment, attachmentReferences, fileReferences, reviewAttachmentDeletion, deleteAttachment, reviewRecordingDeletion, deleteRecording, asset, discardAudio, importBatch, checkpointImportReceipt, readImportReceipt, restoreSnapshot, previewImportUndo, undoImport, backupSnapshot, capture, readFile, settle, get deviceId() { return deviceId; }, get pending() { return pending.size; }, close: () => { recordingCustody.close(); owner.close(); channel?.close?.(); }};
}
