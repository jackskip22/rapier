// SPDX-License-Identifier: AGPL-3.0-only
// Android restores into an immutable inbox. Only the Notes owner publishes its contents.
import {createNativeByteStore} from './native-store.mjs';
import {exactBytes, sha256, digestByteChunks, storedFileDigest} from './integrity.mjs';
import {isNoteFile, isCodeFile, emptyIndex, parseIndex, validNoteId, addSection, reconcile, admitIdentities} from './model.mjs';
import {manifestName, parseManifest, serializeManifest, readCanonical, canonicalSources, rekeyManifest, recordVersion, freshCanonical, emptyManifest} from './history.mjs';
import {joinCanonical} from './canonical-merge.mjs';
import {readLedger, replaceLedgerText, exportLedger} from '../kit/ledger/format.mjs';
import {canonicalJSON} from './merge.mjs';
import {attachmentsOf} from './attachments.mjs';
import {recordingsOf} from './audio.mjs';
import {scanLinks, resolveLink} from './links.mjs';
import {aliasesOf} from './frontmatter.mjs';
import {isImportReceiptFile, readImportReceiptFile} from './import-storage.mjs';
import {backupManifestHeader, BACKUP_INDEX_MAX_BYTES} from './restore.mjs';
import {preflightBackup} from './backup-stream.mjs';
import {writeBackupSet} from './backup-set.mjs';

const hash = /^[a-f0-9]{64}$/;
const historyFile = /^history\/(?:manifests\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}![1-9][0-9]*\.json|(?:texts|blobs)\/[a-f0-9]{64})$/;
const mediaFile = /^(?:audio|attachments)\/(?!\.{1,2}$)[^/\\\x00-\x1f\x7f]+$/;
const immutableFile = /^history\/(?:texts|blobs)\/[a-f0-9]{64}$/;
const decode = bytes => new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes);
const clone = value => JSON.parse(JSON.stringify(value));
const equal = (a, b) => canonicalJSON(a) === canonicalJSON(b);
const fail = (code, message) => Object.assign(new Error(message), {code});
const safe = name => typeof name === 'string' && name.isWellFormed() && !/[\\\x00-\x1f\x7f]/.test(name) &&
	(name === 'notes.json' || isNoteFile(name) || historyFile.test(name) || mediaFile.test(name) || isImportReceiptFile(name));
const pastId = name => name.slice('history/manifests/'.length, -5).replace('!', ':');
const eventKey = row => { const {id, ...event} = row; return canonicalJSON(event); };
const thinningKey = batch => { const {removes, ...event} = batch; return canonicalJSON(event); };
const historyFields = new Set(['version', 'noteId', 'file', 'next', 'current', 'versions', 'objects', 'protected', 'thinned', 'canonical']);
function historyExtensions(local, incoming) {
	const fields = Object.entries(incoming).filter(([key]) => !historyFields.has(key));
	for (const [key, value] of fields) if (Object.hasOwn(local, key) && !equal(local[key], value)) throw fail('notes_history_conflict', 'Both histories have different kept metadata.');
	return fields;
}

