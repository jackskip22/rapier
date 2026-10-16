// SPDX-License-Identifier: AGPL-3.0-only
import {canonicalNote, canonicalIndex, canonicalJSON} from './merge.mjs';
import {projectCard, isNoteFile, validNoteId as validId, NOTE_CONTROL_GROUPS, NOTE_CONTROL_FIELDS} from './model.mjs';
import {sha256, sha256State, sha256Yielding, checkByteAbort} from './integrity.mjs';
export {sha256};
import {diff} from '../packages/rapier-diff/index.mjs';
import {exportLedger, prepareLedgerAsync, readLedger, textRoot, rootAfter} from '../kit/ledger/format.mjs';
import {utf8Length} from '../kit/ledger/data.mjs';
import {_rapierMetadataDelta, _rapierTransformMetadata, _rapierTransformSplices} from '../kit/ledger/journal-records.mjs';
import {selectiveUndo} from '../kit/ledger/history.mjs';

export const HISTORY_VERSION = 2;
export const INPUT_OPERATION = 'notes.input';
export const REASONS = Object.freeze(['save', 'import', 'import-undo', 'rename', 'restore', 'trash', 'untrash', 'merge', 'capture', 'edit-card']);
export const DEFAULT_POLICY = Object.freeze({allDays: 7, dailyDays: 90, maxBytes: 268435456});
export const DIFF_LIMITS = Object.freeze({characters: 1000000, lines: 12000, steps: 250000});
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
function freezeData(value) {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) freezeData(child);
		Object.freeze(value);
	}
	return value;
}
function keepAdmission(state, manifest, canonical) {
	const admitted = {manifest, canonical};
	if (state) {
		requireThat(canonical === null || canonical.complete && canonical.ledger.documentAuthority.startsWith('notes:'), 'The complete Notes history is unavailable');
		freezeData(admitted); state.admitted.set(manifest, admitted);
		if (canonical) { state.ledgers.set(canonical.ledger, canonical); state.sourceHashes.set(canonical.text, canonical.ledger.head.sha256); }
	}
	return admitted;
}
function admitLedger(state, ledger, text) {
	const known = state?.ledgers.get(ledger);
	if (known) {
		requireThat(text === undefined || text === known.text, 'The note and its canonical history do not agree', 'notes_history_unavailable');
		return known;
	}
	const admitted = readLedger(ledger, text);
	if (state) { freezeData(admitted); state.ledgers.set(admitted.ledger, admitted); state.sourceHashes.set(admitted.text, admitted.ledger.head.sha256); }
	return admitted;
}
const draft = (manifest, state) => state ? {...manifest} : manifest;
const produced = (ledger, text) => ({ledger, text, metadata: ledger.head.metadata,
	root: ledger.head.root, revision: ledger.head.revision, complete: ledger.complete});
function cooperate(state) {
	checkByteAbort(state.signal);
	if ((globalThis.performance?.now() ?? Date.now()) - state.turn < 8) return;
	return new Promise(resolve => setTimeout(resolve, 0)).then(() => {
		checkByteAbort(state.signal); state.turn = globalThis.performance?.now() ?? Date.now();
	});
}
async function preparedSource(state, text) {
	requireThat(typeof text === 'string', 'A note must be text', 'note_text');
	const known = state.sources.get(text);
	if (known) return known;
	const pending = (async () => {
		checkByteAbort(state.signal);
		const admitted = state.sourceHashes.has(text);
		let bytes;
		if (text.length < 65536) bytes = ENC.encode(admitted ? text : canonicalNote(text));
		else {
			let size = 0;
			for (let at = 0; at < text.length;) {
				let end = Math.min(text.length, at + 65536);
				if (end < text.length && (text.charCodeAt(end - 1) & 0xfc00) === 0xd800 && (text.charCodeAt(end) & 0xfc00) === 0xdc00) end--;
				const part = text.slice(at, end); if (!admitted) canonicalNote(part); size += utf8Length(part); at = end;
				const pause = cooperate(state); if (pause) await pause;
			}
			bytes = new Uint8Array(size);
			for (let at = 0, offset = 0; at < text.length;) {
				let end = Math.min(text.length, at + 65536);
				if (end < text.length && (text.charCodeAt(end - 1) & 0xfc00) === 0xd800 && (text.charCodeAt(end) & 0xfc00) === 0xdc00) end--;
				offset += ENC.encodeInto(text.slice(at, end), bytes.subarray(offset)).written; at = end;
				const pause = cooperate(state); if (pause) await pause;
			}
		}
		const hash = state.sourceHashes.get(text) || await sha256Yielding(bytes, {signal: state.signal});
		return Object.freeze({text, bytes, hash, size: bytes.length});
	})();
	state.sources.set(text, pending);
	try { return await pending; }
	catch (error) { state.sources.delete(text); throw error; }
}
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

