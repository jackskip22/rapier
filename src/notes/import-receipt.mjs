import {assertImportReference, assertImportReferences, IMPORT_RECEIPT_LIMIT} from './import-storage.mjs';
export {IMPORT_RECEIPT_LIMIT};
// Plans are not saves. Only body read-back plus the committed identity can enter `written`.
import {exactBytes, sha256 as digestBytes, sha256State} from './integrity.mjs';
import {canonicalJSON} from './merge.mjs';
import {isNoteFile, isCodeFile, isAttachmentName, projectCard} from './model.mjs';
import {validRecordingName} from './audio.mjs';
import {finishImportCharacters} from './import-characters.mjs';
import {missingRecordingPaths} from './import-attachments.mjs';
import {resolveAssetPath} from './links.mjs';
const copy = value => JSON.parse(JSON.stringify(value));
const list = value => Array.isArray(value) ? value : [];
const bytesOf = value => exactBytes(value ?? '');
const historyFile = value => typeof value === 'string' && /^history\/(?:manifests\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}![1-9][0-9]*\.json|(?:texts|blobs)\/[a-f0-9]{64})$/.test(value);
const importedFile = value => typeof value === 'string' && (value.startsWith('attachments/') && isAttachmentName(value.slice(12)) || value.startsWith('audio/') && validRecordingName(value.slice(6)));
const sha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const digestEntry = entry => { const hash = sha256State(); hash.update(bytesOf(canonicalJSON(entry))); return hash.finish(); };
const metadata = rows => list(rows).map(row => {
	const out = {};
	for (const key of ['rootId', 'inputId', 'name', 'byteLength', 'status', 'why', 'code', 'attachment', 'files']) if (row?.[key] !== undefined) out[key] = copy(row[key]);
	if (row?.bytes instanceof Uint8Array || typeof row?.text === 'string') {
		if (!(row.bytes instanceof Uint8Array) && typeof row.text === 'string' && !row.text.isWellFormed()) {
			out.utf16Length = row.text.length;
			out.why = (out.why ? out.why + '; ' : '') + 'source contains unpaired Unicode surrogates; no exact UTF-8 byte length exists';
		} else out.byteLength ??= bytesOf(row.bytes ?? row.text).length;
		out.retainedIn = 'source input';
	}
	return out;
});

// A source field no Rapier setting holds is named once per import, not on every note: the record
// is device-local, backed up beside the sidecar, and retained in the open import journal. One
// row per source (`subject`), one field per source key, each distinct value kept once: `notes[i]`
// lists the indexes, into this record's `notes`, of the notes that carried `values[i]`, so a
// stylesheet a thousand pages share is one value. The importer's per-note rows are the plan's.
const fieldRow = row => row?.code === 'source_metadata' && object(row.fields);
function unappliedFields(notes) {
	const subjects = new Map();
	notes.forEach((note, index) => {
		for (const row of list(note.warnings).filter(fieldRow)) {
			const subject = typeof row.subject === 'string' && row.subject ? row.subject : 'Source fields';
			if (!subjects.has(subject)) subjects.set(subject, new Map());
			const fields = subjects.get(subject);
			for (const [key, value] of Object.entries(row.fields)) {
				const id = JSON.stringify(value);
				if (id === undefined) continue;
				if (!fields.has(key)) fields.set(key, {key, label: typeof row.labels?.[key] === 'string' && row.labels[key] ? row.labels[key] : key, values: [], notes: [], ids: new Map()});
				const field = fields.get(key);
				if (!field.ids.has(id)) { field.ids.set(id, field.values.length); field.values.push(JSON.parse(id)); field.notes.push([]); }
				const carried = field.notes[field.ids.get(id)];
				if (carried.at(-1) !== index) carried.push(index);
			}
		}
	});
	return [...subjects].map(([subject, fields]) => ({subject, fields: [...fields.values()].map(({key, label, values, notes}) => ({key, label, values, notes}))}));
}