// This reader has no write route, fallback store or mutable listing.
export function androidBackupSource(call, restored) {
	const manifest = restored?.manifest && clone(restored.manifest), session = restored?.id, manifestDigest = restored?.manifestDigest;
	if (typeof session !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(session) || !hash.test(manifestDigest) ||
		manifest?.version !== 1 || !Array.isArray(manifest.files) || !Array.isArray(manifest.omitted)) throw fail('android_backup_invalid', 'The Android backup has no complete manifest. Its files were kept.');
	const rows = new Map(), folded = new Set();
	for (const row of manifest.files) {
		if (!safe(row?.name) || !Number.isSafeInteger(row.size) || row.size < 0 || !hash.test(row.digest) || folded.has(row.name.normalize('NFC').toLowerCase()))
			throw fail('android_backup_invalid', 'The Android backup has an invalid or repeated file. Its files were kept.');
		rows.set(row.name, Object.freeze({...row})); folded.add(row.name.normalize('NFC').toLowerCase());
	}
	for (const row of manifest.omitted) if (!mediaFile.test(row?.name) || rows.has(row.name) || !Number.isSafeInteger(row.size) || row.size < 0)
		throw fail('android_backup_invalid', 'Android omitted required note or history data. Its files were kept.');
	const metadata = new Map();
	if (Number.isSafeInteger(restored.manifestSize) && restored.manifestSize > 0) metadata.set('android-backup/manifest.json', {name: '.rapier-android-manifest.json', size: restored.manifestSize, digest: manifestDigest});
	if (Number.isSafeInteger(manifest.settingsSize) && manifest.settingsSize > 0 && hash.test(manifest.settingsDigest)) metadata.set('android-backup/settings.json', {name: '.rapier-android-settings.json', size: manifest.settingsSize, digest: manifest.settingsDigest});
	const metadataNames = new Map([...metadata].map(([native, row]) => [row.name, native]));
	const raw = createNativeByteStore({call: async (operation, args) => {
		const op = operation.slice('notes.store.'.length);
		if (op === 'prepare') return {writable: false};
		if (op === 'read.begin' && !rows.has(args.name) && !metadataNames.has(args.name)) return {missing: true};
		if (op.startsWith('read.')) return call('notes.backup.' + op, {...args, ...(metadataNames.has(args.name) ? {name: metadataNames.get(args.name)} : {}), session});
		throw fail('android_backup_read_only', 'A restored backup is read-only.');
	}});
	const read = async name => {
		const row = rows.get(name) || metadata.get(name); if (!row) return null;
		const bytes = await raw.read(metadata.get(name)?.name || name);
		if (!bytes || bytes.length !== row.size || await sha256(bytes) !== row.digest) throw fail('android_backup_changed', 'The restored file failed verification: ' + name);
		return bytes;
	};
	return {session, manifestDigest, manifest, rows, metadata, read,
		chunks: name => raw.readChunks(metadata.get(name)?.name || name),
		async verify() { for (const row of rows.values()) if (await digestByteChunks(raw.readChunks(row.name), {size: row.size}) !== row.digest) throw fail('android_backup_changed', 'The restored file failed verification: ' + row.name); },
		async copy(name, target = name) {
			const row = rows.get(name), result = await call('notes.backup.copy', {session, name, target, digest: row.digest});
			if (result?.copied !== true || result.size !== row.size || result.digest !== row.digest) throw fail('android_backup_changed', 'The restored file copy was not verified: ' + name);
		},
		complete: () => call('notes.backup.complete', {session, manifestDigest}),
	};
}

// Event numbers are local to a manifest. Keep every incoming event and protected source,
// allocating numbers only where an event is not already represented exactly.
async function joinedHistory(local, incoming, ledger, {file, entry, now}) {
	const next = clone(local), mapped = new Map(), events = new Map(next.versions.map(row => [eventKey(row), row.id]));
	const thinned = new Map();
	for (const batch of next.thinned) for (const row of batch.removes) thinned.set(canonicalJSON({batch: thinningKey(batch), event: eventKey(row)}), row.id);
	const source = [...incoming.versions.map(row => ({row})), ...incoming.thinned.flatMap(batch => batch.removes.map(row => ({row, batch})))].sort((a, b) => a.row.id - b.row.id);
	let changed = local.canonical.sha256 !== ledger.sha256;
	for (const [key, value] of historyExtensions(local, incoming)) if (!Object.hasOwn(next, key)) { Object.defineProperty(next, key, {value: clone(value), enumerable: true, configurable: true, writable: true}); changed = true; }
	for (const {row: original, batch} of source) {
		const row = clone(original);
		if (row.restoredFrom !== undefined) { row.restoredFrom = mapped.get(row.restoredFrom); if (!row.restoredFrom) throw fail('android_backup_history', 'A restored history event lost its protected source.'); }
		const key = batch ? canonicalJSON({batch: thinningKey(batch), event: eventKey(row)}) : eventKey(row), known = (batch ? thinned : events).get(key);
		if (known) { mapped.set(original.id, known); continue; }
		row.id = next.next++; mapped.set(original.id, row.id); changed = true;
		if (batch) {
			let group = next.thinned.find(value => thinningKey(value) === thinningKey(batch));
			if (!group) { group = {...clone(batch), removes: []}; next.thinned.push(group); }
			group.removes.push(row); thinned.set(key, row.id);
		} else { next.versions.push(row); events.set(key, row.id); }
	}
	for (const id of incoming.protected) { const value = mapped.get(id); if (!value) throw fail('android_backup_history', 'A restored protected history event is missing.'); if (!next.protected.includes(value)) { next.protected.push(value); changed = true; } }
	if (!changed) return {manifest: local, writes: [], changed: false};
	for (const [key, object] of Object.entries(incoming.objects)) {
		if (next.objects[key] && !equal(next.objects[key], object)) throw fail('android_backup_history', 'Two histories disagree about a kept object. Both copies were kept.');
		next.objects[key] = clone(object);
	}
	// Build the final event through the existing recipe writer, then place it after the union.
	const recorded = await recordVersion({...clone(local), canonical: ledger}, {file, text: readLedger(ledger).text, entry, reason: 'merge', now});
	const current = {...recorded.manifest.versions.at(-1), id: next.next++};
	next.versions.push(current); next.objects = {...next.objects, ...recorded.manifest.objects};
	next.current = current.id; next.file = file; next.canonical = ledger; next.protected.sort((a, b) => a - b);
	serializeManifest(next);
	return {manifest: next, writes: recorded.writes.filter(row => row.immutable), changed: true};
}

