// SPDX-License-Identifier: AGPL-3.0-only
import {isNoteFile} from './model.mjs';

// The 200-note stall motivates small turns, not a milliseconds-per-byte estimate.
export const IMPORT_LANDING_DEFAULTS = Object.freeze({batchBytes: 64 * 1024, batchCount: 8});
// Every batch commits the whole sidecar and the import's receipt, so the work a batch costs grows with
// the folder and with what has landed. A count that grows with both keeps the number of those commits
// proportional (item 63: eight a batch made a 10,000-note import rewrite a 25 MB record 1,250 times).
// The byte limit still bounds a batch; eight stays the floor so a small import lands as it did.
export function importBatchCount(existing, planned) {
	need(integer(existing) && existing >= 0 && integer(planned) && planned >= 0, 'import batch count needs the folder\'s and the import\'s note counts');
	return Math.max(IMPORT_LANDING_DEFAULTS.batchCount, Math.min(256, Math.ceil((existing + planned) / 64)));
}
const freeze = Object.freeze;
const integer = n => Number.isSafeInteger(n) && n >= 0;
// A plain object from ANY realm: the shell evaluates in a Node VM under the preservation harness and
// hands this planner objects whose Object.prototype is that context's, not this module's. A plain
// object's prototype is the one whose own prototype is null, in every realm; a class instance's is not.
const object = value => value !== null && typeof value === 'object' &&
	(proto => proto === null || Object.getPrototypeOf(proto) === null)(Object.getPrototypeOf(value));
const need = (condition, why) => { if (!condition) throw new TypeError(why); };

function copyEntry(value, parents = new Set()) {
	if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
	need(Array.isArray(value) || object(value), 'import sidecar entries must be JSON values');
	need(!parents.has(value), 'import sidecar entries must not be cyclic');
	parents.add(value);
	const out = Array.isArray(value) ? [] : {};
	for (const key of Reflect.ownKeys(value)) {
		if (Array.isArray(value) && key === 'length') continue;
		const property = Object.getOwnPropertyDescriptor(value, key);
		need(typeof key === 'string' && property.enumerable && 'value' in property, 'import sidecar entries need ordinary JSON properties');
		Object.defineProperty(out, key, {value: copyEntry(property.value, parents), enumerable: true, configurable: true, writable: true});
	}
	if (Array.isArray(value)) need(out.length === value.length && Object.keys(out).length === value.length &&
		Array.from({length: value.length}, (_, i) => Object.hasOwn(out, i)).every(Boolean), 'import sidecar arrays must be dense');
	parents.delete(value);
	return freeze(out);
}

// Counting must not allocate a second copy of every arriving note.
function textBytes(text) {
	let bytes = 0;
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		if (c < 0x80) bytes++;
		else if (c < 0x800) bytes += 2;
		else if (c >= 0xd800 && c <= 0xdbff) {
			const next = text.charCodeAt(++i);
			need(next >= 0xdc00 && next <= 0xdfff, 'import text needs character admission before landing');
			bytes += 4;
		} else {
			need(c < 0xdc00 || c > 0xdfff, 'import text needs character admission before landing');
			bytes += 3;
		}
	}
	return bytes;
}

function select(rows, files, kind) {
	need(Array.isArray(rows), kind + ' work must be an array');
	const chosen = new Set();
	for (const row of rows) {
		need(object(row) && typeof row.file === 'string' && files.has(row.file), kind + ' work must name a planned note');
		need(!chosen.has(row.file), kind + ' work repeats a note');
		chosen.add(row.file);
	}
	return chosen;
}

export function planImportLanding({notes, history = [], receipts = []}, options = {}) {
	need(object(options), 'import batch limits must be an object');
	need(Object.keys(options).every(key => key === 'batchBytes' || key === 'batchCount'), 'unknown import batch limit');
	const {batchBytes, batchCount} = {...IMPORT_LANDING_DEFAULTS, ...options};
	need(integer(batchBytes) && batchBytes > 0 && integer(batchCount) && batchCount > 0, 'import batch limits must be positive safe integers');
	need(Array.isArray(notes), 'import notes must be an array');
	const files = new Set(), items = [];
	for (const note of notes) {
		need(object(note) && isNoteFile(note.file) && typeof note.text === 'string' && object(note.entry), 'an import note needs its file, text and sidecar entry');
		need(!files.has(note.file), 'import notes repeat a file');
		files.add(note.file);
		need(note.bytes === undefined || note.bytes instanceof Uint8Array, 'import source bytes must be a byte array');
		items.push(freeze({ordinal: items.length, file: note.file, text: note.text, ...(note.bytes ? {bytes: note.bytes} : {}), entry: copyEntry(note.entry), byteLength: note.bytes ? note.bytes.length : textBytes(note.text)}));
	}
	const histories = select(history, files, 'history'), verifications = select(receipts, files, 'receipt');
	const batches = [];
	const emit = (kind, selected) => {
		if (!selected.length) return;
		const byteLength = selected.reduce((sum, item) => sum + item.byteLength, 0);
		batches.push(freeze({index: batches.length, kind, items: freeze(selected), byteLength, count: selected.length, oversized: byteLength > batchBytes}));
	};
	const flush = group => {
		emit('write', group);
		emit('history', group.filter(item => histories.has(item.file)));
		emit('verify', group.filter(item => verifications.has(item.file)));
	};
	let group = [], bytes = 0;
	for (const item of items) {
		if (group.length && (group.length === batchCount || item.byteLength > batchBytes - bytes)) { flush(group); group = []; bytes = 0; }
		group.push(item); bytes += item.byteLength;
		if (bytes > batchBytes) { flush(group); group = []; bytes = 0; }
	}
	if (group.length) flush(group);
	return freeze(batches);
}

