import {manifestName, parseManifest, parseCanonical, recordVersion, serializeManifest} from './history.mjs';
import {readLedger} from '../kit/ledger/format.mjs';
import {preservesActs} from './canonical-merge.mjs';
import {sha256} from './integrity.mjs';

const te = new TextEncoder();
function refuse(code, message) { throw Object.assign(new Error(message), {code}); }
function sortObject(value) {
	if (value instanceof Uint8Array) return value;
	if (Array.isArray(value)) return value.map(sortObject);
	if (value && typeof value === 'object') {
		const out = {};
		for (const key of Object.keys(value).sort()) out[key] = sortObject(value[key]);
		return out;
	}
	return value;
}
const same = (left, right) => JSON.stringify(sortObject(left)) === JSON.stringify(sortObject(right));

export function verifyCanonicalNote(ledger, text, entry, content) {
	let proved;
	try { proved = readLedger(ledger, text); }
	catch (cause) { throw Object.assign(new Error('the note and its canonical history cannot be proved'), {code: 'notes_history_unavailable', cause}); }
	return verifyCanonicalBinding(proved, entry, content);
}
export function verifyCanonicalBinding(proved, entry, content) {
	if (!proved.complete || !proved.ledger.documentAuthority.startsWith('notes:') ||
		entry?.canonicalHistory !== proved.ledger.sha256 || content !== undefined && content !== proved.ledger.head.sha256)
		refuse('notes_history_unavailable', 'the note identity, source and canonical history do not agree');
	return proved;
}

export async function prepareCanonicalAdmission({store, previous, index, files, media: incomingMedia, now = Date.now}) {
	const writes = new Map(), canonical = [], byId = new Map(Object.entries(previous.index.notes).map(([file, entry]) => [entry.id, file]));
	for (const [file, value] of Object.entries(files)) {
		const entry = index.notes[file], priorFile = byId.get(entry.id), prior = priorFile && previous.files[priorFile];
		const proved = verifyCanonicalNote(value.ledger, value.text, entry, await sha256(value.bytes ?? te.encode(value.text)));
		if (prior && !preservesActs(prior.ledger, proved.ledger)) refuse('notes_history_conflict', 'sync cannot replace a retained canonical act');
		const path = 'history/' + manifestName(entry.id), before = await store.read(path);
		const retained = prior || before !== null ? parseCanonical(before, {noteId: entry.id, now: now(), text: prior?.text}) : null;
		let manifest = retained?.manifest || parseManifest(null, {noteId: entry.id, now: now()});
		if (prior && retained.ledger.sha256 !== prior.ledger.sha256) refuse('changed', 'canonical history changed before sync admission');
		if (!prior && retained && !preservesActs(retained.ledger, proved.ledger)) refuse('notes_history_conflict', 'the incoming identity does not extend its retained local history');
		canonical.push({file, id: entry.id, history: path, ledger: proved.ledger.sha256});
		const media = incomingMedia?.[entry.id] ?? manifest.media ?? [], kept = prior && priorFile === file && prior.ledger.sha256 === proved.ledger.sha256;
		if (kept && same(media, manifest.media ?? [])) continue;
		manifest = {...manifest, canonical: proved.ledger, ...(media.length ? {media} : {})};
		const recorded = kept ? {manifest, writes: []} : await recordVersion(manifest, {file, text: value.text, entry, reason: 'merge', now: now()});
		const rows = new Map(recorded.writes.map(row => ['history/' + row.name, row]));
		rows.set(path, {bytes: te.encode(serializeManifest(recorded.manifest))});
		for (const [name, row] of rows) {
			const old = name === path ? before : await store.read(name);
			if (old && await sha256(old) === await sha256(row.bytes)) continue;
			if (row.immutable && old) refuse('history', 'a kept history object changed; no note was replaced');
			writes.set(name, {file: name, bytes: row.bytes, expectedDigest: old === null ? null : await sha256(old)});
		}
	}
	return {writes, canonical, byId};
}
