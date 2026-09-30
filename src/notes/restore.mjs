// SPDX-License-Identifier: AGPL-3.0-only
import {emptyIndex, parseIndex, isNoteFile, isMarkdownNote, noteFileName, orderAfter, serializeIndex} from './model.mjs';
import {exactBytes, sha256} from './integrity.mjs';
import {OWNER_JOURNAL_FILE} from './owner.mjs';
import {ZIP_READ_MAX_BYTES, ZIP_WRITE_METADATA_BYTES} from './zip.mjs';
import {recordingStem} from './recording-files.mjs';
import {scanLinks, resolveAssetPath} from './links.mjs';
import {manifestName, parseManifest, rekeyManifest, rewriteHistoryReferences, serializeManifest} from './history.mjs';
import {attachmentSizeWords} from './size-words.mjs';
import {SYNC_STATE_FILE} from './sync-state.mjs';

export const BACKUP_MANIFEST_FILE = 'rapier-backup.json';
export const BACKUP_INDEX_MAX_BYTES = 8 * 1024 * 1024;
// Law 57: a backup refused for size says the size in the words a person thinks in, never a byte bound.
const tooLarge = (what, bound) => new Error(what + ' is over ' + attachmentSizeWords(bound) + ', more than Rapier reads from one backup file');
const decode = bytes => new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes);
const copy = value => JSON.parse(JSON.stringify(value));
const fold = name => name.normalize('NFC').toLowerCase();
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function backupPath(name) {
	if (name === OWNER_JOURNAL_FILE) throw new Error('a folder transaction is pending; its journal is not a backup file');
	if (typeof name !== 'string' || !name || /[\\\0]/.test(name) || name.startsWith('/') || /^[a-z]:/i.test(name)
		|| name.split('/').some(part => part === '.' || part === '..' || !part)) throw new Error(`backup path is not a file relative to the folder: ${name}`);
}
function inventory(entries) {
	if (!Array.isArray(entries) || entries.length > 65534) throw new Error('a backup needs at most 65534 entries');
	const seen = new Set(); let total = 0;
	return entries.map(entry => {
		const name = entry?.name;
		backupPath(name);
		if (seen.has(name)) throw new Error(`duplicate backup file: ${name}`);
		seen.add(name);
		const bytes = exactBytes(entry.bytes ?? entry.text);
		total += bytes.length;
		if (total > ZIP_READ_MAX_BYTES) throw tooLarge('this backup', ZIP_READ_MAX_BYTES);
		return {name, bytes, ...(entry.modified === undefined ? {} : {modified: entry.modified})};
	});
}
function indexFrom(files) {
	const sidecar = files.find(file => file.name === 'notes.json');
	if (!sidecar) throw new Error('a Rapier backup needs notes.json');
	if (sidecar.bytes.length > BACKUP_INDEX_MAX_BYTES) throw tooLarge('this backup\'s notes.json', BACKUP_INDEX_MAX_BYTES);
	let text;
	try { text = decode(sidecar.bytes).replace(/^\uFEFF/, ''); }
	catch (_) { throw new Error('notes.json is not valid UTF-8'); }
	if (!text.trim()) throw new Error('notes.json is empty; this is not a complete snapshot');
	const index = parseIndex(text);
	return {index, sidecar, raw: JSON.parse(text)};
}
function coherence(files, index) {
	const present = new Set(files.filter(file => isNoteFile(file.name)).map(file => file.name));
	const missing = Object.keys(index.notes).filter(name => !present.has(name));
	const unindexed = [...present].filter(name => !Object.hasOwn(index.notes, name));
	return {missing, unindexed};
}

