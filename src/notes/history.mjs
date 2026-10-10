// SPDX-License-Identifier: AGPL-3.0-only
// Objects hold bytes; events hold intent. Neither is note identity.
import {canonicalNote, canonicalIndex, canonicalJSON} from './merge.mjs';
import {projectCard, isNoteFile, validNoteId as validId} from './model.mjs';
import {sha256State} from './integrity.mjs';
import {exportLedger, readLedger, textRoot, rootAfter, replaceLedgerText} from '../kit/ledger/format.mjs';
import {_rapierMetadataDelta, _rapierTransformMetadata, _rapierTransformSplices} from '../kit/ledger/journal-records.mjs';
import {selectiveUndo} from '../kit/ledger/history.mjs';

export const HISTORY_VERSION = 2;
// Words typed since the last settled save reach the folder while the editor still holds them as one open typing group, with no act of
// its own. They are kept as provisional records with this operation: the next input replaces them, and a save of the editor's own
// ledger supersedes them, so the editor's history never has to contain a record it did not make.
export const INPUT_OPERATION = 'notes.input';
export const REASONS = Object.freeze(['save', 'import', 'import-undo', 'rename', 'restore', 'trash', 'untrash', 'merge', 'capture', 'edit-card']);
export const DEFAULT_POLICY = Object.freeze({allDays: 7, dailyDays: 90, maxBytes: 268435456});
export const DIFF_LIMITS = Object.freeze({characters: 1000000, lines: 12000, steps: 250000, traceCells: 1000000});
const ENC = new TextEncoder();
const HEX = /^[0-9a-f]{64}$/;
const validHash = value => typeof value === 'string' && HEX.test(value);
const DAY = 86400000;
const own = (o, k) => Object.hasOwn(o, k);
const record = o => !!o && typeof o === 'object' && !Array.isArray(o);
const integer = n => Number.isSafeInteger(n) && n >= 0;
const fault = (code, message) => Object.assign(new Error(message), {code});
const requireThat = (ok, message, code = 'corrupt') => { if (!ok) throw fault(code, message); };
const clone = value => JSON.parse(canonicalJSON(value));
const equal = (a, b) => canonicalJSON(a) === canonicalJSON(b);
const validFile = file => isNoteFile(file) && !/[\u0000-\u001f\u007f]/.test(file);
function time(ms) { requireThat(integer(ms) && ms <= 253402300799999, 'Pass a time in milliseconds, from 1970 through 9999', 'time'); return ms; }
function bytesOf(value) {
	if (value instanceof Uint8Array) return value;
	if (value instanceof ArrayBuffer) return new Uint8Array(value);
	throw fault('bytes', 'An object must be bytes');
}
function decode(bytes) { return new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytesOf(bytes)); }
function entryCopy(file, entry, noteId) {
	requireThat(validFile(file), 'A history event needs a note filename', 'file');
	requireThat(record(entry) && entry.id === noteId && validId(noteId), 'Admit the note identity before recording history', 'identity');
	return JSON.parse(canonicalIndex({version: 1, notes: {[file]: entry}})).notes[file];
}
export function manifestName(noteId) {
	requireThat(validId(noteId), 'A manifest needs an admitted note identity', 'identity');
	return 'manifests/' + noteId.replace(':', '!') + '.json';
}
export function emptyManifest(noteId) {
	manifestName(noteId);
	return {version: HISTORY_VERSION, noteId, file: null, next: 1, current: null, versions: [], objects: {}, protected: [], thinned: [], canonical: null};
}

export function sha256Fallback(value) {
	const hash = sha256State(); hash.update(bytesOf(value)); return hash.finish();
}
export async function sha256(value, {subtle = globalThis.crypto?.subtle} = {}) {
	const bytes = bytesOf(value);
	if (!subtle) return sha256Fallback(bytes);
	const digest = new Uint8Array(await subtle.digest('SHA-256', bytes));
	return Array.from(digest, x => x.toString(16).padStart(2, '0')).join('');
}