// Repeated explanations live once in the record; the plan still has its per-note rows for the
// shell. Note indexes refer to the record's immutable plan, not just its completed writes. A
// Standard Notes non-note item belongs to its export, not to an invented note: a source may have
// zero notes. Only the importer's already-sanitized uuid/type/name descriptor is retained here.
const databaseRow = row => row?.code === 'database_properties';
const warningSource = row => JSON.stringify([row.rootId ?? '', row.sourceName ?? '']);
function warningSourceNotes(notes) {
	const sources = new Map();
	notes.forEach((note, index) => { const key = warningSource(note); if (!sources.has(key)) sources.set(key, []); sources.get(key).push(index); });
	return sources;
}
function foldedImportWarnings(result) {
	const out = [], groups = new Map(), notes = list(result.notes), sources = new Map(), sourceNotes = warningSourceNotes(notes);
	let items;
	for (const row of list(result.warnings)) {
		if (row?.code !== 'source_item' || !object(row.item) || typeof row.sourceName !== 'string') { out.push(copy(row)); continue; }
		if (!items) { items = {code: 'source_item', sources: []}; out.push(items); }
		const key = warningSource(row);
		if (!sources.has(key)) {
			const source = {rootId: row.rootId ?? '', sourceName: row.sourceName, notes: [...(sourceNotes.get(key) || [])], items: [], counts: []};
			sources.set(key, {source, ids: new Map()}); items.sources.push(source);
		}
		const {source, ids} = sources.get(key), id = JSON.stringify(row.item);
		if (!ids.has(id)) { ids.set(id, source.items.length); source.items.push(JSON.parse(id)); source.counts.push(0); }
		source.counts[ids.get(id)]++;
	}
	notes.forEach((note, index) => {
		for (const row of list(note.warnings).filter(databaseRow)) {
			// Identical prose folds; a different explanation or value is never silently replaced.
			const key = JSON.stringify(row);
			if (!groups.has(key)) { const group = {...copy(row), notes: []}; groups.set(key, group); out.push(group); }
			const carried = groups.get(key).notes;
			if (carried.at(-1) !== index) carried.push(index);
		}
	});
	return out;
}
function groupedWarningProblem(receipt) {
	const indexes = (value, nonempty) => Array.isArray(value) && (!nonempty || value.length) && value.every((n, i) => Number.isSafeInteger(n) && n >= 0 && n < receipt.notes.length && (!i || n > value[i - 1]));
	let sourceNotes, itemGroup = false;
	for (const row of list(receipt.warnings)) {
		if (databaseRow(row) && row.notes !== undefined && !indexes(row.notes, true)) return true;
		if (row?.code !== 'source_item' || row.sources === undefined) continue;
		if (itemGroup || !Array.isArray(row.sources) || !row.sources.length) return true;
		itemGroup = true; sourceNotes ||= warningSourceNotes(receipt.notes);
		const seen = new Set();
		for (const source of row.sources) {
			if (!object(source) || typeof source.rootId !== 'string' || typeof source.sourceName !== 'string' || !indexes(source.notes, false)
				|| !Array.isArray(source.items) || !source.items.length || !Array.isArray(source.counts) || source.counts.length !== source.items.length
				|| source.counts.some(n => !Number.isSafeInteger(n) || n < 1) || source.items.some(item => !object(item))) return true;
			const key = warningSource(source);
			if (seen.has(key) || JSON.stringify(source.notes) !== JSON.stringify(sourceNotes.get(key) || [])
				|| new Set(source.items.map(item => JSON.stringify(item))).size !== source.items.length) return true;
			seen.add(key);
		}
	}
	return false;
}

export function createImportReceipt(result, {stamp = null, id = null} = {}) {
	const out = {version: 1, id, stamp, status: 'planned', picked: metadata(result.picked),
		accounting: metadata(result.accounting), refused: metadata(result.skipped), sources: copy(result.sources ?? {}),
		notes: list(result.notes).map(note => ({rootId: note.rootId ?? '', sourceName: note.sourceName ?? note.sourcePath ?? '', file: note.file,
			title: typeof note.text === 'string' ? projectCard('', note.text).title : '',
			warnings: copy(list(note.warnings).filter(row => !fieldRow(row) && !databaseRow(row))), unresolvedLinks: copy(list(note.unresolvedLinks)),
			unresolvedPictures: copy(list(note.unresolvedPictures))})),
		written: [], sections: [], createdFiles: [], createdHistory: [], createdSections: []};
	// A repeat publishes nothing, but its returned receipt must still explain the decision.
	// The shell keeps the original durable record and stops before any second publication.
	if (result.alreadyImported || result.repeatConflict) {
		out.repeat = {kind: result.alreadyImported ? 'already-imported' : 'conflict', matchedNotes: result.repeatedNotes};
		out.status = result.alreadyImported ? 'complete' : 'failed';
	}
	const unapplied = unappliedFields(list(result.notes));
	if (unapplied.length) out.unapplied = unapplied;
	const warnings = foldedImportWarnings(result);
	if (warnings.length) out.warnings = warnings;
	if (result.backups) out.backups = list(result.backups).map(({rootId, verification, fileMap, identityMap}) => copy({rootId, verification, fileMap, identityMap}));
	return finishImportCharacters(out);
}

// This target is a transaction plan, not evidence: only the folder owner's verified commit may
// publish it. Its journal keeps the body and target together through a closed tab or failed write.
export async function prepareImportWrite(receipt, note, {entry = note.entry, created = true, digest = digestBytes} = {}) {
	return recordWrite(receipt, note, {bytes: bytesOf(note.bytes ?? note.text), entry, created}, {digest});
}

export async function verifyImportWrite(receipt, note, observed, {digest = digestBytes} = {}) {
	return recordWrite(receipt, note, observed, {digest});
}