export function backupManifestHeader(files, {appVersion, stamp} = {}) {
	if (typeof appVersion !== 'string' || !appVersion || !Number.isFinite(stamp)) throw new Error('a backup manifest needs the app version and snapshot stamp');
	const {index} = indexFrom(files), {missing, unindexed} = coherence(files, index);
	if (index.transaction || Object.keys(index.deletions || {}).length) throw new Error('a folder transaction is pending; recover it before making a backup');
	if (missing.length || unindexed.length) throw new Error('the notes folder changed or needs reconciliation before backup: ' + [...missing, ...unindexed].join(', '));
	return {format: 'rapier-notes-backup', version: 1, appVersion, stamp, revision: index.revision ?? null, ...(index.folderGeneration === undefined ? {} : {folderGeneration: index.folderGeneration}), files: []};
}

export async function withBackupManifest(entries, {appVersion, stamp, subtle} = {}) {
	const files = inventory(entries);
	if (files.length >= 65534) throw new Error('a backup needs room for its manifest below the ZIP64 sentinel count');
	if (files.some(file => file.name === BACKUP_MANIFEST_FILE)) throw new Error('the backup manifest is generated, not a folder file');
	const manifest = backupManifestHeader(files, {appVersion, stamp});
	for (const file of files.slice().sort((a, b) => compare(a.name, b.name))) manifest.files.push({name: file.name, bytes: file.bytes.length, sha256: await sha256(file.bytes, {subtle})});
	return {manifest, entries: [...files, {name: BACKUP_MANIFEST_FILE, bytes: exactBytes(JSON.stringify(manifest, null, 1) + '\n'), modified: stamp}]};
}

function manifestFrom(bytes) {
	let manifest;
	try { manifest = JSON.parse(decode(bytes).replace(/^\uFEFF/, '')); }
	catch (_) { throw new Error('rapier-backup.json is not readable JSON'); }
	if (!manifest || manifest.format !== 'rapier-notes-backup' || manifest.version !== 1 || !Array.isArray(manifest.files)
		|| typeof manifest.appVersion !== 'string' || !manifest.appVersion || !Number.isFinite(manifest.stamp)) throw new Error('rapier-backup.json has an unsupported shape');
	return manifest;
}
// One admission for both doors, whole and lazy: the manifest's set, lengths and sidecar agreement,
// proved by size before any digest is read. The digests it declares come back for the caller to check.
function manifestDeclarations(manifest, files, index, sizeOf, partOnly = false) {
	const digests = new Map();
	if (!manifest) return digests;
	if (index.transaction || Object.keys(index.deletions || {}).length) throw new Error('a folder transaction is pending in the backup');
	if (manifest.folderGeneration !== index.folderGeneration) throw new Error('the backup manifest folder generation does not match notes.json');
	if (JSON.stringify(manifest.revision) !== JSON.stringify(index.revision ?? null)) throw new Error('the backup manifest sidecar revision does not match notes.json');
	const byName = new Map(files.map(file => [file.name, file]));
	if (manifest.files.length !== files.length) throw new Error('the backup manifest file set does not match the archive');
	for (const entry of manifest.files) {
		backupPath(entry?.name);
		if (entry.name === BACKUP_MANIFEST_FILE) throw new Error('a manifest cannot list itself');
		const file = entry && byName.get(entry.name);
		if (!file || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || !/^[0-9a-f]{64}$/.test(entry.sha256)) throw new Error('the backup manifest has a missing, duplicate or invalid file: ' + String(entry?.name));
		if (sizeOf(file) !== entry.bytes) throw new Error(`backup length mismatch: ${entry.name}`);
		digests.set(entry.name, entry.sha256); byName.delete(entry.name);
	}
	if (!partOnly) {
		const omitted = manifest.omitted || [], names = new Set(files.map(row => row.name));
		if (!Array.isArray(omitted)) throw new Error('the backup omission list is invalid');
		for (const row of omitted) {
			backupPath(row?.name);
			if (names.has(row.name) || row.name === 'notes.json' || row.name === BACKUP_MANIFEST_FILE || !Number.isSafeInteger(row.bytes) || row.bytes < 0 || typeof row.reason !== 'string' || !row.reason) throw new Error('the backup omission list is invalid');
			names.add(row.name);
		}
		const {missing, unindexed} = coherence([...files, ...omitted], index);
		if (missing.length || unindexed.length) throw new Error('the verified backup sidecar and note set disagree: ' + [...missing, ...unindexed].join(', '));
	}
	return digests;
}
function verificationOf(manifest) {
	return manifest
		? {status: 'verified', message: 'The backup file set, byte lengths and SHA-256 digests were verified.'}
		: {status: 'unverified', message: 'Restored an archive without a manifest (a folder zipped by hand, not a Rapier backup); its snapshot could not be verified.'};
}
// These are transport parts, not independent libraries. Roots keep their identity until the
// complete table has been checked; flattening first would lose duplicate/missing-part evidence.
function snapshotParts(entries) {
	if (!Array.isArray(entries) || !entries.length) throw new Error('no backup was supplied');
	if (entries.every(Array.isArray)) return entries;
	if (entries.every(row => Array.isArray(row?.entries))) return entries.map(row => row.entries);
	return rootsOf(entries).map(root => root.entries);
}
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
	? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const sameSet = manifest => canonical({...manifest, set: {...manifest.set, part: 0}});