function availableName(wanted, names, suffix = ' restored') {
	const taken = new Set(names.map(name => name.normalize('NFC').toLowerCase()));
	if (!taken.has(wanted.normalize('NFC').toLowerCase())) return wanted;
	const dot = wanted.lastIndexOf('.'), split = dot > 0 && wanted.length - dot <= 24 ? dot : wanted.length, stem = wanted.slice(0, split), ext = wanted.slice(split);
	for (let n = 1; ; n++) {
		const tail = suffix + (n === 1 ? '' : ' ' + n) + ext;
		let root = stem;
		while (exactBytes(root + tail).length > 240) root = Array.from(root).slice(0, -1).join('');
		const name = root + tail; if (!taken.has(name.normalize('NFC').toLowerCase())) return name;
	}
}

async function capturePhysical({file, entry, history, bytes, authority, actId, stamp}) {
	if (!history && entry.canonicalHistory) throw fail('android_backup_history', 'The Android backup is missing declared history for ' + file);
	let manifest = history ? parseManifest(history, {noteId: entry.id, now: 0})
		: freshCanonical(emptyManifest(entry.id), {filename: file, docKind: isCodeFile(file) ? 'code' : 'markdown'}, authority);
	let body;
	try { body = decode(bytes); }
	catch (_) { throw fail('android_backup_encoding', 'Android kept the original backup because ' + file + ' is not readable UTF-8. Its original file and history have not been converted.'); }
	const proved = readCanonical(manifest);
	if (entry.canonicalHistory && entry.canonicalHistory !== proved.ledger.sha256) throw fail('android_backup_history', 'The note does not prove its history: ' + file);
	if (history && proved.text === body) { entry.canonicalHistory = proved.ledger.sha256; return null; }
	let ledger = replaceLedgerText(proved.ledger, body, {actor: {kind: 'system', id: 'android-restore'}, operation: 'notes.restore-capture', at: stamp});
	if (ledger !== proved.ledger) {
		const read = readLedger(ledger), records = clone(ledger.records);
		records.at(-1).transaction.id = actId;
		ledger = exportLedger({text: read.text, metadata: read.metadata, records, documentAuthority: ledger.documentAuthority, revision: read.revision, root: read.root, complete: true});
	}
	entry.canonicalHistory = ledger.sha256; entry.revision = 'sha256:' + await sha256(bytes);
	const recorded = await recordVersion({...manifest, canonical: ledger}, {file, text: body, entry, reason: 'capture', now: stamp});
	manifest = recorded.manifest;
	return {manifest, historyBytes: exactBytes(serializeManifest(manifest)), writes: recorded.writes.filter(row => row.immutable)};
}