function sha256Fallback(value) {
	const hash = sha256State(); hash.update(bytesOf(value)); return hash.finish();
}

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
async function textObject(exact, hash, size = ENC.encode(exact).length) {
	const {parts, blobs} = await split(exact);
	const recipe = ENC.encode(JSON.stringify({version: HISTORY_VERSION, size, parts}) + '\n');
	return {object: {size, textBytes: recipe.length, blobs: [...blobs].map(([hash, data]) => ({hash, size: data.length})).sort((a, b) => a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0)},
		writes: [...blobs].map(([hash, bytes]) => ({name: 'blobs/' + hash, bytes, immutable: true})).concat({name: 'texts/' + hash, bytes: recipe, immutable: true})};
}
function validatePolicy(raw) {
	requireThat(record(raw) && integer(raw.allDays) && integer(raw.dailyDays) && raw.dailyDays >= raw.allDays && integer(raw.maxBytes), 'Invalid retention policy', 'policy');
	return clone(raw);
}
function inspectManifest(raw, state) {
	const known = state?.admitted.get(raw);
	if (known) return known;
	requireThat(record(raw), 'A history manifest must be an object');
	if (Number.isInteger(raw.version) && raw.version > HISTORY_VERSION) throw Object.assign(fault('newer', 'This history was written by a newer reader'), {version: raw.version});
	requireThat(raw.version === HISTORY_VERSION, 'Unsupported history version; keep its original bytes', 'unsupported');
	const descriptors = Object.getOwnPropertyDescriptors(raw), declaration = descriptors.canonical;
	requireThat(declaration && own(declaration, 'value') && declaration.enumerable, 'No canonical history declaration');
	const projection = Object.create(Object.getPrototypeOf(raw), {...descriptors, canonical: {...declaration, value: null}});
	const m = clone(projection);
	requireThat(validId(m.noteId) && integer(m.next) && m.next > 0 && record(m.objects) && Array.isArray(m.versions) && Array.isArray(m.protected) && Array.isArray(m.thinned), 'Invalid history manifest shape');
	const canonical = declaration.value === null ? null : admitLedger(state, declaration.value);
	m.canonical = canonical?.ledger ?? null;
	if (canonical !== null) {
		const proved = canonical;
		requireThat(proved.complete && proved.ledger.documentAuthority.startsWith('notes:'), 'The complete Notes history is unavailable');
	}
	if (own(m, 'media')) requireThat(canonical !== null && validMedia(m.media), 'Invalid history media binding');
	const ids = new Map(), referenced = new Set(), seen = new Set();
	let previous = 0;
	for (const v of m.versions) {
		requireThat(record(v) && integer(v.id) && v.id > previous && v.id < m.next && validHash(v.hash) && REASONS.includes(v.reason) && integer(v.size) && typeof v.title === 'string' && (v.act === undefined || typeof v.act === 'string'), 'Invalid history event');
		time(v.time); entryCopy(v.file, v.entry, m.noteId);
		if (v.controls !== undefined) validateControls(v.controls, v.id);
		requireThat(own(m.objects, v.hash), 'A history event has no content object');
		requireThat(m.objects[v.hash].size === v.size, 'A history event has the wrong content size');
		if (v.reason === 'restore') requireThat(integer(v.restoredFrom) && v.restoredFrom > 0 && v.restoredFrom < v.id, 'A restore must name an earlier event');
		else requireThat(!own(v, 'restoredFrom'), 'Only a restore names a restore source');
		previous = v.id; ids.set(v.id, v); referenced.add(v.hash); seen.add(v.id);
	}
	const controlVersions = new Map(), sourceActs = new Map(canonical?.ledger.records.map(row => [row.transaction.id, row.transaction]) || []);
	for (const version of m.versions) if (version.controls) {
		const receipt = version.controls;
		requireThat(receipt.id.startsWith('notes-controls:' + m.noteId + ':') && !controlVersions.has(receipt.id), 'A controls receipt belongs to one note event');
		controlVersions.set(receipt.id, version.id);
		if (receipt.sourceAct) {
			const source = sourceActs.get(receipt.sourceAct);
			requireThat(source && ['notes.set', 'notes.undo'].includes(source.operation) && source.actor.kind === receipt.author.kind && source.actor.id === receipt.author.id,
				'A controls receipt lost its source act');
		}
	}
	for (const version of m.versions) if (version.controls?.reverses && controlVersions.has(version.controls.reverses))
		requireThat(controlVersions.get(version.controls.reverses) < version.id, 'A controls inverse must name an earlier event');
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
	return keepAdmission(state, m, canonical);
}
function validateManifest(raw) { return inspectManifest(raw).manifest; }
function orderManifest(state, manifest) {
 const admitted = inspectManifest(manifest, state), ordered = clone(admitted.manifest);
 const canonical = admitted.canonical && {...admitted.canonical, ledger: ordered.canonical};
 return keepAdmission(state, ordered, canonical).manifest;
}
function manifestWrite(m) { return {name: manifestName(m.noteId), bytes: ENC.encode(JSON.stringify(m) + '\n'), immutable: false}; }
export function serializeManifest(manifest) { return JSON.stringify(validateManifest(manifest)) + '\n'; }
function parseHistory(value, {noteId, now} = {}, state) {
	manifestName(noteId); time(now);
	if (value == null) return keepAdmission(state, emptyManifest(noteId), null);
	const input = typeof value === 'string' ? ENC.encode(canonicalNote(value)) : bytesOf(value);
	const bytes = !state || typeof SharedArrayBuffer === 'function' && input.buffer instanceof SharedArrayBuffer ? input.slice() : input;
	try {
		const exact = decode(bytes), admitted = state?.receipts.get(exact) || inspectManifest(JSON.parse(exact), state);
		requireThat(admitted.manifest.noteId === noteId, 'The manifest belongs to another note');
		if (state) state.receipts.set(exact, admitted);
		return admitted;
	} catch (cause) {
		const code = ['newer', 'unsupported'].includes(cause.code) ? cause.code : 'corrupt';
		const name = 'refused/' + noteId.replace(':', '!') + '.' + code + '.' + new Date(now).toISOString().replace(/:/g, '-') + '.' + sha256Fallback(bytes) + '.json';
		throw Object.assign(fault(code, code === 'newer' ? 'Keep this history; open it with its newer reader' : 'Keep this unreadable history; never replace it with an empty one'), {
			cause, ...(code === 'newer' ? {version: cause.version} : {}), original: bytes.slice(),
			writes: [{name, bytes: bytes.slice(), immutable: true}], replaceOriginal: false
		});
	}
}
export function parseManifest(value, options) { return parseHistory(value, options).manifest; }
export function parseCanonical(value, {text, ...options} = {}) {
 const admitted = parseHistory(value, options);
 return {...canonicalFrom(admitted, text), manifest: admitted.manifest};
}
export function rekeyManifest(value, {from, to, now} = {}) {
	manifestName(from); manifestName(to); time(now);
	const m = parseManifest(value, {noteId: from, now});
	if (from === to) return {manifest: m, writes: [], moved: false};
	m.noteId = to;
	for (const v of m.versions) { v.entry = {...v.entry, id: to}; delete v.controls; }
	const checked = validateManifest(m);
	return {manifest: checked, writes: [manifestWrite(checked)], moved: true, was: manifestName(from)};
}
async function recordVersionIn(state, manifest, {file, text, entry, reason, now, restoredFrom, controls} = {}) {
	const admitted = inspectManifest(manifest, state), m = draft(admitted.manifest, state);
	time(now); requireThat(REASONS.includes(reason), 'Unknown history reason', 'reason');
	const snapshot = entryCopy(file, entry, m.noteId);
	const source = state ? await preparedSource(state, text) : await (async () => {
		const exact = canonicalNote(text), bytes = ENC.encode(exact); return {text: exact, bytes, size: bytes.length, hash: await sha256(bytes)};
	})();
	const {text: exact, hash, size} = source;
	const current = m.versions.at(-1);
	if (reason === 'restore') {
		const source = m.versions.find(v => v.id === restoredFrom);
		requireThat(source && source.hash === hash, 'A restore must use its named source bytes', 'restore');
	} else requireThat(restoredFrom === undefined, 'Only restore may name a source', 'restore');
	if ((reason === 'save' || reason === 'import' && current?.reason === 'import') && current && current.hash === hash && current.file === file && equal(current.entry, snapshot)) {
		return {manifest: keepAdmission(state, m, admitted.canonical).manifest, writes: [], version: clone(current), unchanged: true};
	}
	requireThat(m.next < Number.MAX_SAFE_INTEGER, 'History event counter exhausted', 'counter');
	const writes = [];
	if (!own(m.objects, hash)) {
		const known = new Set(Object.values(m.objects).flatMap(o => o.blobs.map(b => b.hash)));
		let making = state?.recipes.get(exact);
		if (!making) { making = textObject(exact, hash, size); if (state) state.recipes.set(exact, making); }
		const made = await making;
		writes.push(...made.writes.filter(w => !w.name.startsWith('blobs/') || !known.has(w.name.slice(6))));
		if (state) m.objects = {...m.objects};
		m.objects[hash] = made.object;
	}
	const version = {id: m.next++, file, time: now, reason, hash, size, entry: snapshot, title: projectCard(file, exact).title};
	if (admitted.canonical?.text === exact) version.act = admitted.canonical.ledger.records.at(-1)?.transaction.id ?? '';
	if (state) { m.versions = [...m.versions]; m.protected = [...m.protected]; }
	if (reason === 'restore') { version.restoredFrom = restoredFrom; if (!m.protected.includes(restoredFrom)) m.protected.push(restoredFrom); m.protected.sort((a, b) => a - b); }
	if (controls !== undefined) { validateControls(controls, version.id); version.controls = clone(controls); }
	m.versions.push(version); m.current = version.id; m.file = file;
	keepAdmission(state, m, admitted.canonical);
	writes.push(state ? preparedManifestWrite(state, m) : manifestWrite(m));
	return {manifest: m, writes, version: clone(version), unchanged: false};
}
function validateControls(receipt, version) {
	requireThat(record(receipt) && validHash(receipt.owner) && typeof receipt.id === 'string' && (/^notes-controls:[A-Za-z0-9][A-Za-z0-9._-]{0,63}:[1-9][0-9]*:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/).test(receipt.id) &&
		record(receipt.author) && ['agent', 'human', 'system'].includes(receipt.author.kind) && typeof receipt.author.id === 'string' && receipt.author.id &&
		record(receipt.changed) && record(receipt.previous) && Object.keys(receipt.changed).every(key => NOTE_CONTROL_FIELDS.includes(key) && Object.hasOwn(receipt.previous, key)) &&
		Object.keys(receipt.previous).length === Object.keys(receipt.changed).length && record(receipt.groups) && (receipt.sourceAct === null || typeof receipt.sourceAct === 'string') &&
		(receipt.requestScope === null || validHash(receipt.requestScope)) && validHash(receipt.requestDigest) &&
		(receipt.reverses === undefined || typeof receipt.reverses === 'string') && ENC.encode(JSON.stringify(receipt)).length <= 16384, 'Invalid Notes controls receipt');
	for (const [group, effect] of Object.entries(receipt.groups)) {
		requireThat(Object.hasOwn(NOTE_CONTROL_GROUPS, group) && record(effect) && record(effect.before) && record(effect.after) && integer(effect.version) && effect.version > 0 &&
			[...Object.keys(effect.before), ...Object.keys(effect.after)].every(key => NOTE_CONTROL_GROUPS[group].includes(key)), 'Invalid Notes controls effect');
	}
	requireThat(Object.keys(receipt.groups).length || receipt.sourceAct, 'A controls receipt must name a real effect');
}
export function controlsAct(noteId, version) {
	const receipt = version.controls;
	if (!receipt) return null;
	return {id: receipt.id, document_id: 'notes-controls:' + noteId, base_revision: version.id - 1, revision: version.id,
		author: {kind: receipt.author.kind, ...(receipt.author.name ? {name: receipt.author.name} : {})}, at: new Date(version.time).toISOString(),
		operation: receipt.reverses ? 'notes.undo' : 'notes.set', ...(receipt.turn_id ? {turn_id: receipt.turn_id} : {}),
		...(receipt.label !== undefined ? {label: receipt.label} : {}), ...(receipt.reverses ? {reverses: [receipt.reverses]} : {})};
}
export async function recordVersion(manifest, options) { return recordVersionIn(null, manifest, options); }
export function versionsOf(manifest, file = manifest.file) {
	const m = validateManifest(manifest);
	if (file !== m.file && !m.versions.some(v => v.file === file)) return [];
	return m.versions.map(v => ({id: v.id, file: v.file, time: v.time, reason: v.reason, hash: v.hash, size: v.size, title: v.title, ...(v.restoredFrom === undefined ? {} : {restoredFrom: v.restoredFrom})}));
}
async function materializeIn(state, manifest, id, readObject) {
	const m = inspectManifest(manifest, state).manifest, v = m.versions.find(v => v.id === id);
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
export async function materialize(manifest, id, readObject) { return materializeIn(null, manifest, id, readObject); }
export async function rewriteHistoryReferences(manifest, rewrite, readObject) {
	const m = validateManifest(manifest);
	requireThat(typeof rewrite === 'function', 'Pass the backup root reference rewriter', 'rewrite');
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
	for (const batch of m.thinned) for (const gone of batch.removes) if (hashes.has(gone.hash)) gone.hash = hashes.get(gone.hash);
	m.objects = objects;
	const checked = validateManifest(m);
	return {manifest: checked, writes: [...writes.values(), manifestWrite(checked)], changed: true};
}
export async function restorePlan(manifest, id, current, readObject, media) {
	const m = validateManifest(manifest);
	requireThat(record(current), 'Pass the current note snapshot', 'current');
	const entry = entryCopy(current.file, current.entry, m.noteId), hash = await sha256(ENC.encode(canonicalNote(current.text)));
	const target = await materialize(m, id, readObject);
	if (media) await checkVersionMedia(m, id, target.text, media);
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
	const stats = {}, refused = reason => ({tooLarge: true, reason, edits: [], work: stats.work || 0});
	if (a.length + b.length > DIFF_LIMITS.characters) return refused('characters');
	const left = linesOf(a), right = linesOf(b);
	if (!left || !right || left.length + right.length > DIFF_LIMITS.lines) return refused('lines');
	const {edits: changes} = diff(a, b, {_unit: 'line', limit: DIFF_LIMITS.steps, _stats: stats});
	if (changes.some(change => change.coarse)) return refused('work');
	const edits = [];
	const append = (op, text) => {
		if (!text) return;
		const lines = linesOf(text), prior = edits.at(-1);
		if (prior?.op === op) prior.lines.push(...lines); else edits.push({op, lines});
	};
	let at = 0;
	for (const change of changes) {
		append('equal', a.slice(at, change.before[0]));
		append('delete', a.slice(...change.before));
		append('insert', b.slice(...change.after));
		at = change.before[1];
	}
	append('equal', a.slice(at));
	return {tooLarge: false, edits, work: stats.work || 0};
}

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
	let common = 0, end = 0;
	const room = Math.min(before.length, after.length);
	while (common < room && before.charCodeAt(common) === after.charCodeAt(common)) common++;
	while (end < room - common && before.charCodeAt(before.length - 1 - end) === after.charCodeAt(after.length - 1 - end)) end++;
	const word = text => {let at = common; if (at < text.length && !/\s/.test(text[at])) while (at > 0 && !/\s/.test(text[at - 1])) at--; return at;};
	if (after.slice(common, after.length - end).trim()) return '+ ' + few(after.slice(word(after), after.length - end));
	if (before.slice(common, before.length - end).trim()) return '− ' + few(before.slice(word(before), before.length - end));
	return 'spacing';
}