// Used only to group input roots. It grants no admission: verifyBackup checks the whole table
// and each selected byte before Add receives a plan. Invalid manifests still reach that refusal.
export function backupSetId(entries) {
	const file = entries.find(row => row.name === BACKUP_MANIFEST_FILE);
	if (!file) return null;
	try { const value = manifestFrom(exactBytes(file.bytes ?? file.text)); return /^[0-9a-f]{64}$/.test(value.set?.id) ? value.set.id : null; }
	catch (_) { return null; }
}
function setDeclarations(manifest, index) {
	const set = manifest.set;
	if (!set || !/^[0-9a-f]{64}$/.test(set.id) || !Number.isSafeInteger(set.count) || set.count < 2 || set.count > 65533
		|| !Number.isSafeInteger(set.part) || set.part < 1 || set.part > set.count || !Array.isArray(set.parts) || set.parts.length !== set.count)
		throw new Error('the backup set has an invalid part table');
	const global = new Map(manifest.files.map(row => [row?.name, row]));
	manifestDeclarations(manifest, manifest.files.map(row => ({name: row?.name, size: row?.bytes})), index, row => row.size);
	const assigned = new Set();
	for (let i = 0; i < set.count; i++) {
		const part = set.parts[i], seen = new Set();
		if (part?.number !== i + 1 || !Array.isArray(part.files) || !part.files.length || part.files.length > 65533) throw new Error('the backup set has an invalid part file list');
		for (const row of part.files) {
			const declared = global.get(row?.name);
			if (!declared || row.bytes !== declared.bytes || row.sha256 !== declared.sha256 || seen.has(row.name)
				|| row.name !== 'notes.json' && assigned.has(row.name)) throw new Error('the backup set file lists disagree: ' + String(row?.name));
			seen.add(row.name); assigned.add(row.name);
		}
		if (!seen.has('notes.json')) throw new Error('each backup part needs the original notes.json');
	}
	if (assigned.size !== global.size) throw new Error('the backup set leaves files out of its part table');
	return set;
}
export async function verifyBackup(entries, options = {}) {
	const parts = snapshotParts(entries).map(inventory);
	const checked = await verifyBackupStream({parts: parts.map(files => ({entries: files.map(file => ({name: file.name, size: file.bytes.length, read: async () => file.bytes}))}))}, options);
	const originals = new Map();
	for (const part of parts) for (const file of part) if (!originals.has(file.name)) originals.set(file.name, file);
	return {...checked, files: checked.files.map(file => originals.get(file.name))};
}