async function immutableWrites(store, rows) {
	const writes = [];
	for (const row of new Map(rows.map(row => [row.name, row])).values()) {
		const file = 'history/' + row.name, old = await storedFileDigest(store, file), expected = await sha256(row.bytes);
		if (old === expected) continue;
		if (old !== null) throw fail('android_backup_history', 'A kept history object changed. Both copies were kept.');
		writes.push({file, bytes: row.bytes, createOnly: true});
	}
	return writes;
}

async function inspectSource(source) {
	await source.verify();
	const bytes = await source.read('notes.json'), rawIndex = bytes == null ? emptyIndex() : parseIndex(decode(bytes).replace(/^\ufeff/, ''));
	const names = [...source.rows.keys()].filter(isNoteFile).sort(), index = reconcile(rawIndex, names).index;
	admitIdentities(index, 'android-' + source.manifestDigest.slice(0, 32));
	const ids = new Set(), referenced = new Set(), normalized = new Map(), links = [], aliases = new Map();
	const references = (file, manifest) => {
		if (isCodeFile(file)) return;
		for (const {text} of canonicalSources(manifest)) {
			for (const row of attachmentsOf(text)) referenced.add('attachments/' + row.name);
			for (const row of recordingsOf(text)) referenced.add('audio/' + row.name);
			for (const link of scanLinks(text)) if (link.dest && !/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(link.dest)) links.push({from: file, link});
		}
	};
	let ordinal = 0;
	for (const [file, entry] of Object.entries(index.notes)) {
		ordinal++;
		if (!source.rows.has(file) || !validNoteId(entry.id) || ids.has(entry.id)) throw fail('android_backup_invalid', 'The Android backup is missing a note or repeats its identity.');
		ids.add(entry.id);
		const history = await source.read('history/' + manifestName(entry.id));
		const captured = await capturePhysical({file, entry, history, bytes: await source.read(file),
			authority: 'notes:android-' + source.manifestDigest.slice(0, 32) + ':' + ordinal,
			actId: 'android-restore:' + source.manifestDigest + ':' + ordinal,
			stamp: Number.isSafeInteger(source.manifest.createdAt) && source.manifest.createdAt >= 0 ? source.manifest.createdAt : 0});
		if (captured) normalized.set(file, captured);
		const manifest = captured?.manifest || parseManifest(history, {noteId: entry.id, now: 0});
		aliases.set(file, isCodeFile(file) ? [] : aliasesOf(readCanonical(manifest).text));
		references(file, manifest);
	}
	for (const row of source.rows.values()) {
		if (!row.name.startsWith('history/manifests/')) continue;
		const manifest = parseManifest(await source.read(row.name), {noteId: pastId(row.name), now: 0});
		for (const [digest, object] of Object.entries(manifest.objects)) {
			if (source.rows.get('history/texts/' + digest)?.size !== object.textBytes || object.blobs.some(blob => source.rows.get('history/blobs/' + blob.hash)?.size !== blob.size))
				throw fail('android_backup_history', 'The Android backup is missing a history object: ' + row.name);
		}
		if (!ids.has(manifest.noteId)) references(manifest.file, manifest);
	}
	for (const receipt of index.imports || []) await readImportReceiptFile(receipt, source.read);
	const bindings = links.map(row => ({...row, target: resolveLink(row.link, {from: row.from, files: names, aliases}).file})).filter(row => row.target);
	return {index, referenced, normalized, bindings};
}