// This scan compresses literal spans, never decides what Markdown means.
function dataSpans(text) {
	const spans = [];
	let line = 0, fuel = text.length * 4 + 4096;
	while (line < text.length && fuel > 0) {
		let p = line;
		if (p === 0 && text[p] === '\ufeff') p++;
		while (text[p] === ' ' || text[p] === '\t') p++;
		if (text[p] === '[') {
			let depth = 1, steps = 0; p++;
			while (p < text.length && depth && steps++ < 4096 && fuel-- > 0) {
				const ch = text[p++];
				if (ch === '\\') { if (p < text.length) p++; }
				else if (ch === '[') depth++;
				else if (ch === ']') depth--;
			}
			if (!depth && text[p] === ':') {
				p++;
				while (/[ \t\r\n]/.test(text[p] || '\0') && fuel-- > 0) p++;
				const angle = text[p] === '<'; if (angle) p++;
				if (text.slice(p, p + 5).toLowerCase() === 'data:') {
					const start = p; let comma = false;
					while (p < text.length && fuel-- > 0 && !(angle ? text[p] === '>' : /[\s<>]/u.test(text[p]))) {
						if (text[p] === ',') comma = true;
						p++;
					}
					if (fuel > 0 && comma && (!angle || text[p] === '>')) { spans.push([start, p]); line = p; }
				}
			}
		}
		while (line < text.length && text[line] !== '\r' && text[line] !== '\n') line++;
		if (text[line] === '\r' && text[line + 1] === '\n') line += 2; else line++;
	}
	return spans;
}
async function split(text) {
	const parts = [], blobs = new Map(), byText = new Map();
	let at = 0;
	for (const [start, end] of dataSpans(text)) {
		if (start > at) parts.push({text: text.slice(at, start)});
		const literal = text.slice(start, end);
		let hash = byText.get(literal);
		if (!hash) { const bytes = ENC.encode(literal); hash = await sha256(bytes); byText.set(literal, hash); blobs.set(hash, bytes); }
		parts.push({blob: hash}); at = end;
	}
	if (at < text.length || !parts.length) parts.push({text: text.slice(at)});
	return {parts, blobs};
}
// The one recipe writer. Relocation and a normal save produce the same immutable objects.
async function textObject(exact, hash) {
	const size = ENC.encode(exact).length, {parts, blobs} = await split(exact);
	const recipe = ENC.encode(JSON.stringify({version: HISTORY_VERSION, size, parts}) + '\n');
	return {object: {size, textBytes: recipe.length, blobs: [...blobs].map(([hash, data]) => ({hash, size: data.length})).sort((a, b) => a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0)},
		writes: [...blobs].map(([hash, bytes]) => ({name: 'blobs/' + hash, bytes, immutable: true})).concat({name: 'texts/' + hash, bytes: recipe, immutable: true})};
}
function validatePolicy(raw) {
	requireThat(record(raw) && integer(raw.allDays) && integer(raw.dailyDays) && raw.dailyDays >= raw.allDays && integer(raw.maxBytes), 'Invalid retention policy', 'policy');
	return clone(raw);
}
function inspectManifest(raw) {
	requireThat(record(raw), 'A history manifest must be an object');
	if (Number.isInteger(raw.version) && raw.version > HISTORY_VERSION) throw Object.assign(fault('newer', 'This history was written by a newer reader'), {version: raw.version});
	requireThat(raw.version === HISTORY_VERSION, 'Unsupported history version; keep its original bytes', 'unsupported');
	const m = clone(raw);
	requireThat(validId(m.noteId) && integer(m.next) && m.next > 0 && record(m.objects) && Array.isArray(m.versions) && Array.isArray(m.protected) && Array.isArray(m.thinned), 'Invalid history manifest shape');
	requireThat(own(m, 'canonical'), 'No canonical history declaration');
	const canonical = m.canonical === null ? null : readLedger(m.canonical);
	if (canonical !== null) {
		const proved = canonical;
		requireThat(proved.complete && proved.ledger.documentAuthority.startsWith('notes:'), 'The complete Notes history is unavailable');
	}
	const ids = new Map(), referenced = new Set(), seen = new Set();
	let previous = 0;
	for (const v of m.versions) {
		requireThat(record(v) && integer(v.id) && v.id > previous && v.id < m.next && validHash(v.hash) && REASONS.includes(v.reason) && integer(v.size) && typeof v.title === 'string', 'Invalid history event');
		time(v.time); entryCopy(v.file, v.entry, m.noteId);
		requireThat(own(m.objects, v.hash), 'A history event has no content object');
		requireThat(m.objects[v.hash].size === v.size, 'A history event has the wrong content size');
		if (v.reason === 'restore') requireThat(integer(v.restoredFrom) && v.restoredFrom > 0 && v.restoredFrom < v.id, 'A restore must name an earlier event');
		else requireThat(!own(v, 'restoredFrom'), 'Only a restore names a restore source');
		previous = v.id; ids.set(v.id, v); referenced.add(v.hash); seen.add(v.id);
	}
	for (const [hash, o] of Object.entries(m.objects)) {
		requireThat(validHash(hash) && record(o) && integer(o.size) && integer(o.textBytes) && o.textBytes > 0 && Array.isArray(o.blobs) && referenced.has(hash), 'Invalid or unaccounted history object');
		const hashes = new Set();
		for (const b of o.blobs) { requireThat(record(b) && validHash(b.hash) && integer(b.size) && !hashes.has(b.hash), 'Invalid blob reference'); hashes.add(b.hash); }
	}
	const pins = new Set(m.protected);
	requireThat(pins.size === m.protected.length && m.protected.every(id => integer(id) && ids.has(id)), 'A protected event must still exist');
	for (const v of m.versions) if (v.reason === 'restore') requireThat(pins.has(v.restoredFrom) && ids.get(v.restoredFrom)?.hash === v.hash, 'A restore lost its source');
	for (const batch of m.thinned) {
		requireThat(record(batch) && Array.isArray(batch.removes) && batch.removes.length > 0, 'Invalid thinning ledger'); time(batch.time); validatePolicy(batch.policy);
		for (const gone of batch.removes) {
			requireThat(record(gone) && integer(gone.id) && gone.id > 0 && gone.id < m.next && !seen.has(gone.id) && validHash(gone.hash) && ['daily', 'weekly', 'budget'].includes(gone.reason), 'Invalid thinning record');
			time(gone.time);
			if (own(gone, 'restoredFrom')) requireThat(integer(gone.restoredFrom) && gone.restoredFrom < gone.id && pins.has(gone.restoredFrom) && ids.get(gone.restoredFrom)?.hash === gone.hash, 'A thinned restore lost its protected source');
			seen.add(gone.id);
		}
	}
	requireThat(seen.size === m.next - 1, 'An event disappeared without a thinning record');
	if (m.versions.length) requireThat(m.current === m.versions.at(-1).id && m.file === m.versions.at(-1).file && m.current === m.next - 1, 'The current event must be the last certified save');
	else requireThat(m.next === 1 && m.current === null && m.file === null && !m.protected.length && !m.thinned.length, 'An empty manifest cannot forget events');
	return {manifest: m, canonical};
}
function validateManifest(raw) { return inspectManifest(raw).manifest; }
function manifestWrite(m) { return {name: manifestName(m.noteId), bytes: ENC.encode(JSON.stringify(m) + '\n'), immutable: false}; }
export function serializeManifest(manifest) { return JSON.stringify(validateManifest(manifest)) + '\n'; }
function parseHistory(value, {noteId, now} = {}) {
	manifestName(noteId); time(now);
	if (value == null) return {manifest: emptyManifest(noteId), canonical: null};
	const bytes = typeof value === 'string' ? ENC.encode(canonicalNote(value)) : bytesOf(value).slice();
	try {
		const admitted = inspectManifest(JSON.parse(decode(bytes)));
		requireThat(admitted.manifest.noteId === noteId, 'The manifest belongs to another note');
		return admitted;
	} catch (cause) {
		const code = ['newer', 'unsupported'].includes(cause.code) ? cause.code : 'corrupt';
		const name = 'refused/' + noteId.replace(':', '!') + '.' + code + '.' + new Date(now).toISOString().replace(/:/g, '-') + '.' + sha256Fallback(bytes) + '.json';
		throw Object.assign(fault(code, code === 'newer' ? 'Keep this history; open it with its newer reader' : 'Keep this unreadable history; never replace it with an empty one'), {
			cause, ...(code === 'newer' ? {version: cause.version} : {}), original: bytes,
			writes: [{name, bytes: bytes.slice(), immutable: true}], replaceOriginal: false
		});
	}
}
export function parseManifest(value, options) { return parseHistory(value, options).manifest; }
// Joint byte/body admission returns the same proof as readCanonical without parsing it twice.
export function parseCanonical(value, {text, ...options} = {}) {
 const admitted = parseHistory(value, options);
 return {...canonicalFrom(admitted, text), manifest: admitted.manifest};
}
// A restored note given a new identity carries its past: only the manifest keys move; every event and object stays byte-identical.
export function rekeyManifest(value, {from, to, now} = {}) {
	manifestName(from); manifestName(to); time(now);
	const m = parseManifest(value, {noteId: from, now});
	if (from === to) return {manifest: m, writes: [], moved: false};
	m.noteId = to;
	for (const v of m.versions) v.entry = {...v.entry, id: to};
	const checked = validateManifest(m);
	return {manifest: checked, writes: [manifestWrite(checked)], moved: true, was: manifestName(from)};
}
// import-undo records the removed note's own title and byte size, just as trash does.
export async function recordVersion(manifest, {file, text, entry, reason, now, restoredFrom} = {}) {
	const m = validateManifest(manifest);
	time(now); requireThat(REASONS.includes(reason), 'Unknown history reason', 'reason');
	const snapshot = entryCopy(file, entry, m.noteId), exact = canonicalNote(text), bytes = ENC.encode(exact), hash = await sha256(bytes);
	const current = m.versions.at(-1);
	if (reason === 'restore') {
		const source = m.versions.find(v => v.id === restoredFrom);
		requireThat(source && source.hash === hash, 'A restore must use its named source bytes', 'restore');
	} else requireThat(restoredFrom === undefined, 'Only restore may name a source', 'restore');
	if ((reason === 'save' || reason === 'import' && current?.reason === 'import') && current && current.hash === hash && current.file === file && equal(current.entry, snapshot)) {
		return {manifest: m, writes: [], version: clone(current), unchanged: true};
	}
	requireThat(m.next < Number.MAX_SAFE_INTEGER, 'History event counter exhausted', 'counter');
	const writes = [];
	if (!own(m.objects, hash)) {
		const known = new Set(Object.values(m.objects).flatMap(o => o.blobs.map(b => b.hash)));
		const made = await textObject(exact, hash);
		writes.push(...made.writes.filter(w => !w.name.startsWith('blobs/') || !known.has(w.name.slice(6))));
		m.objects[hash] = made.object;
	}
	const version = {id: m.next++, file, time: now, reason, hash, size: bytes.length, entry: snapshot, title: projectCard(file, exact).title};
	if (reason === 'restore') { version.restoredFrom = restoredFrom; if (!m.protected.includes(restoredFrom)) m.protected.push(restoredFrom); m.protected.sort((a, b) => a - b); }
	m.versions.push(version); m.current = version.id; m.file = file;
	writes.push(manifestWrite(m));
	return {manifest: m, writes, version: clone(version), unchanged: false};
}
export function versionsOf(manifest, file = manifest.file) {
	const m = validateManifest(manifest);
	if (file !== m.file && !m.versions.some(v => v.file === file)) return [];
	return m.versions.map(v => ({id: v.id, file: v.file, time: v.time, reason: v.reason, hash: v.hash, size: v.size, title: v.title, ...(v.restoredFrom === undefined ? {} : {restoredFrom: v.restoredFrom})}));
}
export async function materialize(manifest, id, readObject) {
	const m = validateManifest(manifest), v = m.versions.find(v => v.id === id);
	requireThat(v, 'That history event does not exist', 'missing');
	requireThat(typeof readObject === 'function', 'Pass an object reader', 'reader');
	async function read(name) {
		const value = await readObject(name);
		requireThat(value != null, 'History object missing: ' + name, 'missing');
		return bytesOf(value).slice();
	}
	const meta = m.objects[v.hash], raw = await read('texts/' + v.hash);
	requireThat(raw.length === meta.textBytes, 'History text object size changed', 'integrity');
	let recipe;
	try { recipe = JSON.parse(decode(raw)); } catch (cause) { throw Object.assign(fault('integrity', 'Unreadable history text object'), {cause}); }
	requireThat(record(recipe) && recipe.version === HISTORY_VERSION && recipe.size === v.size && Array.isArray(recipe.parts) && recipe.parts.length > 0, 'Invalid history text recipe', 'integrity');
	const referenced = new Map(meta.blobs.map(b => [b.hash, b.size])), fetched = new Map(), pieces = [];
	let size = 0;
	for (const part of recipe.parts) {
		requireThat(record(part) && Object.keys(part).length === 1 && (typeof part.text === 'string' || (typeof part.blob === 'string' && validHash(part.blob))), 'A text part must be literal text or a typed blob reference', 'integrity');
		let data;
		if (own(part, 'text')) data = ENC.encode(canonicalNote(part.text));
		else {
			requireThat(referenced.has(part.blob), 'Unlisted history blob', 'integrity');
			data = fetched.get(part.blob);
			if (!data) { data = await read('blobs/' + part.blob); requireThat(data.length === referenced.get(part.blob) && await sha256(data) === part.blob, 'History blob failed verification', 'integrity'); fetched.set(part.blob, data); }
		}
		size += data.length; requireThat(size <= v.size, 'History expansion exceeds its certified size', 'integrity'); pieces.push(data);
	}
	requireThat(size === v.size && fetched.size === referenced.size, 'Incomplete history text or unused blob references', 'integrity');
	const bytes = new Uint8Array(size); let at = 0;
	for (const data of pieces) { bytes.set(data, at); at += data.length; }
	requireThat(await sha256(bytes) === v.hash, 'Materialized note failed verification', 'integrity');
	return {text: decode(bytes), bytes, entry: clone(v.entry), file: v.file, hash: v.hash};
}
// Relocate the incoming copy, not the meaning of materialize(). First verify its old
// objects; changed source gets NEW addresses through the normal recipe writer. No event-time
// overlay, receipt lookup or mutable bytes under an old hash. The event IDs and intent survive.
export async function rewriteHistoryReferences(manifest, rewrite, readObject) {
	const m = validateManifest(manifest);
	requireThat(typeof rewrite === 'function', 'Pass the backup root reference rewriter', 'rewrite');
	// A renamed archive path must not retarget an old act to another person's file.
	// Preserve exact historical source and refuse relocation when its original binding is lost.
	if (m.canonical) for (const source of canonicalSources(m))
		requireThat(canonicalNote(await rewrite(source.text)) === source.text,
			'Canonical history references cannot be relocated without their original file bindings', 'notes_history_unavailable');
	const hashes = new Map(), made = new Map(), versions = new Map(m.versions.map(v => [v.hash, v]));
	for (const [hash, v] of versions) {
		const before = await materialize(m, v.id, readObject), after = canonicalNote(await rewrite(before.text));
		const next = after === before.text ? hash : await sha256(ENC.encode(after));
		hashes.set(hash, next);
		if (next !== hash && !own(m.objects, next) && !made.has(next)) made.set(next, await textObject(after, next));
	}
	if ([...hashes].every(([a, b]) => a === b)) return {manifest: m, writes: [], changed: false};
	const objects = {}, writes = new Map();
	for (const next of hashes.values()) if (!own(objects, next)) {
		objects[next] = m.objects[next] || made.get(next).object;
		for (const w of made.get(next)?.writes || []) writes.set(w.name, w);
	}
	for (const v of m.versions) { v.hash = hashes.get(v.hash); v.size = objects[v.hash].size; }
	// A thinned restore still certifies its protected source. Move that hash with the source too.
	for (const batch of m.thinned) for (const gone of batch.removes) if (hashes.has(gone.hash)) gone.hash = hashes.get(gone.hash);
	m.objects = objects;
	const checked = validateManifest(m);
	return {manifest: checked, writes: [...writes.values(), manifestWrite(checked)], changed: true};
}
export async function restorePlan(manifest, id, current, readObject) {
	const m = validateManifest(manifest);
	requireThat(record(current), 'Pass the current note snapshot', 'current');
	const entry = entryCopy(current.file, current.entry, m.noteId), hash = await sha256(ENC.encode(canonicalNote(current.text)));
	const target = await materialize(m, id, readObject);
	return {...target, file: current.file, historicalFile: target.file, restoredFrom: id,
		recordFirst: !m.versions.some(v => v.hash === hash && v.file === current.file && equal(v.entry, entry)),
		expected: {file: current.file, hash, entry}, reason: 'restore'};
}