// Only planImportLanding constructs these batches; its partition is proved by the model witness.
export function createImportLanding(batches) {
	const notes = [], history = [], receipts = [];
	for (const batch of batches) for (const item of batch.items) {
		if (batch.kind === 'write') notes.push(item);
		else (batch.kind === 'history' ? history : receipts).push(item.ordinal);
	}
	const state = {batches, notes: freeze(notes), history: freeze(history), receipts: freeze(receipts), cursor: 0,
		done: freeze({write: 0, history: 0, verify: 0}), status: batches.length ? 'running' : 'complete', batch: batches[0] ?? null, stop: null};
	return freeze({...state, position: batches.length ? null : position(state)});
}

function position(state) {
	const stop = state.stop, pending = stop?.kind === 'write' ? stop.written - stop.completed : 0;
	const landed = state.done.write + pending, unknown = stop?.kind === 'write' && stop.uncertain ? 1 : 0;
	const verified = new Set(state.receipts.slice(0, state.done.verify));
	const landedVerified = [], landedUnverified = [];
	for (let i = 0; i < landed; i++) (verified.has(i) ? landedVerified : landedUnverified).push(state.notes[i].file);
	const sidecarUnconfirmed = state.notes.slice(state.done.write, landed).map(note => note.file);
	const uncertain = state.notes.slice(landed, landed + unknown).map(note => note.file);
	const neverLanded = state.notes.slice(landed + unknown).map(note => note.file);
	const historyUnconfirmed = state.history.slice(state.done.history).filter(i => i < landed).map(i => state.notes[i].file);
	return freeze({landedVerified: freeze(landedVerified), landedUnverified: freeze(landedUnverified),
		neverLanded: freeze(neverLanded), uncertain: freeze(uncertain), sidecarUnconfirmed: freeze(sidecarUnconfirmed), historyUnconfirmed: freeze(historyUnconfirmed),
		counts: freeze({planned: state.notes.length, landedVerified: landedVerified.length, landedUnverified: landedUnverified.length,
			neverLanded: neverLanded.length, uncertain: uncertain.length, sidecarUnconfirmed: sidecarUnconfirmed.length, historyUnconfirmed: historyUnconfirmed.length})});
}

export function advanceImportLanding(state, outcome) {
	need(state?.status === 'running' && Object.isFrozen(state) && state.batch === state.batches[state.cursor], 'this import has no running batch');
	const batch = state.batch;
	need(object(outcome) && outcome.batch === batch.index, 'import outcome is not for the current batch');
	need(['complete', 'failed', 'cancelled'].includes(outcome.status), 'invalid import batch outcome');
	need(integer(outcome.completed) && outcome.completed <= batch.count, 'invalid completed import prefix');
	const complete = outcome.status === 'complete';
	need(!complete || outcome.completed === batch.count, 'a completed batch must complete every item');
	need(complete || typeof outcome.why === 'string' && outcome.why.trim().length > 0, 'a stopped import needs its reason');
	if (batch.kind === 'write') {
		need(integer(outcome.written) && outcome.written >= outcome.completed && outcome.written <= batch.count && typeof outcome.uncertain === 'boolean', 'a write outcome needs its observed body and sidecar prefixes');
		need(!outcome.uncertain || !complete && outcome.written < batch.count, 'an uncertain write must be the next body in a stopped batch');
		need(!complete || outcome.written === batch.count && !outcome.uncertain, 'a completed write needs every body and sidecar entry');
	} else need(outcome.written === undefined && outcome.uncertain === undefined, 'only a write outcome may report body effects');
	const done = freeze({...state.done, [batch.kind]: state.done[batch.kind] + outcome.completed});
	const cursor = state.cursor + (complete ? 1 : 0), next = complete ? state.batches[cursor] ?? null : null;
	const stop = complete ? null : freeze({batch: batch.index, kind: batch.kind, completed: outcome.completed,
		...(batch.kind === 'write' ? {written: outcome.written, uncertain: outcome.uncertain} : {}), why: outcome.why});
	const result = {...state, done, cursor, batch: next, stop, status: complete ? next ? 'running' : 'complete' : outcome.status};
	// Expanding every filename after every turn would turn the scheduler itself quadratic.
	return freeze({...result, position: next ? null : position(result)});
}