// Relative note links belong to the same filename namespace as their original source.
// Preview only the existing copy/merge choice, before copying dependencies or capturing a
// local provider save. Historical links cannot be repaired by changing only today's body.
async function assertNoteBindings(current, incoming, source, store, stamp) {
	if (!incoming.bindings.length && !current.files.length) return;
	const occupied = current.files.slice(), destinations = new Map(), aliases = new Map(), localLinks = [], identities = new Map(Object.entries(current.index.notes).map(([file, entry]) => [file, entry.id]));
	const localHistory = async (file, id) => {
		if (!file) return null;
		const history = await store.read('history/' + manifestName(id)), bytes = await store.read(file), entry = clone(current.index.notes[file]);
		const captured = await capturePhysical({file, entry, history, bytes, authority: 'notes:' + id,
			actId: 'android-local-capture:' + source.manifestDigest + ':' + await sha256(bytes), stamp});
		return captured?.manifest || parseManifest(history, {noteId: id, now: 0});
	};
	for (const file of current.files) {
		if (isCodeFile(file)) { aliases.set(file, []); continue; }
		const manifest = await localHistory(file, identities.get(file));
		aliases.set(file, aliasesOf(readCanonical(manifest).text));
		for (const {text} of canonicalSources(manifest)) for (const link of scanLinks(text))
			if (link.dest && !/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(link.dest)) localLinks.push({from: file, link});
	}
	const localFiles = new Set(current.files), localBindings = localLinks.map(row => {
		const target = resolveLink(row.link, {from: row.from, files: localFiles, aliases}).file;
		return {...row, target, id: identities.get(target)};
	}).filter(row => row.target);
	if (!incoming.bindings.length && !localBindings.length) return;
	let ordinal = 0;
	for (const [original, entry] of Object.entries(incoming.index.notes)) {
		ordinal++;
		const copyId = 'android-' + source.manifestDigest.slice(0, 32) + ':' + ordinal;
		const saved = incoming.normalized.get(original)?.manifest || parseManifest(await source.read('history/' + manifestName(entry.id)), {noteId: entry.id, now: 0});
		let id = entry.id, file = Object.keys(current.index.notes).find(name => current.index.notes[name].id === id), ledger = saved.canonical;
		if (!file && await store.read('history/' + manifestName(id)) != null) { id = copyId; file = Object.keys(current.index.notes).find(name => current.index.notes[name].id === id); }
		const local = await localHistory(file, id);
		if (local) {
			try { historyExtensions(local, saved); ledger = joinCanonical(local.canonical, saved.canonical); }
			catch (error) {
				if (error.code !== 'notes_history_conflict') throw error;
				id = copyId; file = Object.keys(current.index.notes).find(name => current.index.notes[name].id === id);
				const copied = await localHistory(file, id); ledger = copied ? joinCanonical(copied.canonical, saved.canonical) : saved.canonical;
			}
		}
		file ||= availableName(original, occupied);
		if (!occupied.includes(file)) occupied.push(file);
		destinations.set(original, {file, id}); identities.set(file, id);
		aliases.set(file, isCodeFile(file) ? [] : aliasesOf(readLedger(ledger).text));
	}
	// Exact local filenames outrank aliases; another authored alias can make a formerly
	// unique link ambiguous. Compare the actual projected resolver result, even when no
	// incoming filename changes, with the identity that this source originally reached.
	const files = new Set(occupied);
	for (const {from, link, target} of incoming.bindings) {
		const expected = destinations.get(target), resolved = resolveLink(link, {from: destinations.get(from)?.file || from, files, aliases});
		if (!expected || resolved.file !== expected.file || identities.get(resolved.file) !== expected.id) throw fail('android_backup_conflict',
			'Android kept a restored backup because a kept note link would no longer reach its original note: ' + target + '. Use Export restored backup to keep those links and their history together.');
	}
	for (const {from, link, target, id} of localBindings) {
		const resolved = resolveLink(link, {from, files, aliases});
		if (resolved.file !== target || identities.get(resolved.file) !== id) throw fail('android_backup_conflict',
			'Android kept a restored backup because an existing note link would no longer reach its original note: ' + target + '. Use Export restored backup to keep both folders and their history.');
	}
}