// The same complete-set admission for byte arrays and ranged Files. Metadata is checked first;
// every selected payload and every note's UTF-8 is proved before any destination effect. Later
// reads recheck the digest, so a changed source cannot borrow this earlier certification.
export async function verifyBackupStream(archive, {subtle, signal, notes = false, partial = false} = {}) {
	const input = archive?.parts || [archive];
	if (!Array.isArray(input) || !input.length || input.length > 65533) throw new TypeError('a streamed backup needs its ZIP parts');
	const check = () => { if (signal?.aborted) throw signal.reason || new Error('backup verification was cancelled'); };
	const read = async file => {
		check(); const bytes = exactBytes(await file.read()); check();
		if (bytes.length !== file.size) throw new Error('backup length mismatch: ' + file.name);
		return bytes;
	};
	const parts = [];
	for (const part of input) {
		if (!Array.isArray(part?.entries) || part.entries.length > 65534) throw new TypeError('a streamed backup needs a bounded ZIP directory');
		const seen = new Set(); let total = 0;
		const all = part.entries.map(entry => {
			const {name, size, read} = entry || {};
			backupPath(name);
			if (seen.has(name)) throw new Error('duplicate backup file: ' + name);
			seen.add(name);
			if (!Number.isSafeInteger(size) || size < 0 || typeof read !== 'function') throw new Error('invalid backup entry: ' + name);
			total += size; if (total > ZIP_READ_MAX_BYTES) throw tooLarge('this backup', ZIP_READ_MAX_BYTES);
			return {name, size, read: () => entry.read()};
		});
		const sidecar = all.find(file => file.name === 'notes.json');
		if (!sidecar) throw new Error('a Rapier backup needs notes.json');
		if (sidecar.size > BACKUP_INDEX_MAX_BYTES) throw tooLarge('this backup\'s notes.json', BACKUP_INDEX_MAX_BYTES);
		const indexBytes = await read(sidecar), {index, raw} = indexFrom([{name: 'notes.json', bytes: indexBytes}]);
		const manifestFile = all.find(file => file.name === BACKUP_MANIFEST_FILE);
		if (manifestFile?.size > ZIP_WRITE_METADATA_BYTES) throw tooLarge('this backup\'s ' + BACKUP_MANIFEST_FILE, ZIP_WRITE_METADATA_BYTES);
		const manifest = manifestFile ? manifestFrom(await read(manifestFile)) : null;
		parts.push({files: all.filter(file => file !== manifestFile), sidecar, indexBytes, index, raw, manifest});
	}
	const first = parts[0], manifest = first.manifest, set = manifest?.set ? setDeclarations(manifest, first.index) : null;
	const numbers = new Set();
	if (set) {
		const key = sameSet(manifest);
		for (const part of parts) {
			if (!part.manifest?.set || sameSet(part.manifest) !== key) throw new Error('the backup parts are not from the same set');
			const number = part.manifest.set.part;
			if (!Number.isSafeInteger(number) || number < 1 || number > set.count) throw new Error('the backup set has an invalid part number');
			if (numbers.has(number)) throw new Error('duplicate backup part ' + number);
			numbers.add(number);
		}
	} else if (parts.length !== 1) throw new Error('Choose one backup or every part of the same set. Nothing was restored.');
	const missing = set ? set.parts.map(part => part.number).filter(number => !numbers.has(number)) : [];
	if (!partial && missing.length) throw new Error('Missing backup ' + (missing.length === 1 ? 'part ' : 'parts ') + missing.join(', ') + '. Choose every part of this set. Nothing was restored.');
	if (!partial && manifest?.omitted?.length) throw new Error('This backup omitted ' + manifest.omitted.map(row => row.name).join(', ') + '. Use Add backup to recover the files it contains. Nothing was restored.');
	const files = new Map(), digests = new Map();
	for (const part of parts) {
		const local = set ? {...part.manifest, files: set.parts[part.manifest.set.part - 1].files} : part.manifest;
		const declared = manifestDeclarations(local, part.files, part.index, file => file.size, !!set);
		for (const file of part.files) {
			const bytes = file === part.sidecar ? part.indexBytes : await read(file), digest = await sha256(bytes, {subtle}); check();
			if (local && digest !== declared.get(file.name)) throw new Error(`backup SHA-256 mismatch: ${file.name}`);
			if (notes && isNoteFile(file.name)) {
				try { decode(bytes); } catch (_) { throw new Error(`the backup note is not valid UTF-8: ${file.name}`); }
			}
			if (!files.has(file.name)) { files.set(file.name, file); digests.set(file.name, digest); }
		}
	}
	const verification = verificationOf(manifest);
	if (set || manifest?.omitted?.length) Object.assign(verification, {parts: parts.length, partCount: set?.count || 1, missingParts: missing,
		omitted: manifest.omitted || [], complete: !missing.length && !manifest.omitted?.length,
		message: 'Verified ' + parts.length + ' of ' + (set?.count || 1) + ' backup parts.' + (missing.length ? ' Missing parts: ' + missing.join(', ') + '.' : '')
			+ (manifest.omitted?.length ? ' Not included: ' + manifest.omitted.map(row => row.name).join(', ') + '.' : '')});
	return {index: first.index, rawIndex: first.raw, indexBytes: first.indexBytes, manifest, verification, files: [...files.values()].map(file => Object.freeze({
		name: file.name, size: file.size, sha256: digests.get(file.name), async read() {
			const bytes = await read(file);
			if (await sha256(bytes, {subtle}) !== digests.get(file.name)) throw new Error('the backup source changed: ' + file.name);
			check(); return bytes;
		},
	}))};
}