function inventory(manifests) {
	requireThat(Array.isArray(manifests), 'Pass the complete folder manifest inventory', 'inventory');
	const copies = manifests.map(validateManifest), ids = new Set();
	for (const m of copies) { requireThat(!ids.has(m.noteId), 'Duplicate note in history inventory', 'inventory'); ids.add(m.noteId); }
	return copies.sort((a, b) => a.noteId < b.noteId ? -1 : a.noteId > b.noteId ? 1 : 0);
}
function objectSizes(manifests) {
	const texts = new Map(), blobs = new Map();
	for (const m of manifests) for (const [hash, o] of Object.entries(m.objects)) {
		if (texts.has(hash)) requireThat(equal(texts.get(hash), o), 'Conflicting descriptions of one immutable text object', 'integrity');
		else texts.set(hash, o);
		for (const b of o.blobs) {
			requireThat(!blobs.has(b.hash) || blobs.get(b.hash) === b.size, 'Conflicting sizes of one immutable blob', 'integrity'); blobs.set(b.hash, b.size);
		}
	}
	return {texts, blobs};
}
function measured(manifests) {
	const {texts, blobs} = objectSizes(manifests);
	const textBytes = [...texts.values()].reduce((n, o) => n + o.textBytes, 0), blobBytes = [...blobs.values()].reduce((n, b) => n + b, 0);
	const manifestBytes = manifests.reduce((n, m) => n + manifestWrite(m).bytes.length, 0);
	return {versions: manifests.reduce((n, m) => n + m.versions.length, 0), objects: texts.size, bytes: textBytes + blobBytes + manifestBytes, textBytes, manifestBytes, blobs: blobs.size, blobBytes};
}
export function storage(manifestOrInventory) { return measured(inventory(Array.isArray(manifestOrInventory) ? manifestOrInventory : [manifestOrInventory])); }
function ordinal(day) {
	requireThat(typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day), 'dayOf must return a YYYY-MM-DD local date', 'calendar');
	const value = Date.parse(day + 'T00:00:00.000Z');
	requireThat(Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === day, 'dayOf returned an impossible local date', 'calendar');
	return value / DAY;
}
export function thin(manifests, policy = DEFAULT_POLICY, {now, dayOf, complete = false, extraBytes = 0} = {}) {
	requireThat(complete === true, 'No object deletion without a complete, locked folder inventory', 'inventory');
	time(now); requireThat(typeof dayOf === 'function', 'Pass the person\'s local calendar', 'calendar');
	requireThat(integer(extraBytes), 'Account for unmodelled occupied bytes', 'inventory');
	const before = inventory(manifests), p = validatePolicy(policy), today = ordinal(dayOf(now));
	const after = [], removes = [], writes = [];
	let dailyFloorOverWeekly = 0;
	for (const m of before) {
		const days = new Map(), weeks = new Map(), ages = new Map(), protectedIds = new Set(m.protected);
		const currentHash = m.versions.find(v => v.id === m.current)?.hash;
		for (const v of m.versions) {
			const day = ordinal(dayOf(v.time)), age = today - day;
			ages.set(v.id, age); days.set(day, v.id);
			if (age >= p.dailyDays) weeks.set(Math.floor((day + 3) / 7), v.id);
			if (v.hash === currentHash || age < p.allDays) protectedIds.add(v.id);
		}
		for (const id of days.values()) protectedIds.add(id);
		const weekly = new Set(weeks.values());
		for (const id of days.values()) if (ages.get(id) >= p.dailyDays && !weekly.has(id)) dailyFloorOverWeekly++;
		for (const id of weekly) protectedIds.add(id);
		const gone = m.versions.filter(v => !protectedIds.has(v.id)).map(v => ({id: v.id, hash: v.hash, time: v.time, reason: ages.get(v.id) < p.dailyDays ? 'daily' : 'weekly', ...(v.restoredFrom === undefined ? {} : {restoredFrom: v.restoredFrom})}));
		if (!gone.length) { after.push(m); continue; }
		const next = {...m, versions: m.versions.filter(v => protectedIds.has(v.id)), objects: {...m.objects}, thinned: [...m.thinned, {time: now, policy: p, removes: gone}]};
		const live = new Set(next.versions.map(v => v.hash));
		for (const hash of Object.keys(next.objects)) if (!live.has(hash)) delete next.objects[hash];
		after.push(next); writes.push(manifestWrite(next));
		for (const goneEvent of gone) removes.push({noteId: m.noteId, ...goneEvent});
	}
	const oldObjects = objectSizes(before), newObjects = objectSizes(after);
	const textsFree = [...oldObjects.texts.keys()].filter(hash => !newObjects.texts.has(hash)).sort();
	const blobsFree = [...oldObjects.blobs.keys()].filter(hash => !newObjects.blobs.has(hash)).sort();
	const totals = measured(after), bytes = totals.bytes + extraBytes;
	return {manifests: after, writes, removes, textsFree, blobsFree, storage: totals,
		budget: {maxBytes: p.maxBytes, bytes, extraBytes, overBy: Math.max(0, bytes - p.maxBytes), limitedByProtection: bytes > p.maxBytes},
		dailyFloorOverWeekly};
}