export async function restoreAndroidSnapshot(folder, source, {now = Date.now} = {}) {
	const incoming = await inspectSource(source), store = folder.store, lease = await folder.owner.acquire(folder.scope);
	let restored = 0, merged = 0, copied = 0;
	try {
		let current = await lease.read();
		const restoreStamp = now();
		await assertNoteBindings(current, incoming, source, store, restoreStamp);
		for (const row of source.manifest.omitted) if (incoming.referenced.has(row.name) && await store.stat(row.name) !== null) throw fail('android_backup_conflict',
			'Android kept a restored backup because its omitted file cannot be checked against an existing file: ' + row.name + '. Use Export restored backup and keep the original full backup.');
		const {folderDeviceId: localDevice, folderGeneration: localGeneration, noteCounters: localCounters, ...localMetadata} = current.index;
		const fresh = current.files.length === 0 && equal(localMetadata, emptyIndex());
		const support = [], targets = new Map([...source.rows].map(([name, row]) => [name, row.digest]));
		for (const row of source.rows.values()) {
			if (!mediaFile.test(row.name) && !immutableFile.test(row.name) && !isImportReceiptFile(row.name)) continue;
			const held = await storedFileDigest(store, row.name);
			if (held === row.digest) continue;
			let target = row.name;
			if (held !== null) {
				if (!mediaFile.test(row.name) || incoming.referenced.has(row.name)) throw fail('android_backup_conflict', 'Android kept a restored backup with a different file named ' + row.name + '. Export both copies before resolving this file.');
				const slash = row.name.indexOf('/'), prefix = row.name.slice(0, slash), wanted = row.name.slice(slash + 1);
				const occupied = [wanted];
				for (;;) {
					const name = availableName(wanted, occupied, ' restored ' + source.manifestDigest.slice(0, 8)); target = prefix + '/' + name;
					const digest = await storedFileDigest(store, target);
					if ((!targets.has(target) || targets.get(target) === row.digest) && (digest === null || digest === row.digest)) break;
					occupied.push(name);
				}
			}
			targets.set(target, row.digest);
			support.push({...row, target});
		}
		// No current note changes before every colliding immutable dependency is admitted.
		for (const row of support) {
			await source.copy(row.name, row.target);
			if (await storedFileDigest(store, row.target) !== row.digest) throw fail('android_backup_changed', 'A restored dependency changed: ' + row.target);
		}
		if (fresh) current = await lease.transact(({index}) => {
			const {notes, folderDeviceId, folderGeneration, ownerNotice, transaction, deletions, ...metadata} = clone(incoming.index);
			return {kind: 'android-restore-metadata', index: {...metadata, notes: index.notes, folderDeviceId: index.folderDeviceId, folderGeneration: index.folderGeneration}};
		});
		const localHistory = async (file, id) => {
			if (!file) return null;
			const path = 'history/' + manifestName(id), history = await store.read(path), body = await store.read(file), entry = clone(current.index.notes[file]);
			const digest = await sha256(body), captured = await capturePhysical({file, entry, history, bytes: body,
				authority: 'notes:' + id, actId: 'android-local-capture:' + source.manifestDigest + ':' + digest, stamp: restoreStamp});
			if (!captured) return parseManifest(history, {noteId: id, now: 0});
			const writes = [{file, bytes: body, expectedDigest: digest}, ...await immutableWrites(store, captured.writes),
				{file: path, bytes: captured.historyBytes, expectedDigest: history == null ? null : await sha256(history)}];
			current = await lease.transact(({index}) => {
				index.notes[file] = entry;
				return {kind: 'android-restore-capture', index, writes, canonical: [{file, id, history: path, ledger: captured.manifest.canonical.sha256}]};
			});
			return captured.manifest;
		};
		const consumed = new Set();
		let ordinal = 0;
		for (const [original, entry] of Object.entries(incoming.index.notes)) {
			ordinal++;
			const captured = incoming.normalized.get(original), body = await source.read(original), historyPath = 'history/' + manifestName(entry.id), historyBytes = captured?.historyBytes || await source.read(historyPath);
			consumed.add(historyPath);
			const saved = parseManifest(historyBytes, {noteId: entry.id, now: 0});
			let file = Object.keys(current.index.notes).find(name => current.index.notes[name].id === entry.id), id = entry.id, incomingHistory = saved, bytes = body, manifest = saved, ledger = saved.canonical, historyWrites = captured?.writes || [];
			if (!file && await store.read(historyPath) != null) {
				id = 'android-' + source.manifestDigest.slice(0, 32) + ':' + ordinal;
				file = Object.keys(current.index.notes).find(name => current.index.notes[name].id === id);
				incomingHistory = rekeyManifest(historyBytes, {from: entry.id, to: id, now: 0}).manifest;
			}
			let local = await localHistory(file, id);
			if (local) {
				try { historyExtensions(local, incomingHistory); ledger = joinCanonical(local.canonical, incomingHistory.canonical); }
				catch (error) {
					if (error.code !== 'notes_history_conflict') throw error;
					id = 'android-' + source.manifestDigest.slice(0, 32) + ':' + ordinal;
					file = Object.keys(current.index.notes).find(name => current.index.notes[name].id === id);
					incomingHistory = rekeyManifest(historyBytes, {from: entry.id, to: id, now: 0}).manifest;
					local = await localHistory(file, id);
					ledger = local ? joinCanonical(local.canonical, incomingHistory.canonical) : incomingHistory.canonical;
					copied++;
				}
			}
			if (!file) {
				file = availableName(original, current.files);
				if (await store.read('history/' + manifestName(id)) != null) throw fail('android_backup_conflict', 'A restored history identity is already occupied. Both copies were kept.');
			}
			const retained = current.index.notes[file], nextEntry = {...clone(retained || entry), id, canonicalHistory: ledger.sha256};
			manifest = incomingHistory;
			if (local) {
				const joined = await joinedHistory(local, incomingHistory, ledger, {file, entry: nextEntry, now: restoreStamp});
				manifest = joined.manifest; historyWrites = [...historyWrites, ...joined.writes]; bytes = exactBytes(readLedger(ledger).text);
				if (!joined.changed && await storedFileDigest(store, file) === await sha256(bytes)) continue;
				merged++;
			} else restored++;
			nextEntry.revision = 'sha256:' + await sha256(bytes);
			const path = 'history/' + manifestName(id), previous = await store.read(path), manifestBytes = id === entry.id && manifest === saved ? historyBytes : exactBytes(serializeManifest(manifest));
			const writes = [{file, bytes, ...(retained ? {expectedDigest: await storedFileDigest(store, file)} : {createOnly: true})}];
			writes.push(...await immutableWrites(store, historyWrites));
			writes.push({file: path, bytes: manifestBytes, expectedDigest: previous == null ? null : await sha256(previous)});
			current = await lease.transact(({index}) => {
				index.notes[file] = nextEntry;
				if (nextEntry.category) index = addSection(index, nextEntry.category);
				return {kind: 'android-restore', index, writes, canonical: [{file, id, history: path, ledger: ledger.sha256}]};
			});
		}
		// Histories whose note was deleted still belong to the person. Keep their original bytes.
		for (const row of source.rows.values()) if (row.name.startsWith('history/manifests/') && !consumed.has(row.name)) {
			const bytes = await source.read(row.name), old = await storedFileDigest(store, row.name);
			if (old === row.digest) continue;
			let file = row.name, value = bytes;
			if (old !== null) {
				const id = 'android-' + source.manifestDigest.slice(0, 32) + ':' + ++ordinal;
				file = 'history/' + manifestName(id); value = exactBytes(serializeManifest(rekeyManifest(bytes, {from: pastId(row.name), to: id, now: 0}).manifest));
				if (await storedFileDigest(store, file) === await sha256(value)) continue;
			}
			current = await lease.transact(({index}) => ({kind: 'android-restore-history', index, writes: [{file, bytes: value, createOnly: true}]}));
		}
		current = await lease.transact(({index}) => {
			const sections = new Set(index.sections.map(row => row.name.toLowerCase()));
			for (const section of incoming.index.sections) if (!sections.has(section.name.toLowerCase())) { index.sections.push(clone(section)); sections.add(section.name.toLowerCase()); }
			if (!Object.keys(index.notes).some(file => !incoming.index.notes[file]) && !index.imports?.length && incoming.index.imports?.length) index.imports = clone(incoming.index.imports);
			return {kind: 'android-restore-metadata', index};
		});
		return {restored, merged, copied, omitted: source.manifest.omitted.length, index: current.index};
	} finally { await lease.release(); }
}