// File creation is proved separately from note publication. A filename in the plan is never
// permission to collect it: only a read-back of the newly created bytes earns this inverse.
export async function verifyImportFile(receipt, file, expected, actual) {
	if (!['planned', 'writing'].includes(receipt.status) || !importedFile(file)) throw new Error('invalid imported file proof');
	const wanted = bytesOf(expected), got = bytesOf(actual);
	if (wanted.length !== got.length || wanted.some((byte, i) => byte !== got[i])) throw new Error('import file read-back differs: ' + file);
	if (receipt.createdFiles.some(row => row.file === file)) throw new Error('import file was already recorded');
	return {...copy(receipt), createdFiles: [...copy(receipt.createdFiles), {file, byteLength: got.length, digest: await digestBytes(got)}]};
}

// The arrival writer supplies only paths that were absent under its history lease. The receipt
// keeps their read-back proof; an existing immutable shared object earns no deletion authority.
async function historyProofs(receipt, rows, existing) {
	const proofs = [], found = existing || new Set(receipt.createdHistory.map(row => row.file)), arrived = new Set();
	for (const row of rows) {
		if (!['planned', 'writing'].includes(receipt.status) || !historyFile(row.file) || found.has(row.file) || arrived.has(row.file)) throw new Error('invalid imported history proof');
		const bytes = bytesOf(row.bytes), actual = bytesOf(row.actual);
		if (bytes.length !== actual.length || bytes.some((byte, i) => byte !== actual[i])) throw new Error('import history read-back differs: ' + row.file);
		proofs.push({file: row.file, byteLength: actual.length, digest: await digestBytes(actual)}); arrived.add(row.file);
	}
	return proofs;
}
export async function verifyImportHistory(receipt, rows) {
	const out = copy(receipt);
	for (const proof of await historyProofs(out, rows)) out.createdHistory.push(proof);
	return out;
}

export function recordImportSections(receipt, sections) {
	const found = new Map(receipt.createdSections.map(row => [row.name, row]));
	for (const section of sections) if (!found.has(section.name)) found.set(section.name, copy(section));
	return {...copy(receipt), createdSections: [...found.values()]};
}

async function writeProof(receipt, note, observed, {digest, pending, recorded}) {
	if (!['planned', 'writing'].includes(receipt.status) || !(pending ? pending.has(note.file) : receipt.notes.some(row => row.file === note.file))) throw new Error('note is not pending in this import');
	if (recorded ? recorded.has(note.file) : receipt.written.some(row => row.file === note.file)) throw new Error('note was already recorded');
	const expected = bytesOf(note.bytes ?? note.text), actual = observed?.bytes;
	if (!(actual instanceof Uint8Array) || actual.length !== expected.length || actual.some((byte, i) => byte !== expected[i])) throw new Error('import read-back differs: ' + note.file);
	if (!observed?.entry || typeof observed.entry !== 'object') throw new Error('import read-back has no sidecar entry');
	const id = observed.entry.id ?? null;
	if (id !== null && (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}:[1-9][0-9]*$/.test(id))) throw new Error('import read-back has an invalid note identity');
	if (note.entry?.id && note.entry.id !== id) throw new Error('import read-back has a different identity');
	if (typeof digest !== 'function') throw new Error('import verification needs SHA-256');
	const entryDigest = digestEntry(observed.entry), trashed = observed.entry.trashed === true, trashedAt = observed.entry.trashedAt ?? null;
	const source = observed.entry.importSource === undefined ? {} : {importSource: copy(observed.entry.importSource)};
	const hash = await digest(actual);
	if (!sha256(hash)) throw new Error('invalid SHA-256 result');
	return {file: note.file, id, digest: hash, byteLength: actual.length, created: observed.created === true,
		trashed, trashedAt, entryDigest, ...source};
}
async function recordWrite(receipt, note, observed, options) {
	const proof = await writeProof(receipt, note, observed, options), out = copy(receipt);
	out.status = 'writing'; out.written.push(proof);
	return out;
}

// One private fork for a shell landing/history batch, rather than a whole-plan copy per
// note. Nothing enters this fork before its same byte/identity/hash proof succeeds. A
// failed call leaves the exact successful prefix, and finish transfers that prefix once.
// The caller must finish in finally, including a failed read or an interrupted history
// lease. Earlier receipts/checkpoints keep their own objects; no published receipt is
// mutated, no read-back is skipped, and the serialized record has the same shape/bytes.
export function createImportReceiptWriter(receipt) {
	const out = copy(receipt), pending = new Set(out.notes.map(row => row.file)), recorded = new Set(out.written.map(row => row.file)), history = new Set(out.createdHistory.map(row => row.file));
	let open = true, busy = false;
	const run = async action => {
		if (!open || busy) throw new Error('import receipt writer is closed or busy');
		busy = true;
		try { return await action(); } finally { busy = false; }
	};
	return {
		verifyWrite(note, observed, {digest = digestBytes} = {}) { return run(async () => {
			const proof = await writeProof(out, note, observed, {digest, pending, recorded});
			out.status = 'writing'; out.written.push(proof); recorded.add(proof.file);
		}); },
		verifyHistory(rows) { return run(async () => {
			// A history arrival is atomic: one bad later row must not grant deletion
			// authority for an earlier row of that same refused arrival.
			for (const proof of await historyProofs(out, rows, history)) { out.createdHistory.push(proof); history.add(proof.file); }
		}); },
		finish() {
			if (!open || busy) throw new Error('import receipt writer is closed or busy');
			open = false; return out;
		},
	};
}