function linesOf(text) {
	const out = []; let at = 0;
	while (at < text.length) {
		if (out.length === DIFF_LIMITS.lines) return null;
		let end = at;
		while (end < text.length && text[end] !== '\r' && text[end] !== '\n') end++;
		if (text[end] === '\r' && text[end + 1] === '\n') end += 2; else if (end < text.length) end++;
		out.push(text.slice(at, end)); at = end;
	}
	return out;
}
export function diffLines(a, b) {
	requireThat(typeof a === 'string' && typeof b === 'string', 'A line diff needs two strings', 'text');
	let work = 0, cells = 0;
	const refused = reason => ({tooLarge: true, reason, edits: [], work, traceCells: cells});
	if (a.length + b.length > DIFF_LIMITS.characters) return refused('characters');
	const left = linesOf(a), right = linesOf(b);
	if (!left || !right || left.length + right.length > DIFF_LIMITS.lines) return refused('lines');
	const n = left.length, m = right.length;
	const maxD = Math.min(n + m, Math.floor(Math.sqrt(DIFF_LIMITS.traceCells))), offset = maxD + 1;
	const v = new Int32Array(2 * maxD + 3); v.fill(-1); v[offset + 1] = 0;
	const trace = [];
	function result(d) {
		let x = n, y = m; const reversed = [];
		for (let depth = d; depth > 0; depth--) {
			const old = trace[depth], k = x - y;
			const previousK = k === -depth || (k !== depth && old[offset + k - 1] < old[offset + k + 1]) ? k + 1 : k - 1;
			const previousX = old[offset + previousK], previousY = previousX - previousK;
			while (x > previousX && y > previousY) { reversed.push({op: 'equal', line: left[--x]}); y--; }
			if (x === previousX) reversed.push({op: 'insert', line: right[--y]});
			else reversed.push({op: 'delete', line: left[--x]});
		}
		while (x > 0 && y > 0) { reversed.push({op: 'equal', line: left[--x]}); y--; }
		const edits = [];
		for (const e of reversed.reverse()) { if (edits.at(-1)?.op === e.op) edits.at(-1).lines.push(e.line); else edits.push({op: e.op, lines: [e.line]}); }
		return {tooLarge: false, edits, work, traceCells: cells};
	}
	for (let d = 0; d <= maxD; d++) {
		if (cells + v.length > DIFF_LIMITS.traceCells) return refused('trace');
		trace.push(v.slice()); cells += v.length;
		for (let k = -d; k <= d; k += 2) {
			if (work === DIFF_LIMITS.steps) return refused('work'); work++;
			let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
			let y = x - k;
			while (x < n && y < m && left[x] === right[y]) { if (work === DIFF_LIMITS.steps) return refused('work'); work++; x++; y++; }
			v[offset + k] = x;
			if (x >= n && y >= m) return result(d);
		}
	}
	return refused('distance');
}