export async function restoreAndroidBackups(folder, call, options) {
	const pending = await call('notes.backup.pending', {});
	if (!Array.isArray(pending?.sessions)) throw fail('android_backup_invalid', 'Android did not return its restored backups.');
	const results = [], held = [];
	for (const session of pending.sessions) {
		try {
			const source = androidBackupSource(call, session), result = await restoreAndroidSnapshot(folder, source, options);
			const completed = await source.complete();
			if (completed?.completed !== true) throw fail('android_backup_changed', 'The restored notes were kept, but Android has not retired the source backup.');
			results.push(result);
		} catch (error) { held.push({session: session.id, error}); }
	}
	if (held.length) throw Object.assign(new AggregateError(held.map(row => row.error), held.map(row => row.error.message).join(' ')), {code: 'android_backup_held', restored: results, held});
	return results;
}

// Export is byte custody, not a repair of an unreadable source. A valid held snapshot
// gets the existing Rapier ZIP declaration; an unsupported one is labelled recovery files.
// Every original Notes path and the exact native metadata bytes remain independently readable.
export async function exportAndroidBackup(call, session, createSink, {appVersion, stamp = Date.now(), name, signal, onProgress, onPart, maxBytes} = {}) {
	if (typeof onPart !== 'function') throw new TypeError('A restored backup export needs its destination callback.');
	const pending = await call('notes.backup.pending', {}), record = pending?.sessions?.find(row => row.id === session);
	if (!record) throw fail('android_backup_changed', 'That restored backup is no longer in the Android inbox.');
	const source = androidBackupSource(call, record);
	await source.verify();
	if (!source.metadata.has('android-backup/manifest.json')) throw fail('android_backup_invalid', 'The original Android manifest is not available for export.');
	const inventory = [...source.rows.values()].map(row => ({...row, original: row.name}));
	for (const [original, row] of source.metadata) { await source.read(original); inventory.push({...row, original}); }
	inventory.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
	const byName = new Map(inventory.map(row => [row.name, row]));
	const indexBytes = await source.read('notes.json');
	let header, recovery = false;
	try {
		const inspected = await inspectSource(source);
		if (inspected.normalized.size) throw new Error('The original physical snapshot needs reconciliation.');
		header = backupManifestHeader(inventory.map(row => ({name: row.name, ...(row.name === 'notes.json' ? {bytes: indexBytes} : {})})), {appVersion, stamp});
	} catch (_) {
		recovery = true;
		header = {format: 'rapier-android-restored-files', version: 1, appVersion, stamp, files: []};
	}
	header.androidRestore = {manifestDigest: source.manifestDigest, source: source.manifest,
		manifestFile: '.rapier-android-manifest.json', ...(source.metadata.has('android-backup/settings.json') ? {settingsFile: '.rapier-android-settings.json'} : {})};
	const options = {appVersion, stamp, manifestHeader: header, maxIndexBytes: Math.max(indexBytes?.length || 0, BACKUP_INDEX_MAX_BYTES),
		comment: (recovery ? 'Android restored files for recovery' : 'Rapier notes backup from Android restore') + ', ' + inventory.length + ' files, ' + new Date(stamp).toISOString()};
	const plan = preflightBackup(inventory, {...options, ...(maxBytes === undefined ? {} : {maxBytes})});
	if (plan.omitted.length) throw fail('android_backup_export_limit', 'An original file cannot fit whole in a readable ZIP: ' + plan.omitted.map(row => row.name).join(', ') + '. The complete Android snapshot is still kept.');
	const current = async () => (await call('notes.backup.pending', {}))?.sessions?.some(row => row.id === session && row.manifestDigest === source.manifestDigest) === true;
	const files = async function* (names) {
		const wanted = new Set(names);
		for (const row of inventory) if (wanted.has(row.name)) yield {name: row.name, size: row.size, modified: source.manifest.createdAt || stamp, chunks: () => source.chunks(row.original)};
	};
	let accepted = 0;
	const result = await writeBackupSet(files, createSink, {plan, name, ...options, signal, onProgress, assertCurrent: current,
		onPrepared: manifest => { for (const row of manifest.files) if (byName.get(row.name)?.digest !== row.sha256) throw fail('android_backup_changed', 'An original restored file changed before export: ' + row.name); },
		onPart: async part => { const kept = await onPart({...part, recovery, session, totalParts: plan.parts.length}); if (kept !== false) accepted++; return kept; }});
	return {...result, recovery, completed: accepted === plan.parts.length};
}