function canonicalFrom({canonical}, text) {
 requireThat(canonical !== null, 'This note has no provable canonical history; its bytes were kept', 'notes_history_unavailable');
 requireThat(text === undefined || text === canonical.text, 'The note and its canonical history do not agree', 'notes_history_unavailable');
 return canonical;
}
export function readCanonical(manifest, text) { return canonicalFrom(inspectManifest(manifest), text); }
function canonicalBase(read) {
 return {proof: read, text: read.text, metadata: read.metadata, records: read.ledger.records,
  start: read.ledger.start, documentAuthority: read.ledger.documentAuthority, complete: read.complete, root: read.root, revision: read.revision};
}
function withoutInput(read) {
 const base = canonicalBase(read), records = base.records;
 let keep = records.length;
 while (keep && records[keep - 1].transaction.operation === INPUT_OPERATION) keep--;
 if (keep === records.length) return base;
 let text = read.text, metadata = read.metadata;
 for (let at = records.length - 1; at >= keep; at--) {
  text = _rapierTransformSplices(text, records[at].splices, true);
  metadata = text === null ? null : _rapierTransformMetadata(metadata, records[at].metadata, true);
  requireThat(text !== null && metadata, 'The provisional input cannot be removed from this history', 'notes_history_unavailable');
 }
 const last = records[keep - 1];
 return {...base, proof: null, text, metadata, records: records.slice(0, keep),
  root: last?.afterHash ?? base.start.root, revision: last?.transaction.revision ?? base.start.revision};
}
function produceCanonical(state, input, finish) {
 if (!state) return finish(exportLedger(input));
 return prepareLedgerAsync(input, {signal: state.signal, yield: () => cooperate(state)}).then(result => finish(result.ledger));
}
function canonicalResult(state, manifest, proof, result) {
 manifest.canonical = proof.ledger;
 keepAdmission(state, manifest, proof);
 const out = {manifest, ledger: proof.ledger, ...result};
 return state ? freezeData(out) : out;
}
function replacementSplices(before, after) {
 if (before === after) return [];
 let start = 0, a = before.length, b = after.length;
 while (start < a && start < b && before[start] === after[start]) start++;
 if (start && /[\uDC00-\uDFFF]/.test(before[start] || after[start] || '')) start--;
 while (a > start && b > start && before[a - 1] === after[b - 1]) { a--; b--; }
 if (/[\uDC00-\uDFFF]/.test(before[a] || after[b] || '')) { a++; b++; }
 return [{pos: start, removed: before.slice(start, a), inserted: after.slice(start, b)}];
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
function freshCanonicalIn(state, manifest, metadata, authority = 'notes:' + globalThis.crypto.randomUUID()) {
 const admitted = inspectManifest(manifest, state), m = draft(admitted.manifest, state);
 requireThat(m.canonical === null && !m.versions.length, 'Existing history cannot be reset', 'notes_history_unavailable');
 const ledger = exportLedger({text: '', metadata, records: [], documentAuthority: authority, revision: 0, root: textRoot(''), complete: true});
 m.canonical = ledger;
 return keepAdmission(state, m, produced(ledger, '')).manifest;
}
export function freshCanonical(manifest, metadata, authority) { return freshCanonicalIn(null, manifest, metadata, authority); }
function adoptCanonicalIn(state, manifest, ledger, text) {
 const admitted = inspectManifest(manifest, state), m = draft(admitted.manifest, state), after = admitLedger(state, ledger, text);
 requireThat(m.canonical === null && !m.versions.length && after.complete, 'Existing history cannot be replaced', 'notes_history_unavailable');
 return canonicalResult(state, m, after, {act: after.revision ? canonicalAct(after.ledger.records.at(-1)) : null, unchanged: false});
}
export function adoptCanonical(manifest, ledger, text) { return adoptCanonicalIn(null, manifest, ledger, text); }
function carryCanonicalIn(state, manifest, ledger, text) {
 const admitted = inspectManifest(manifest, state), m = draft(admitted.manifest, state), held = canonicalFrom(admitted), before = withoutInput(held), after = admitLedger(state, ledger, text);
 requireThat(after.complete && after.ledger.documentAuthority === before.documentAuthority &&
  after.ledger.start.revision === before.start.revision && equal(after.ledger.start, before.start) &&
  after.ledger.records.length >= before.records.length && before.records.every((row, i) => equal(row, after.ledger.records[i])),
  'The live ledger does not extend this note history', 'notes_history_unavailable');
 return canonicalResult(state, m, after, {act: after.revision === before.revision ? null : canonicalAct(after.ledger.records.at(-1)), unchanged: after.ledger.sha256 === held.ledger.sha256});
}
export function carryCanonical(manifest, ledger, text) { return carryCanonicalIn(null, manifest, ledger, text); }
function appendCanonicalIn(state, manifest, {text, metadata, author, transport = 'platform', requestId = null, requestScope = null,
 requestDigest = null, turn_id, label, operation = 'notes.write', now, undo, input = false, id = null} = {}) {
 const admitted = inspectManifest(manifest, state), m = draft(admitted.manifest, state), held = canonicalFrom(admitted);
 const before = input ? withoutInput(held) : canonicalBase(held);
 if (input) operation = INPUT_OPERATION;
 requireThat(author && ['human', 'agent', 'system'].includes(author.kind) && typeof author.id === 'string' && author.id,
  'The original author is unavailable', 'notes_author_unavailable');
 if (requestScope) {
  const prior = held.ledger.records.find(row => row.transaction.requestScope === requestScope);
  if (prior) {
   requireThat(prior.transaction.requestDigest === requestDigest, 'This request was already used for different bytes', 'notes_request_conflict');
   return canonicalResult(state, m, held, {act: canonicalAct(prior), unchanged: false, replayed: true, text: held.text});
  }
 }
 let splices, effect, afterMetadata = metadata || before.metadata, inverse = [];
 if (undo) {
  const plan = selectiveUndo({source: before.text, metadata: before.metadata, records: before.records,
   revision: before.revision, earliestRevision: before.start.revision}, undo);
  requireThat(plan.ok, 'The selected act cannot be undone from this history', 'notes_history_unavailable');
  text = plan.after; splices = plan.splices; effect = plan.metadata; afterMetadata = plan.afterMetadata;
  inverse = plan.sourceTransactionIds;
 } else {
  text = canonicalNote(text);
  const last = held.ledger.records.at(-1)?.transaction;
  if (input && last?.operation === INPUT_OPERATION && text === held.text && equal(afterMetadata, held.metadata) &&
   equal(author, last.actor) && transport === last.transport && requestId === last.requestId && !requestScope && !last.requestScope) {
   return canonicalResult(state, m, held, {act: canonicalAct(held.ledger.records.at(-1)), unchanged: true, replayed: true, text});
  }
  splices = replacementSplices(before.text, text);
  effect = _rapierMetadataDelta(before.metadata, afterMetadata);
 }
 if (!splices.length && !effect && !inverse.length) {
  if (before.proof) return canonicalResult(state, m, before.proof, {act: null, unchanged: true, text});
  return produceCanonical(state, {...before, text, metadata: afterMetadata}, ledger =>
   canonicalResult(state, m, produced(ledger, text), {act: null, unchanged: false, text}));
 }
 let root = before.root; for (const row of splices) root = rootAfter(root, row);
 const tx = {id: id ?? 'act:' + globalThis.crypto.randomUUID(), documentAuthority: before.documentAuthority,
  baseRevision: before.revision, revision: before.revision + 1, actor: clone(author), transport, operation,
  requestId, sourceTransactionId: inverse.length === 1 ? inverse[0] : null,
  ...(inverse.length > 1 ? {sourceTransactionIds: inverse} : {}),
  affectedBlockIds: [], parent: before.records.at(-1)?.transaction.id || null, reverts: null, reapplies: null,
  createdAt: now, ...(turn_id ? {turnId: turn_id} : {}),
  ...(requestScope ? {requestScope, requestDigest} : {})};
 const row = {transaction: tx, splices, beforeHash: before.root, afterHash: root, ...(effect ? {metadata: effect} : {}),
  ...(label !== undefined ? {changeSet: {label}} : {})};
 return produceCanonical(state, {text, metadata: afterMetadata, records: [...before.records, row],
  documentAuthority: tx.documentAuthority, revision: tx.revision, root, complete: true}, ledger =>
   canonicalResult(state, m, produced(ledger, text), {act: canonicalAct(row), unchanged: false, text}));
}
export function appendCanonical(manifest, options) { return appendCanonicalIn(null, manifest, options); }

function preparedManifestText(state, manifest) {
 const admitted = inspectManifest(manifest, state), m = admitted.manifest;
 let exact = state.serialized.get(m);
 if (exact === undefined) {
  exact = JSON.stringify(m) + '\n'; state.serialized.set(m, exact); state.receipts.set(exact, admitted);
 }
 return exact;
}
function preparedManifestWrite(state, manifest) {
 const admitted = inspectManifest(manifest, state), m = admitted.manifest;
 let write = state.writes.get(m);
 if (!write) {
  write = Object.freeze({name: manifestName(m.noteId), bytes: ENC.encode(preparedManifestText(state, m)), immutable: false});
  state.writes.set(m, write);
 }
 return write;
}
class HistoryPreparation {
 #state;
 constructor({signal} = {}) {
  this.#state = {signal, turn: globalThis.performance?.now() ?? Date.now(), admitted: new WeakMap(), ledgers: new WeakMap(),
   receipts: new Map(), serialized: new WeakMap(), writes: new WeakMap(), sources: new Map(), sourceHashes: new Map(), recipes: new Map()};
  Object.freeze(this);
 }
 static owns(value) { return value !== null && typeof value === 'object' && #state in value; }
 source(text) { return preparedSource(this.#state, text); }
 captureLedger(ledger, text) { return admitLedger(this.#state, ledger, text).ledger; }
 parseManifest(value, options) { return parseHistory(value, options, this.#state).manifest; }
 parseCanonical(value, {text, ...options} = {}) {
  const admitted = parseHistory(value, options, this.#state);
  return Object.freeze({...canonicalFrom(admitted, text), manifest: admitted.manifest});
 }
 readCanonical(manifest, text) { return canonicalFrom(inspectManifest(manifest, this.#state), text); }
 freshCanonical(manifest, metadata, authority) { return freshCanonicalIn(this.#state, manifest, metadata, authority); }
 adoptCanonical(manifest, ledger, text) { return adoptCanonicalIn(this.#state, manifest, ledger, text); }
 carryCanonical(manifest, ledger, text) { return carryCanonicalIn(this.#state, manifest, ledger, text); }
 async appendCanonical(manifest, options) { return appendCanonicalIn(this.#state, manifest, options); }
 recordVersion(manifest, options) { return recordVersionIn(this.#state, manifest, options); }
 materialize(manifest, id, readObject) { return materializeIn(this.#state, manifest, id, readObject); }
 orderManifest(manifest) { return orderManifest(this.#state, manifest); }
 serializeManifest(manifest) { return preparedManifestText(this.#state, manifest); }
 writeManifest(manifest) { return preparedManifestWrite(this.#state, manifest); }
}
Object.freeze(HistoryPreparation.prototype);
Object.freeze(HistoryPreparation);
export function createHistoryPreparation(options) { return new HistoryPreparation(options); }
export function resolveHistoryPreparation(value) { return HistoryPreparation.owns(value) ? value : null; }

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

const MEDIA_FILE = /^(?:audio|attachments)\/[^/\\\x00-\x1f\x7f]+$/;
const mediaKey = row => row.file + '\0' + row.act;
function validMedia(rows) {
 const keys = new Set();
 return Array.isArray(rows) && rows.every(row => record(row) && Object.keys(row).every(key => ['file', 'act', 'content', 'end'].includes(key)) && MEDIA_FILE.test(row.file) &&
  typeof row.act === 'string' && validHash(row.content) && (row.end === undefined || typeof row.end === 'string') && !keys.has(mediaKey(row)) && keys.add(mediaKey(row)));
}
function mediaStretches(ledger, rows, names) {
 const bound = new Map(rows.map(row => [mediaKey(row), row])), open = new Map(), all = [];
 let text = ledger.start.text, act = '';
 const step = () => {
  const named = new Set(names(text));
  for (const file of open.keys()) if (!named.has(file)) open.delete(file);
  for (const file of named) {
   let stretch = open.get(file);
   if (!stretch) { stretch = {file, act, acts: [], row: bound.get(file + '\0' + act) || null}; open.set(file, stretch); all.push(stretch); }
   stretch.acts.push(act);
   if (stretch.row?.end === act) open.delete(file);
  }
 };
 step();
 for (const row of ledger.records) {
  text = _rapierTransformSplices(text, row.splices); act = row.transaction.id;
  requireThat(text !== null, 'The retained canonical source cannot be proved', 'notes_history_unavailable');
  step();
 }
 return {all, open};
}
const sortedMedia = rows => rows.slice().sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : a.act < b.act ? -1 : a.act > b.act ? 1 : 0);
export function bindMedia(ledger, rows = [], file, content, names, {close = false} = {}) {
 requireThat(MEDIA_FILE.test(file) && validHash(content) && validMedia(rows), 'Invalid media binding', 'media');
 const {all, open} = mediaStretches(ledger, rows, names), next = new Map(rows.map(row => [mediaKey(row), row]));
 let changed = false;
 for (const stretch of all) if (stretch.file === file && !stretch.row) { next.set(mediaKey(stretch), {file, act: stretch.act, content}); changed = true; }
 const latest = open.get(file);
 const row = close && latest && next.get(mediaKey(latest));
 if (row) { next.set(mediaKey(latest), {...row, end: latest.acts.at(-1)}); changed = true; }
 return changed ? sortedMedia([...next.values()]) : rows;
}
export function joinMedia(lists) {
 const out = new Map();
 for (const rows of lists) for (const row of rows || []) {
  const key = mediaKey(row), prior = out.get(key);
  if (prior && (prior.content !== row.content || prior.end !== undefined && row.end !== undefined && prior.end !== row.end))
   throw fault('notes_media_conflict', 'One stretch of a note\'s history names two different files');
  if (!prior || row.end !== undefined) out.set(key, {...row});
 }
 return sortedMedia([...out.values()]);
}
export async function checkInverseMedia(manifest, ledger, {names, digest, inverse = null}) {
 const before = validateManifest(manifest), held = new Set(before.canonical?.records.map(row => row.transaction.id) || []);
 let records = ledger.records;
 if (inverse) {
  requireThat(records.some(row => row.transaction.id === inverse.subject), 'The Undo target is no longer in this note history', 'notes_history_unavailable');
  records = [...records, {transaction: {id: 'preview:' + globalThis.crypto.randomUUID(),
   operation: inverse.redo ? 'history.redo' : 'history.undo',
   ...(inverse.redo ? {reapplies: inverse.subject} : {reverts: inverse.subject})}, splices: inverse.splices}];
 }
 const inverseRefs = tx => tx.operation === 'document.finish-picture' ? [] : tx.reverts || tx.reapplies
  ? [tx.reverts || tx.reapplies] : tx.sourceTransactionIds || (tx.sourceTransactionId ? [tx.sourceTransactionId] : []);
 if (!records.some(row => !held.has(row.transaction.id) && inverseRefs(row.transaction).length)) return before.media;
 const rows = new Map((before.media || []).map(row => [mediaKey(row), row]));
 const opened = new Set(mediaStretches({...ledger, records}, [...rows.values()], names).all.map(mediaKey));
 const lost = new Set([...rows.values()].filter(row => !opened.has(mediaKey(row))).map(row => row.file));
 const states = new Map(), bound = file => rows.get(file + '\0' + act), unbound = file => lost.has(file) ? undefined : null;
 let text = ledger.start.text, act = '', current = new Map();
 for (const file of names(text)) current.set(file, bound(file)?.content ?? unbound(file));
 const added = [], ends = new Set([...rows.values()].filter(row => row.end !== undefined).map(row => row.file + '\0' + row.end));
 for (const record of records) {
  const tx = record.transaction, previous = current, previousAct = act;
  text = _rapierTransformSplices(text, record.splices);
  requireThat(text !== null, 'The retained canonical source cannot be proved', 'notes_history_unavailable');
  act = tx.id;
  const refs = inverseRefs(tx);
  current = new Map();
  for (const file of names(text)) {
   const explicit = bound(file), prior = previous.get(file);
   const closed = ends.has(file + '\0' + previousAct);
   if (previous.has(file) && !closed) { current.set(file, explicit?.content ?? prior); continue; }
   let content = explicit?.content ?? unbound(file);
   if (refs.length && !held.has(act)) {
    const origins = refs.map(id => states.get(id)?.[tx.reapplies ? 'after' : 'before']).filter(state => state?.has(file));
    requireThat(origins.length > 0, 'The original file for this Undo cannot be checked', 'notes_media_unverified');
    const identities = origins.map(state => state.get(file));
    requireThat(identities.every(value => value === identities[0]), 'The original files for this Undo disagree', 'notes_media_unverified');
    content = identities[0];
    requireThat(content !== undefined, 'The original file for this Undo cannot be checked', 'notes_media_unverified');
    const actual = await digest(file);
    requireThat(actual !== null && (content === null || actual === content), file.slice(file.indexOf('/') + 1) + ' changed since this edit', 'notes_media_replaced');
    content ??= actual;
    requireThat(!explicit || explicit.content === content, 'The original file for this Undo changed', 'notes_media_replaced');
    const row = {file, act, content}; rows.set(mediaKey(row), row); added.push(row);
   }
   current.set(file, content);
  }
  states.set(act, {before: previous, after: current});
 }
 return added.length ? sortedMedia([...rows.values()]) : before.media;
}

export async function checkVersionMedia(manifest, id, text, {names, digest}) {
 const m = validateManifest(manifest);
 if (m.canonical) for (const [file, content] of versionMedia(m.canonical, m.media, {...m.versions.find(v => v.id === id), text}, names)) {
  requireThat(content !== undefined, 'this version\'s files can\'t be checked', 'notes_media_unverified');
  requireThat(content === null || await digest(file) === content, file.slice(file.indexOf('/') + 1) + ' changed since this version', 'notes_media_replaced');
 }
}
export function versionMedia(ledger, rows = [], version, names) {
 const {all} = mediaStretches(ledger, rows, names), meant = new Map(), opened = new Set(all.map(mediaKey));
 const bound = new Set(rows.map(row => row.file)), lost = new Set(rows.filter(row => !opened.has(mediaKey(row))).map(row => row.file));
 if (version.act === undefined || version.act !== '' && !ledger.records.some(row => row.transaction.id === version.act)) {
  for (const file of names(version.text)) meant.set(file, bound.has(file) ? undefined : null);
  return meant;
 }
 for (const stretch of all) if (stretch.acts.includes(version.act)) meant.set(stretch.file, stretch.row ? stretch.row.content : lost.has(stretch.file) ? undefined : null);
 return meant;
}