function notePlan(file, index, rootId) {
	let source;
	try { source = decode(file.bytes); } catch (_) { throw new Error(`the backup note is not valid UTF-8: ${file.name}`); }
	return {file: file.name, sourcePath: file.name, rootId, source, bytes: file.bytes.slice(), entry: copy(index.notes[file.name] || {}), warnings: []};
}

// The caller acquires the folder owner and rechecks emptiness before applying this plan.
// Verification finishes before any byte is offered for a write.
export async function restoreSnapshot(entries, options = {}) {
	if ((options.existing?.length || 0) || Object.keys(options.index?.notes || {}).length) throw new Error('exact restore requires an empty folder; use addBackup');
	const checked = await verifyBackup(entries, {...options, partial: false}), rootId = options.rootId || 'backup';
	const notes = checked.files.filter(file => isNoteFile(file.name)).map(file => notePlan(file, checked.index, rootId));
	return {...checked, mode: 'restore', notes, skipped: [], sections: copy(checked.index.sections), pictures: [], rootId,
		fileMap: checked.files.map(file => ({rootId, sourcePath: file.name, file: file.name}))};
}
// The exact-restore plan, lazily: a plan, not a commit. Its files and notes are read one at a time,
// each proved against the digest certified above; the folder owner lands them.
export async function restoreSnapshotStream(archive, options = {}) {
	if ((options.existing?.length || 0) || Object.keys(options.index?.notes || {}).length) throw new Error('exact restore requires an empty folder; use addBackup');
	const checked = await verifyBackupStream(archive, {...options, notes: true, partial: false}), rootId = options.rootId || 'backup';
	return {...checked, mode: 'restore', rootId, sections: copy(checked.index.sections), skipped: [], pictures: [],
		fileMap: checked.files.map(file => ({rootId, sourcePath: file.name, file: file.name})),
		async *notes() { for (const file of checked.files) if (isNoteFile(file.name)) yield notePlan({name: file.name, bytes: await file.read()}, checked.index, rootId); },
		async *entries() { for (const file of checked.files) yield {name: file.name, bytes: await file.read()}; }};
}