export function finishImportReceipt(receipt, {status, why, sections = []} = {}) {
	if (!['complete', 'cancelled', 'failed'].includes(status)) throw new Error('invalid import outcome');
	if (status === 'complete' && receipt.written.length !== receipt.notes.length) throw new Error('import still has unwritten notes');
	const out = copy(receipt);
	out.status = status;
	out.sections = copy(sections);
	if (why) out.why = String(why);
	return finishImportCharacters(out);
}

export function appendImportReceipt(index, receipt) {
	assertImportReference(receipt);
	const imports = assertImportReferences(index).filter(row => row?.id !== receipt.id).slice(-(IMPORT_RECEIPT_LIMIT - 1));
	return {...index, imports: [...copy(imports), copy(receipt)]};
}

// The import door's source keys, in the shell's existing words; never infer an app from a path.
export const IMPORT_SOURCE_WORDS = Object.freeze({rapier: 'a rapier backup', keep: 'a takeout export', markdown: 'markdown files', code: 'code files', notion: 'notion', evernote: 'evernote', html: 'web pages', zoho: 'zoho notebook', joplin: 'joplin', simplenote: 'simplenote', standardnotes: 'standard notes',
	textbundle: 'textbundle', dayone: 'day one', roam: 'roam research', logseq: 'logseq', paper: 'dropbox paper'});
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const get = (rows, key) => rows instanceof Map ? rows.get(key) : object(rows) && own(rows, key) ? rows[key] : undefined;
const pairs = rows => rows instanceof Map ? [...rows] : object(rows) ? Object.entries(rows) : [];
const identity = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}:[1-9][0-9]*$/.test(value) && Number.isSafeInteger(Number(value.slice(value.lastIndexOf(':') + 1)));
const noteFile = value => isNoteFile(value) && value.isWellFormed() && !/[\u0000-\u001f\u007f]/.test(value);
const count = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
const closed = status => ['complete', 'cancelled', 'failed'].includes(status);