// What a row of the face says its version changed, so versions saved in the same minute can be told apart: the first words that differ
// from the version before it ("+" for words that came in, "-" for words that went), cut at a few words; the first version has no
// version before it and gives the words the note began with. Pure, linear in the two texts, never an authority: a version whose words are
// the same as the one before it (a rename, a card's metadata) says nothing.
export function changePreview(before, after, {words = 6, limit = 48} = {}) {
	requireThat((before == null || typeof before === 'string') && typeof after === 'string', 'A change preview needs strings', 'text');
	const few = text => {
		const all = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
		let out = all.slice(0, words).join(' ');
		const points = Array.from(out);
		if (points.length > limit) out = points.slice(0, limit - 1).join('');
		return out + (all.length > words || points.length > limit ? '…' : '');
	};
	if (before == null) return few(after);
	if (before === after) return '';
	let start = 0;
	const room = Math.min(before.length, after.length);
	while (start < room && before.charCodeAt(start) === after.charCodeAt(start)) start++;
	while (start > 0 && !/\s/.test(after[start - 1])) start--;
	let end = 0;
	while (end < room - start && before.charCodeAt(before.length - 1 - end) === after.charCodeAt(after.length - 1 - end)) end++;
	const came = after.slice(start, after.length - end), went = before.slice(start, before.length - end);
	if (came.trim()) return '+ ' + few(came);
	if (went.trim()) return '− ' + few(went);
	return 'spacing';
}