function rootsOf(entries, rootId) {
	if (!Array.isArray(entries)) throw new Error('backup entries must be an array');
	if (entries.every(Array.isArray) && entries.length) return entries.map((files, i) => ({rootId: String(i), entries: files}));
	if (entries.every(entry => Array.isArray(entry?.entries)) && entries.length) return entries.map((root, i) => ({rootId: String(root.id ?? root.rootId ?? i), entries: root.entries}));
	const groups = new Map();
	for (const entry of entries) {
		const id = String(entry?.rootId ?? rootId ?? 'backup');
		if (!groups.has(id)) groups.set(id, []);
		groups.get(id).push(entry);
	}
	return [...groups].map(([id, files]) => ({rootId: id, entries: files}));
}
function allocateFile(name, taken) {
	if (!taken.has(fold(name))) { taken.add(fold(name)); return name; }
	let result;
	// A note is renamed as notes are; a code file, like any other file, keeps its extension ("script 2.py").
	if (isMarkdownNote(name)) result = noteFileName(name.slice(0, -3).normalize('NFC'), [...taken]);
	else {
		const slash = name.lastIndexOf('/'), dot = name.lastIndexOf('.'), split = dot > slash ? dot : name.length;
		let n = 2;
		do { result = name.slice(0, split) + ' ' + n++ + name.slice(split); } while (taken.has(fold(result)));
	}
	while (taken.has(fold(result))) result = noteFileName(result.slice(0, -3).normalize('NFC'), [...taken]);
	taken.add(fold(result)); return result;
}