// Archive paths and host errors are not names the person picked. Display text is never authority.
function words(value) {
	if (typeof value !== 'string') return '';
	return value.toWellFormed().replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ' ')
		.split(/\s+/u).filter(Boolean).map(word => /[/\\]|%2f|%5c|^[a-z]:/i.test(word) ? 'a source file' : word).join(' ');
}
function pickedName(row, i) {
	const name = typeof row?.name === 'string' ? row.name.split(/[/\\]/).pop() : '';
	return words(name) || 'picked input ' + (i + 1);
}
function titledNote(note, ordinal) {
	const name = words(note?.title);
	return name ? '“' + name + '”' : 'note ' + ordinal;
}
function noteName(receipt, file) {
	const at = list(receipt?.notes).findIndex(note => note?.file === file);
	return titledNote(receipt?.notes?.[at], at + 1 || 1);
}
function inputName(receipt, row, i) {
	const picked = list(receipt.picked), at = picked.findIndex(one => one?.name === row?.name && (!row?.rootId || one?.rootId === row.rootId));
	if (at >= 0) return '“' + pickedName(picked[at], at) + '”';
	const root = picked.findIndex(one => row?.rootId && one?.rootId === row.rootId);
	return 'input ' + (i + 1) + (root < 0 ? '' : ' in “' + pickedName(picked[root], root) + '”');
}
function receiptProblem(receipt) {
	if (!object(receipt) || receipt.version !== 1 || !['planned', 'writing', 'complete', 'cancelled', 'failed'].includes(receipt.status)
		|| !['notes', 'written', 'sections', 'picked', 'refused', 'accounting', 'createdFiles', 'createdHistory', 'createdSections'].every(key => Array.isArray(receipt[key]))) return 'this import record is incomplete';
	if (receipt.repeat !== undefined && (!object(receipt.repeat) || !['already-imported', 'conflict'].includes(receipt.repeat.kind)
		|| !Number.isSafeInteger(receipt.repeat.matchedNotes) || receipt.repeat.matchedNotes < 1
		|| receipt.status !== (receipt.repeat.kind === 'already-imported' ? 'complete' : 'failed')
		|| receipt.notes.length || receipt.written.length || receipt.createdFiles.length || receipt.createdHistory.length || receipt.createdSections.length)) return 'this import record is incomplete';
	const planned = new Set(), written = new Set(), ids = new Set();
	for (const note of receipt.notes) {
		if (!object(note) || !noteFile(note.file) || planned.has(note.file) || !['warnings', 'unresolvedLinks', 'unresolvedPictures'].every(key => Array.isArray(note[key]))) return 'this import record is incomplete';
		planned.add(note.file);
	}
	// Each unapplied value names the notes that carried it; a row that does not add up is not a record.
	if (receipt.unapplied !== undefined) {
		if (!Array.isArray(receipt.unapplied)) return 'this import record is incomplete';
		for (const row of receipt.unapplied) {
			if (!object(row) || typeof row.subject !== 'string' || !row.subject || !Array.isArray(row.fields) || !row.fields.length) return 'this import record is incomplete';
			for (const field of row.fields) {
				if (!object(field) || typeof field.key !== 'string' || !field.key || typeof field.label !== 'string' || !field.label
					|| !Array.isArray(field.values) || !Array.isArray(field.notes) || !field.values.length || field.values.length !== field.notes.length) return 'this import record is incomplete';
				for (const carried of field.notes) if (!Array.isArray(carried) || !carried.length
					|| carried.some((index, i) => !Number.isSafeInteger(index) || index < 0 || index >= receipt.notes.length || i && index <= carried[i - 1])) return 'this import record is incomplete';
			}
		}
	}
	if (groupedWarningProblem(receipt)) return 'this import record is incomplete';
	{
		const names = new Set();
		for (const row of receipt.createdFiles) {
			if (!object(row) || !importedFile(row.file) || names.has(row.file)
				|| !sha256(row.digest) || !Number.isSafeInteger(row.byteLength) || row.byteLength < 0) return 'this import record is incomplete';
			names.add(row.file);
		}
	}
	{
		const seen = new Set();
		for (const row of receipt.createdHistory) {
			if (!object(row) || !historyFile(row.file) || seen.has(row.file) || !sha256(row.digest) || !Number.isSafeInteger(row.byteLength) || row.byteLength < 0) return 'this import record is incomplete';
			seen.add(row.file);
		}
	}
	if (receipt.createdSections.some(row => !object(row) || typeof row.name !== 'string' || !row.name)
		|| new Set(receipt.createdSections.map(row => row.name)).size !== receipt.createdSections.length) return 'this import record is incomplete';
	for (const row of receipt.written) {
		if (!object(row) || !planned.has(row.file) || written.has(row.file) || typeof row.created !== 'boolean'
			|| !sha256(row.digest) || !Number.isSafeInteger(row.byteLength) || row.byteLength < 0) return 'this import record is incomplete';
		written.add(row.file);
		if (row.id != null) { if (!identity(row.id) || ids.has(row.id)) return 'this import record is incomplete'; ids.add(row.id); }
		if (typeof row.trashed !== 'boolean' || !Object.hasOwn(row, 'trashedAt') || row.trashedAt !== null && (!Number.isSafeInteger(row.trashedAt) || row.trashedAt < 0)) return 'this import record is incomplete';
	}
	if (receipt.undo !== undefined) {
		const undo = receipt.undo, accounted = new Set();
		if (!object(undo) || undo.kind !== 'import-undo' || !Number.isSafeInteger(undo.stamp) || undo.stamp < 0 || !Array.isArray(undo.requested) || !Array.isArray(undo.kept)) return 'this import record is incomplete';
		for (const file of undo.requested) { if (!written.has(file) || accounted.has(file)) return 'this import record is incomplete'; accounted.add(file); }
		for (const row of undo.kept) { if (!object(row) || !written.has(row.file) || accounted.has(row.file) || typeof row.why !== 'string' || !row.why) return 'this import record is incomplete'; accounted.add(row.file); }
		if (accounted.size !== written.size) return 'this import record is incomplete';
		if (undo.historyCleanup !== undefined) {
			const cleanup = undo.historyCleanup, files = new Set(list(receipt.createdHistory).filter(row => row.file.startsWith('history/manifests/')).map(row => row.file));
			if (!object(cleanup) || !Array.isArray(cleanup.requested) || !Array.isArray(cleanup.kept) || [...cleanup.requested, ...cleanup.kept].some(file => !files.has(file)) || new Set([...cleanup.requested, ...cleanup.kept]).size !== files.size) return 'this import record is incomplete';
		}
		if (undo.cleanup !== undefined) {
			const cleanup = undo.cleanup, files = new Set([...list(receipt.createdFiles), ...list(receipt.createdHistory)].filter(row => !row.file.startsWith('history/manifests/')).map(row => row.file)), named = new Set();
			if (!object(cleanup) || !Array.isArray(cleanup.requested) || !Array.isArray(cleanup.kept) || !Array.isArray(cleanup.sections) || cleanup.sections.some(name => !list(receipt.createdSections).some(row => row.name === name))) return 'this import record is incomplete';
			for (const file of cleanup.requested) { if (!files.has(file) || named.has(file)) return 'this import record is incomplete'; named.add(file); }
			for (const row of cleanup.kept) { if (!object(row) || !files.has(row.file) || named.has(row.file) || typeof row.why !== 'string' || !row.why) return 'this import record is incomplete'; named.add(row.file); }
			if (named.size !== files.size) return 'this import record is incomplete';
		}
	}
	if (receipt.status === 'complete' && written.size !== planned.size) return 'this import record is incomplete';
	if (receipt.sections.some(section => typeof section !== 'string' || !section)) return 'this import record is incomplete';
	return null;
}
export function importUndoReadiness(receipt) {
	const problem = receiptProblem(receipt);
	if (problem) return problem;
	if (receipt.undo) return 'this import was already undone';
	if (!closed(receipt.status)) return 'this import has not finished';
	if (!receipt.written.length) return 'there are no imported notes to undo';
	return null;
}
function writeProblem(row, now, current) {
	if (!row.created) return 'was not created by this import';
	if (!identity(row.id)) return 'has no verified identity';
	if (!sha256(row.digest)) return 'has no removal proof';
	const names = current.get(row.id) || [];
	if (names.length > 1) return 'has more than one current identity match';
	if (names.length === 1 && names[0] !== row.file) return 'was renamed since this import';
	if (!now || now.exists === false) return 'is no longer in this folder';
	if (now.id !== row.id) return 'is no longer the same note';
	if (now.trashed === true && row.trashed !== true) return 'was moved to trash since this import';
	if ((row.trashed === true) !== (now.trashed === true) || (now.trashedAt ?? null) !== (row.trashedAt ?? null)) return 'has a different trash state since this import';
	if (!sha256(now.digest)) return 'could not be read exactly';
	if (now.digest !== row.digest || now.byteLength !== undefined && now.byteLength !== row.byteLength) return 'changed since this import';
	return null;
}
function identities(current) {
	const out = new Map();
	for (const [file, entry] of pairs(current)) if (typeof entry?.id === 'string') {
		if (!out.has(entry.id)) out.set(entry.id, []);
		out.get(entry.id).push(file);
	}
	return out;
}