// The manifest owns the single canonical ledger. Snapshot event numbers are projections only.
// Reuse only this synchronous admission's proof. Returned manifests remain mutable, so
// no validation result survives into another call or a later owner/storage boundary.
function canonicalFrom({canonical}, text) {
 requireThat(canonical !== null, 'This note has no provable canonical history; its bytes were kept', 'notes_history_unavailable');
 requireThat(text === undefined || text === canonical.text, 'The note and its canonical history do not agree', 'notes_history_unavailable');
 return canonical;
}
export function readCanonical(manifest, text) { return canonicalFrom(inspectManifest(manifest), text); }
// The canonical history without its provisional input records, which are removed from the end by reversing their splices.
function withoutInput(read) {
 const records = read.ledger.records;
 let keep = records.length;
 while (keep && records[keep - 1].transaction.operation === INPUT_OPERATION) keep--;
 if (keep === records.length) return read;
 let text = read.text, metadata = read.metadata;
 for (let at = records.length - 1; at >= keep; at--) {
  text = _rapierTransformSplices(text, records[at].splices, true);
  metadata = text === null ? null : _rapierTransformMetadata(metadata, records[at].metadata, true);
  requireThat(text !== null && metadata, 'The provisional input cannot be removed from this history', 'notes_history_unavailable');
 }
 const ledger = exportLedger({text, metadata, records: records.slice(0, keep), documentAuthority: read.ledger.documentAuthority, complete: read.complete});
 return readLedger(ledger, text, metadata);
}
export function canonicalAct(record) {
 if (!record) return null;
 const tx = record.transaction;
 return {id: tx.id, document_id: tx.documentAuthority, base_revision: tx.baseRevision, revision: tx.revision,
  author: {kind: tx.actor.kind, ...(tx.actor.name ? {name: tx.actor.name} : {})},
  at: Number.isSafeInteger(tx.createdAt) && tx.createdAt > 0 && Number.isFinite(new Date(tx.createdAt).getTime()) ? new Date(tx.createdAt).toISOString() : null,
  operation: tx.operation, ...(tx.turnId ? {turn_id: tx.turnId} : {}),
  ...(record.changeSet && Object.hasOwn(record.changeSet, 'label') ? {label: record.changeSet.label} : {}),
  ...(tx.sourceTransactionIds?.length || tx.sourceTransactionId ? {reverses: tx.sourceTransactionIds || [tx.sourceTransactionId]} : {})};
}
export function freshCanonical(manifest, metadata, authority = 'notes:' + globalThis.crypto.randomUUID()) {
 const m = validateManifest(manifest);
 requireThat(m.canonical === null && !m.versions.length, 'Existing history cannot be reset', 'notes_history_unavailable');
 m.canonical = exportLedger({text: '', metadata, records: [], documentAuthority: authority, revision: 0, root: textRoot(''), complete: true});
 return m;
}
// A kept copy of a stale window's words continues the ledger that window holds: the copy starts from it, whole.
export function adoptCanonical(manifest, ledger, text) {
 const m = validateManifest(manifest), after = readLedger(ledger, text);
 requireThat(m.canonical === null && !m.versions.length && after.complete, 'Existing history cannot be replaced', 'notes_history_unavailable');
 m.canonical = after.ledger;
 return {manifest: m, ledger: after.ledger, act: after.revision ? canonicalAct(after.ledger.records.at(-1)) : null, unchanged: false};
}
export function carryCanonical(manifest, ledger, text) {
 const admitted = inspectManifest(manifest), m = admitted.manifest, held = canonicalFrom(admitted), before = withoutInput(held), after = readLedger(ledger, text);
 requireThat(after.complete && after.ledger.documentAuthority === before.ledger.documentAuthority &&
  after.ledger.start.revision === before.ledger.start.revision && equal(after.ledger.start, before.ledger.start) &&
  after.ledger.records.length >= before.ledger.records.length && before.ledger.records.every((row, i) => equal(row, after.ledger.records[i])),
  'The live ledger does not extend this note history', 'notes_history_unavailable');
 m.canonical = after.ledger;
 return {manifest: m, ledger: after.ledger, act: after.revision === before.revision ? null : canonicalAct(after.ledger.records.at(-1)), unchanged: after.ledger.sha256 === held.ledger.sha256};
}
export function appendCanonical(manifest, {text, metadata, author, transport = 'platform', requestId = null, requestScope = null,
 requestDigest = null, turn_id, label, operation = 'notes.write', now, undo, input = false} = {}) {
 const admitted = inspectManifest(manifest), m = admitted.manifest, held = canonicalFrom(admitted);
 // Input replaces the provisional records it follows; every other write follows them as history.
 const before = input ? withoutInput(held) : held;
 if (input) operation = INPUT_OPERATION;
 // Trust the admitted identity, never the display name or an external actor string.
 requireThat(author && ['human', 'agent', 'system'].includes(author.kind) && typeof author.id === 'string' && author.id,
  'The original author is unavailable', 'notes_author_unavailable');
 if (requestScope) {
  const prior = before.ledger.records.find(row => row.transaction.requestScope === requestScope);
  if (prior) {
   requireThat(prior.transaction.requestDigest === requestDigest, 'This request was already used for different bytes', 'notes_request_conflict');
   return {manifest: m, ledger: before.ledger, act: canonicalAct(prior), unchanged: false, replayed: true, text: before.text};
  }
 }
 let splices, effect, afterMetadata = metadata || before.metadata, inverse = [];
 if (undo) {
  const plan = selectiveUndo({source: before.text, metadata: before.metadata, records: before.ledger.records,
   revision: before.revision, earliestRevision: before.ledger.start.revision}, undo);
  requireThat(plan.ok, 'The selected act cannot be undone from this history', 'notes_history_unavailable');
  text = plan.after; splices = plan.splices; effect = plan.metadata; afterMetadata = plan.afterMetadata;
  inverse = plan.sourceTransactionIds;
 } else {
  text = canonicalNote(text);
  // The canonical replacement writer already owns Unicode-safe exact source ranges.
  const replacement = replaceLedgerText(before.ledger, text, {actor: author, operation, at: now});
  splices = replacement === before.ledger || text === before.text ? [] : replacement.records.at(-1).splices;
  effect = _rapierMetadataDelta(before.metadata, afterMetadata);
 }
 if (!splices.length && !effect && !inverse.length) {
  // Typing back to the settled words leaves no provisional record, and the folder drops the old one.
  if (before === held) return {manifest: m, ledger: before.ledger, act: null, unchanged: true, text};
  m.canonical = before.ledger;
  return {manifest: m, ledger: before.ledger, act: null, unchanged: false, text};
 }
 let root = before.root; for (const row of splices) root = rootAfter(root, row);
 const tx = {id: 'act:' + globalThis.crypto.randomUUID(), documentAuthority: before.ledger.documentAuthority,
  baseRevision: before.revision, revision: before.revision + 1, actor: clone(author), transport, operation,
  requestId, sourceTransactionId: inverse.length === 1 ? inverse[0] : null,
  ...(inverse.length > 1 ? {sourceTransactionIds: inverse} : {}),
  affectedBlockIds: [], parent: before.ledger.records.at(-1)?.transaction.id || null, reverts: null, reapplies: null,
  createdAt: now, ...(turn_id ? {turnId: turn_id} : {}),
  ...(requestScope ? {requestScope, requestDigest} : {})};
 const row = {transaction: tx, splices, beforeHash: before.root, afterHash: root, ...(effect ? {metadata: effect} : {}),
  ...(label !== undefined ? {changeSet: {label}} : {})};
 m.canonical = exportLedger({text, metadata: afterMetadata, records: [...before.ledger.records, row],
  documentAuthority: tx.documentAuthority, revision: tx.revision, root, complete: true});
 return {manifest: m, ledger: m.canonical, act: canonicalAct(row), unchanged: false, text};
}

// Retention may thin snapshot projections, but every canonical source remains a media custody root.
export function *canonicalSources(manifest) {
 const admitted = inspectManifest(manifest);
 if (!admitted.canonical) return;
 const proved = canonicalFrom(admitted); let text = proved.ledger.start.text;
 yield {text, act: null, time: null};
 for (const row of proved.ledger.records) {
  text = _rapierTransformSplices(text, row.splices);
  requireThat(text !== null, 'The retained canonical source cannot be proved', 'notes_history_unavailable');
  yield {text, act: row.transaction.id, time: row.transaction.createdAt};
 }
}