const HISTORY_OBJECT = /^history\/(?:texts|blobs)\/[0-9a-f]{64}$/;
const HISTORY_MANIFEST = /^history\/manifests\/([^/]+)\.json$/;
const encodePath = path => path.split('/').map(part => encodeURIComponent(part).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');

// A backup's notes (including historical filenames) are folder-root .md files. Resolve once
// against its SOURCE inventory, never against a partly renamed destination or another root.
// Unknown syntax stays literal; a case/normalisation alias is not authority to guess a target.
function referenceRewriter(mapping) {
	const spellings = new Map();
	for (const path of mapping.keys()) {
		const key = fold(path);
		if (!spellings.has(key)) spellings.set(key, []);
		spellings.get(key).push(path);
	}
	return text => {
		const edits = new Map();
		for (const link of scanLinks(text)) {
			if (link.kind === 'autolink' || !link.dest || /^[a-z][a-z0-9+.-]*:|^\//i.test(link.dest) || link.dest.includes('?')) continue;
			if (link.unresolvedDecode) throw new Error('Cannot identify a backup reference without the Markdown entity reader: ' + link.dest);
			let decoded;
			try { decoded = decodeURIComponent(link.dest); }
			catch (_) { throw new Error('Cannot identify a backup reference with invalid URL escaping: ' + link.dest); }
			// resolveAssetPath owns path arithmetic and decoding; do not decode a percent twice.
			const resolved = resolveAssetPath('', link.dest);
			if (resolved.outside) continue;
			let path = resolved.path;
			const wiki = link.kind === 'wikilink' || link.kind === 'embed';
			if (wiki && !mapping.has(path) && !/\.md$/i.test(path) && mapping.has(path + '.md')) path += '.md';
			const candidates = spellings.get(fold(path)) || [];
			if (candidates.length > 1 || !mapping.has(path) && candidates.some(p => mapping.get(p) !== p))
				throw new Error('The backup reference is ambiguous; cannot identify its original file: ' + link.dest);
			const target = mapping.get(path);
			if (!target || target === path) continue; // absent here means outside this backup, not missing authority to borrow another root
			let dest = encodePath(target);
			if (wiki) {
				// Keep the existing wiki form and its label/fragment, never author a different grammar.
				dest = target.replace(/[%#|[\]<>?]/g, c => encodeURIComponent(c));
				if (!/\.md$/i.test(decoded)) dest = dest.replace(/\.md$/i, '');
			}
			edits.set(link.destStart, {end: link.destEnd, dest});
		}
		let out = text;
		for (const [start, edit] of [...edits].sort((a, b) => b[0] - a[0])) out = out.slice(0, start) + edit.dest + out.slice(edit.end);
		return out;
	};
}

export async function addBackup(entries, options = {}) {
	const roots = rootsOf(entries, options.rootId), seenRoots = new Set(), grouped = new Map(), checked = [];
	for (const root of roots) {
		if (seenRoots.has(root.rootId)) throw new Error('duplicate backup root: ' + root.rootId);
		seenRoots.add(root.rootId);
		const id = backupSetId(root.entries), key = id ? 'set:' + id : 'root:' + root.rootId;
		if (!grouped.has(key)) grouped.set(key, {rootId: root.rootId, parts: []});
		grouped.get(key).parts.push(root.entries);
	}
	for (const root of grouped.values()) checked.push({...await verifyBackup(root.parts, {...options, partial: true}), rootId: root.rootId});
	if (!checked.length) throw new Error('no backup was supplied');
	if (checked.some(root => root.files.some(file => recordingStem(file.name)))) throw new Error('This backup holds an unfinished recording: restore it into an empty Notes folder, then keep or discard the recording. Nothing was added.');
	const index = options.index ? parseIndex(serializeIndex(options.index)) : emptyIndex();
	if (!options.index && Array.isArray(options.sections)) index.sections = options.sections.map(section => typeof section === 'string' ? {name: section, collapsed: false} : copy(section));
	const existing = [...(options.existing || []), ...Object.keys(index.notes)], taken = new Set(existing.map(fold));
	const usedIDs = new Set([...Object.values(index.notes).map(entry => entry.id), ...Object.keys(index.tombstones || {}), ...Object.values(index.tombstones || {}).flat().map(record => record.opId)].filter(Boolean));
	const sectionsAdded = [], sections = new Map(index.sections.map(section => [section.name.toLowerCase(), section]));
	const notes = [], files = [], fileMap = [], backups = [];
	let lastOrder = [options.lastOrder || '', ...Object.values(index.notes).map(entry => entry.order || '')].sort().at(-1) || '';
	// The complete allocation precedes materialisation; later files cannot change an earlier binding.
	for (const root of checked) {
		root.mapping = new Map(); root.fileMap = new Map();
		// The source's own sync checkpoint is not backup content: an additive import keeps the
		// destination's own connection and authority, never adopting or transplanting another
		// folder's writer identity or vault credential (docs/sync-web-session.md, "Replacing a
		// key, leaving and reconnecting").
		for (const file of root.files) if (file.name !== 'notes.json' && file.name !== SYNC_STATE_FILE) {
			// History addresses are identities, not available filenames. The writer verifies occupied
			// immutable addresses; manifests are re-keyed with their note below, never numbered.
			const final = HISTORY_OBJECT.test(file.name) || HISTORY_MANIFEST.test(file.name) ? file.name : allocateFile(file.name, taken);
			root.mapping.set(file.name, final);
			const row = {rootId: root.rootId, sourcePath: file.name, file: final};
			fileMap.push(row); root.fileMap.set(file.name, row);
		}
	}
	for (const root of checked) {
		for (const section of root.index.sections) {
			const key = section.name.toLowerCase();
			if (!sections.has(key)) { const added = copy(section); index.sections.push(added); sections.set(key, added); sectionsAdded.push(added); }
		}
		const identityMap = [], rootNotes = [], snapshotID = (await sha256(root.files.find(file => file.name === 'notes.json').bytes, options)).slice(0, 16);
		let counter = 0;
		const orderedNotes = root.files.filter(file => isNoteFile(file.name)).sort((a, b) => compare(root.index.notes[a.name]?.order || '', root.index.notes[b.name]?.order || '') || compare(a.name, b.name));
		for (const file of orderedNotes) {
			const note = notePlan(file, root.index, root.rootId), final = root.mapping.get(file.name);
			note.file = final;
			lastOrder = orderAfter(lastOrder); note.entry.order = lastOrder;
			if (note.entry.category && sections.has(note.entry.category.toLowerCase())) note.entry.category = sections.get(note.entry.category.toLowerCase()).name;
			if (note.entry.id && usedIDs.has(note.entry.id)) {
				const sourceID = note.entry.id;
				do { note.entry.id = 'backup-' + snapshotID + ':' + (++counter); } while (usedIDs.has(note.entry.id));
				identityMap.push({sourceID, id: note.entry.id, file: final});
			}
			if (note.entry.id) usedIDs.add(note.entry.id);
			index.notes[final] = copy(note.entry); notes.push(note); rootNotes.push(note);
		}
		const identities = new Map(identityMap.map(row => [row.sourceID, row.id]));
		for (const [from, to] of identities) {
			const path = 'history/' + manifestName(from);
			if (root.mapping.has(path)) {
				const target = 'history/' + manifestName(to);
				root.mapping.set(path, target);
				root.fileMap.get(path).file = target;
			}
		}
		root.renamed = [...root.mapping].some(([before, after]) => before !== after);
		const rewrite = root.renamed ? referenceRewriter(root.mapping) : null;
		const incoming = new Map(root.files.map(file => [file.name, file.bytes]));
		const materialized = new Map(root.files.filter(file => file.name !== 'notes.json' && file.name !== SYNC_STATE_FILE).map(file => [file.name,
			{...file, name: root.mapping.get(file.name), bytes: file.bytes.slice(), rootId: root.rootId, sourcePath: file.name}]));
		if (rewrite) {
			for (const note of rootNotes) {
				const source = rewrite(note.source);
				if (source !== note.source) { note.source = source; note.bytes = exactBytes(source); materialized.get(note.sourcePath).bytes = note.bytes.slice(); }
				note.warnings.push({code: 'backup-paths-renamed', message: 'Some backup paths were renamed to keep existing files. Notes and retained history use the new names for recognised, exact Markdown paths inside this backup. Other references are unchanged; review this backup’s file map.'});
			}
			for (const file of root.files) {
				const match = HISTORY_MANIFEST.exec(file.name);
				if (!match) continue;
				const from = match[1].replace('!', ':'), to = identities.get(from) || from;
				try {
					const original = parseManifest(file.bytes, {noteId: from, now: 0});
					const moved = from === to ? original : rekeyManifest(file.bytes, {from, to, now: 0}).manifest;
					const next = await rewriteHistoryReferences(moved, rewrite, name => incoming.get('history/' + name));
					if (next.changed || from !== to) materialized.get(file.name).bytes = exactBytes(serializeManifest(next.manifest));
					for (const write of next.writes) if (write.immutable) {
						const name = 'history/' + write.name, held = materialized.get(name);
						if (held) {
							if (held.bytes.length !== write.bytes.length || held.bytes.some((b, i) => b !== write.bytes[i])) throw new Error('Conflicting immutable history object: ' + name);
						} else materialized.set(name, {name, bytes: write.bytes, rootId: root.rootId, sourcePath: null});
					}
				} catch (error) { throw new Error('Cannot relocate history ' + file.name + ' in backup ' + root.rootId + ': ' + error.message); }
			}
		}
		files.push(...materialized.values());
		backups.push({rootId: root.rootId, verification: root.verification, fileMap: fileMap.filter(item => item.rootId === root.rootId), identityMap,
			sourceIndex: copy(root.rawIndex)});
	}
	return {mode: 'add', index, indexComplete: !!options.index || existing.length === 0, notes, files, sections: sectionsAdded.map(section => section.name), sectionsAdded, fileMap, backups, lastOrder,
		skipped: [], pictures: [], verification: {status: checked.every(root => root.verification.status === 'verified') ? 'verified' : 'unverified', message: 'Each source backup was checked independently; its verification is recorded in backups.'}};
}