// Byte/identity candidates only. The full plan also checks metadata and the confirmation selection.
export function eligibleImportUndo(receipt, current) {
	if (importUndoReadiness(receipt)) return [];
	const ids = identities(current);
	return receipt.written.filter(row => !writeProblem(row, get(current, row.file), ids)).map(row => row.file);
}

function whenWords(stamp, now) {
	if (!Number.isSafeInteger(stamp) || stamp < 0 || stamp > 8640000000000000) return 'time not recorded';
	if (Number.isSafeInteger(now) && now >= stamp) {
		const seconds = Math.floor((now - stamp) / 1000);
		if (!seconds) return 'just now';
		for (const [unit, scale] of [['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]]) if (seconds >= scale) return count(Math.floor(seconds / scale), unit) + ' ago';
	}
	return new Date(stamp).toISOString().replace('T', ' ').replace('.000Z', 'Z').replace('Z', ' utc');
}
function fact(row, fallback) {
	return words(row?.message || row?.why || row?.reason).toLowerCase() || fallback;
}
function warningFact(row) {
	if (databaseRow(row) && Array.isArray(row.notes)) return count(row.notes.length, 'note') + ': ' + fact(row, '').replace('in this note', 'in each note');
	if (row?.code === 'source_item' && Array.isArray(row.sources)) {
		const total = row.sources.reduce((sum, source) => sum + source.counts.reduce((a, b) => a + b, 0), 0);
		return count(total, 'standard notes item') + (total === 1 ? ' was not imported because it is not a note. Its name stays' : ' were not imported because they are not notes. Their names stay').toLowerCase() + ' in this import record; keys and file contents stay in the original export.';
	}
	const known = {picture_missing: 'picture not brought in: not among the picked files', picture_ambiguous: 'picture not brought in: more than one picked file matches',
		picture_external: 'picture stays as an external link; no file was fetched',
		audio_missing: 'recording not brought in: its file is missing'};
	return known[row?.code] || fact(row, 'the importer recorded a warning without a reason');
}
// One line a source: each field once, with how many notes carried it. The values stay off the sheet;
// the line says where they are.
function unappliedFact(row) {
	const carried = new Map();
	for (const field of row.fields) {
		if (!carried.has(field.label)) carried.set(field.label, new Set());
		for (const notes of field.notes) for (const index of notes) carried.get(field.label).add(index);
	}
	return words(row.subject + ' not applied: ' + [...carried].map(([label, notes]) => label + ' (' + count(notes.size, 'note') + ')').join(', ')
		+ '. Their values stay in the original export and in this import record.').toLowerCase();
}

export function describeImportReceipt(receipt, {now} = {}) {
	const when = whenWords(receipt?.stamp, now), problem = receiptProblem(receipt);
	if (problem) return {when, title: problem, lines: ['the imported notes cannot be checked from this record'], undo: {eligible: false, why: problem}};
	if (receipt.repeat) return {when, title: receipt.repeat.kind === 'already-imported' ? 'this export is already in notes' : 'part of this export is already in notes',
		lines: [count(receipt.repeat.matchedNotes, 'note') + ' matched the exact source; nothing was imported'],
		undo: {eligible: false, why: 'this attempt did not import any notes'}};
	const n = receipt.written.length, total = receipt.notes.length, stopped = closed(receipt.status);
	const title = stopped ? (n < total ? n + ' of ' + count(total, 'note') + ' imported' : count(n, 'note') + ' imported') : count(n, 'note') + ' written; import not finished';
	const sources = object(receipt.sources) ? Object.keys(receipt.sources).filter(key => Number.isSafeInteger(receipt.sources[key]) && receipt.sources[key] >= 0) : [];
	const named = sources.filter(key => own(IMPORT_SOURCE_WORDS, key)).map(key => IMPORT_SOURCE_WORDS[key]);
	if (named.length < sources.length) named.push('another source');
	const skipped = list(receipt.refused), lines = [(named.length ? 'from ' + named.join(', ') : 'source app not recorded') + (skipped.length ? ' · ' + count(skipped.length, 'input') + ' skipped' : '')];
	if (receipt.status === 'failed') lines.push('import stopped' + (receipt.why ? ': ' + words(receipt.why).toLowerCase() : ''));
	if (receipt.status === 'cancelled') lines.push('import cancelled' + (receipt.why ? ': ' + words(receipt.why).toLowerCase() : ''));
	if (stopped && n < total) lines.push(count(total - n, 'note') + ' not recorded as written');
	for (const [i, row] of skipped.entries()) lines.push(inputName(receipt, row, i) + ' skipped: ' + fact(row, 'the importer did not record a reason'));
	for (const row of list(receipt.warnings)) lines.push(warningFact(row));
	for (const row of list(receipt.unapplied)) lines.push(unappliedFact(row));
	const written = new Set(receipt.written.map(row => row.file)), ordinals = new Map(receipt.notes.map((note, i) => [note.file, i + 1]));
	for (const note of receipt.notes) {
		const name = titledNote(note, ordinals.get(note.file)) + (written.has(note.file) ? '' : ' (not recorded as written)'), warnings = list(note.warnings);
		const pictureWarnings = new Set(warnings.map(row => JSON.stringify([row?.code, row?.dest])));
		for (const row of warnings) lines.push(name + ': ' + warningFact(row));
		for (const row of list(note?.unresolvedPictures)) {
			if (pictureWarnings.has(JSON.stringify(['picture_' + row?.reason, row?.dest]))) continue;
			lines.push(name + ': ' + warningFact({code: 'picture_' + row?.reason, reason: row?.reason ? 'picture not brought in: ' + row.reason : 'picture not brought in: no reason recorded'}));
		}
		const recordings = missingRecordingPaths(note);
		for (const row of list(note?.unresolvedLinks)) {
			if (recordings.has(resolveAssetPath(note.sourceName, row?.dest).path)) continue;
			lines.push(name + ': link left unchanged: ' + fact(row, 'no matching note was recorded'));
		}
	}
	if (receipt.undo) lines.push('undo recorded: ' + count(receipt.undo.requested.length, 'note') + ' selected for removal; ' + count(receipt.undo.kept.length, 'note') + ' kept at confirmation');
	const why = importUndoReadiness(receipt);
	return {when, title, lines, undo: {eligible: why === null, why: why || 'the notes will be checked before undo'}};
}

// Section creation keeps its small metadata record; note arrivals keep its canonical digest.
// Object key order is not an edit; every value (including a pin, colour or future field) is.
function sameValue(a, b) {
	if (a === b) return true;
	return a !== null && b !== null && typeof a === 'object' && typeof b === 'object'
		&& Array.isArray(a) === Array.isArray(b) && Object.keys(a).length === Object.keys(b).length
		&& Object.keys(a).every(key => own(b, key) && sameValue(a[key], b[key]));
}

// A changed row is kept, not a veto on the other imported rows. `files` can only narrow a
// confirmation; a note shown as kept can never re-enter that confirmation if its bytes revert.
// `keep` protects live work the shell has not saved yet. Neither option grants removal authority.
export function planImportUndo(receipt, index, texts, {files, keep = []} = {}) {
	const refuse = why => ({remove: [], kept: [], entries: [], sections: [], refuse: why});
	const readiness = importUndoReadiness(receipt);
	if (readiness) return refuse(readiness);
	if (!object(index) || index.version !== 1 || !object(index.notes) || !Array.isArray(index.sections) || !(texts instanceof Map || object(texts))
		|| Object.entries(index.notes).some(([file, entry]) => !noteFile(file) || !object(entry) || entry.trashed !== undefined && typeof entry.trashed !== 'boolean')
		|| index.sections.some(section => !object(section) || typeof section.name !== 'string' || !section.name)
		|| new Set(index.sections.map(section => section.name.toLowerCase())).size !== index.sections.length
		|| index.transaction || Object.keys(index.deletions || {}).length) return refuse('the folder must be read and recovered before undo');
	if (pairs(texts).some(([file]) => !own(index.notes, file))) return refuse('the folder changed; read it again before undo');
	const current = new Map(Object.entries(index.notes).map(([file, entry]) => [file, {...entry}]));
	for (const row of receipt.written) {
		const entry = current.get(row.file);
		if (!entry) continue;
		const value = get(texts, row.file);
		entry.exists = value != null;
		delete entry.digest; delete entry.byteLength;
		if (value != null) try {
			const bytes = exactBytes(value), hash = sha256State(); hash.update(bytes);
			entry.digest = hash.finish(); entry.byteLength = bytes.length;
		} catch (_) { /* Unreadable bytes never become deletion authority. */ }
	}
	const ids = identities(current), selected = files === undefined ? null : new Set(files), protectedFiles = new Set(keep), remove = [], kept = [];
	for (const row of receipt.written) {
		let why = protectedFiles.has(row.file) ? 'is open with work to keep' : writeProblem(row, current.get(row.file), ids);
		if (!why && !sha256(row.entryDigest)) why = 'has no verified metadata';
		if (!why) try {
			if (row.entryDigest !== digestEntry(index.notes[row.file])) why = 'has different metadata since this import';
		} catch (_) { why = 'has no verified metadata'; }
		if (!why && selected && !selected.has(row.file)) why = 'was not selected in this confirmation';
		if (why) kept.push({file: row.file, why}); else remove.push(row.file);
	}
	// Import Undo never removes code. It releases only the exact import-source claim
	// this receipt created, following a rename by identity without touching later choices.
	// `files` narrows removal only; the shell never selects preserved code for removal.
	let entries;
	try { entries = copy(Object.entries(index.notes)); }
	catch (_) { return refuse('the folder record could not be copied; nothing will be removed'); }
	const released = [];
	for (const row of receipt.written) if (isCodeFile(row.file)) {
		const at = remove.indexOf(row.file);
		if (at >= 0) { remove.splice(at, 1); kept.push({file: row.file, why: 'code bytes stay; only import bookkeeping is undone'}); }
		if (!row.created || !identity(row.id) || !sha256(row.entryDigest) || !sha256(row.importSource)) continue;
		const matches = entries.filter(([, entry]) => entry.id === row.id);
		if (matches.length === 1 && isCodeFile(matches[0][0]) && matches[0][1].importSource === row.importSource) {
			delete matches[0][1].importSource; released.push(matches[0][0]);
		}
	}
	const removing = new Set(remove);
	try {
		// A section name is not proof of its unchanged metadata. No section, media, history or
		// thumbnail is collected here; other notes may still use them.
		return {remove, kept, released, entries: entries.filter(([file]) => !removing.has(file)), sections: copy(index.sections), refuse: null};
	} catch (_) { return refuse('the folder record could not be copied; nothing will be removed'); }
}

// The receipt records the requested inverse, not an assertion that every removal happened:
// owner recovery may keep a late foreign edit. Its exact result comes from the committed listing.
export function recordImportUndo(receipt, plan, {stamp} = {}) {
	const why = importUndoReadiness(receipt);
	if (why || plan.refuse) throw new Error(why || plan.refuse);
	if (!Number.isSafeInteger(stamp) || stamp < 0) throw new Error('import undo needs a valid time');
	const out = {...copy(receipt), undo: {kind: 'import-undo', stamp, requested: plan.remove.slice(), kept: copy(plan.kept), ...(plan.released?.length ? {released: plan.released.slice()} : {})}};
	const problem = receiptProblem(out);
	if (problem) throw new Error(problem);
	return out;
}

// Cleanup runs after guarded note removal, so a late-kept note still owns its section and files.
// Only exact section metadata from the creating transaction is eligible; another note's category
// or a user's section edit wins. Media references are checked by the folder, under its lease.
export function importUndoSections(receipt, index) {
	const candidates = list(receipt.createdSections), categories = new Set(Object.values(index.notes).map(entry => entry.category));
	return index.sections.filter(section => !candidates.some(row => row.name === section.name && sameValue(row, section)) || categories.has(section.name));
}

// Names used in the Undo face follow the same picked-title privacy rule as the receipt face.
export function importUndoRows(receipt, plan) {
	return [...plan.remove.map(file => ({file, name: noteName(receipt, file), action: 'remove', why: 'is unchanged since this import'})),
		...plan.kept.map(row => ({file: row.file, name: noteName(receipt, row.file), action: 'keep', why: row.why}))];
}
