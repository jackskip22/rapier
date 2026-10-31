// SPDX-License-Identifier: MIT
import {fields, scalar, plainPrototype} from "./data.mjs";
import {transformText} from "./source.mjs";
import {dataImage} from "./md-assets.mjs";

const _RAPIER_TRANSACTION_ACTOR_LIMIT = 160;
const _RAPIER_TRANSACTION_OPERATION_LIMIT = 96;
const _RAPIER_TRANSACTION_REQUEST_LIMIT = 160;

function _rapierTransformSplices(text, splices, inverse = false) {
	try {
		if (!Array.isArray(splices)) return null;
		return transformText(String(text == null ? '' : text), splices, inverse);
	} catch (_) { return null; }
}

function _rapierPlainLedgerData(record) {
	const active = new Set();
	const walk = (value, depth) => {
		if (scalar(value)) return;
		const {descriptors, keys} = fields(value, depth, active, false);
		active.add(value);
		for (const key of keys) walk(descriptors[key].value, depth + 1);
		active.delete(value);
	};
	try { walk(record, 0); return true; } catch (_) { return false; }
}

const _rapierMetadataValue = (key, value) => key === 'filename'
	? typeof value === 'string' && value.trim().length > 0 && value.length <= 512 &&
		!/[<>"\x00-\x1f\x7f/\\\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff\uD800-\uDFFF]/u.test(value) && value !== '.' && value !== '..'
	: key === 'docKind' && ['markdown', 'text', 'code'].includes(value);

function _rapierValidMetadata(value) {
	return _rapierPlainLedgerData(value) && value && !Array.isArray(value) &&
		Object.keys(value).length === 2 && ['filename', 'docKind'].every(key => Object.hasOwn(value, key) && _rapierMetadataValue(key, value[key]));
}

function _rapierValidMetadataEffect(effect) {
	return _rapierPlainLedgerData(effect) && effect && !Array.isArray(effect) &&
		Object.keys(effect).length > 0 && Object.keys(effect).every(key => {
			const pair = effect[key];
			return pair && !Array.isArray(pair) && Object.keys(pair).length === 2 &&
				Object.hasOwn(pair, 'before') && Object.hasOwn(pair, 'after') &&
				_rapierMetadataValue(key, pair.before) && _rapierMetadataValue(key, pair.after);
		});
}

function _rapierMetadataDelta(before, after, {assign = []} = {}) {
	if (!_rapierValidMetadata(before) || !_rapierValidMetadata(after)) return null;
	const effect = {};
	for (const key of ['filename', 'docKind']) if (before[key] !== after[key] || assign.includes(key)) effect[key] = {before: before[key], after: after[key]};
	return Object.keys(effect).length ? effect : null;
}

function _rapierTransformMetadata(value, effect, inverse = false) {
	if (!_rapierValidMetadata(value) || (effect != null && !_rapierValidMetadataEffect(effect))) return null;
	const next = {...value};
	for (const [key, pair] of Object.entries(effect || {})) {
		if (next[key] !== pair[inverse ? 'after' : 'before']) return null;
		next[key] = pair[inverse ? 'before' : 'after'];
	}
	return next;
}

function _rapierValidAuthored(origin) {
	if (!_rapierPlainLedgerData(origin) || !origin || Array.isArray(origin) ||
		Object.keys(origin).length !== 3 || !Array.isArray(origin.basis) ||
		new Set(origin.basis).size !== origin.basis.length || origin.basis.some((id, index) => index && origin.basis[index - 1] >= id) ||
		!origin.basis.every(id => typeof id === 'string' && id.length > 0 && id.length <= 256) ||
		typeof origin.source !== 'string' || !/^[a-f0-9]{64}$/.test(origin.source) ||
		!Array.isArray(origin.splices) || origin.splices.length > 64) return false;
	return origin.splices.every(row => row && !Array.isArray(row) && Object.keys(row).length === 3 &&
		Number.isSafeInteger(row.pos) && row.pos >= 0 && !Object.is(row.pos, -0) &&
		typeof row.removed === 'string' && typeof row.inserted === 'string' &&
		!/[\uD800-\uDFFF]/u.test(row.removed) && !/[\uD800-\uDFFF]/u.test(row.inserted));
}

function _rapierRecordIndex(records, shared = false) {
	const byId = new Map(), splices = new Map(), metadata = new Map();
	for (const record of records) {
		const id = record?.transaction?.id;
		if (!byId.has(id)) byId.set(id, []);
		byId.get(id).push(record);
	}
	const resolve = (entry, effects) => {
		const cache = effects ? metadata : splices, path = [], pending = new Set();
		let current = entry, value;
		while (true) {
			if (cache.has(current)) { value = cache.get(current); break; }
			if (!current || pending.has(current)) { value = effects ? undefined : null; break; }
			if (effects && Object.hasOwn(current, 'metadata')) {
				value = _rapierValidMetadataEffect(current.metadata) ? current.metadata : undefined; break;
			}
			if (Array.isArray(current.splices)) { value = effects ? null : current.splices; break; }
			const tx = current.transaction, id = tx?.reverts || tx?.reapplies;
			const target = id && byId.get(id)?.find(record => record?.transaction?.revision < tx.revision);
			if (!target) { value = effects ? undefined : null; break; }
			pending.add(current); path.push(current); current = target;
		}
		cache.set(current, value);
		for (let i = path.length - 1; i >= 0; i--) {
			if (path[i].transaction.reverts && value != null) {
				value = effects
					? Object.fromEntries(Object.entries(value).map(([key, pair]) => [key, {before: pair.after, after: pair.before}]))
					: value.slice().reverse().map(row => ({pos: row.pos, removed: row.inserted, inserted: row.removed}));
				if (shared) { for (const row of Object.values(value)) Object.freeze(row); Object.freeze(value); }
			}
			cache.set(path[i], value);
		}
		return value;
	};
	const extend = more => { for (const record of more) { const id = record?.transaction?.id; if (!byId.has(id)) byId.set(id, []); byId.get(id).push(record); } };
	return {byId, extend, splices: record => resolve(record, false), metadata: record => resolve(record, true)};
}

const _rapierLedgerIndexes = new WeakMap();
function _rapierLedgerIndex(ledger) {
	const records = ledger || [];
	if (!Array.isArray(records)) return _rapierRecordIndex(records);
	const held = _rapierLedgerIndexes.get(records);
	if (held && held.records.length === records.length && held.records.at(-1) === records.at(-1) &&
		(held.checked || held.records.every((record, at) => record === records[at]))) {
		if (!held.checked) { held.checked = true; queueMicrotask(() => { held.checked = false; }); }
		return held.index;
	}
	if (!records.every(record => record && typeof record === 'object' && Object.isFrozen(record) && Object.isFrozen(record.transaction ?? {})))
		return _rapierRecordIndex(records);
	const index = _rapierRecordIndex(records, true);
	_rapierLedgerIndexes.set(records, {records: records.slice(), index});
	return index;
}

function _rapierRecordSplices(entry, ledger) {
	try {
		if (entry && Array.isArray(entry.splices)) return entry.splices;
		return _rapierLedgerIndex(ledger).splices(entry);
	} catch (_) { return null; }
}

function journalOperations(before, after, journal) {
	if (typeof before !== 'string' || typeof after !== 'string' || !Array.isArray(journal)) return;
	if (before === after) return [];
	const forward = journalWalk(before, after, journal);
	if (forward) return forward;
	return journalWalk(after, before, journal)?.reverse().map(({pos, removed, inserted}) => ({pos, removed: inserted, inserted: removed}));
}

function journalWalk(before, after, journal) {
	try {
		const pieces = [after];
		const lookup = _rapierRecordIndex(journal), groups = [];
		let length = after.length;
		const locate = at => { let index = 0; for (; index < pieces.length - 1 && at >= pieces[index].length; index++) at -= pieces[index].length; return [index, at]; };
		const codeAt = at => { const [index, offset] = locate(at); return pieces[index].charCodeAt(offset); };
		const read = (from, to) => { let out = ''; for (let [index, offset] = locate(from); from < to && index < pieces.length; index++, offset = 0) { const part = pieces[index].slice(offset, offset + to - from); out += part; from += part.length; } return out; };
		const cut = at => { const [index, offset] = locate(at); if (offset > 0 && offset < pieces[index].length) pieces.splice(index, 1, pieces[index].slice(0, offset), pieces[index].slice(offset)); };
		const whole = text => typeof text === 'string' && !/[\uD800-\uDFFF]/u.test(text);
		const splitsPair = at => at > 0 && at < length && (codeAt(at - 1) & 0xFC00) === 0xD800 && (codeAt(at) & 0xFC00) === 0xDC00;
		for (let index = journal.length - 1; index >= 0; index--) {
			const rows = lookup.splices(journal[index]);
			if (!Array.isArray(rows)) return;
			for (const row of rows.slice().reverse()) {
				if (!row || !Number.isSafeInteger(row.pos) || row.pos < 0 || Object.is(row.pos, -0)) return;
				const pos = row.pos, removed = row.inserted, inserted = row.removed;
				if (!whole(removed) || !whole(inserted) || pos > length || pos + removed.length > length ||
						splitsPair(pos) || splitsPair(pos + removed.length) || read(pos, pos + removed.length) !== removed) return;
				cut(pos); cut(pos + removed.length);
				let [first] = locate(pos), count = 0;
				if (pos === length) first = pieces.length;
				else if (locate(pos)[1] !== 0) first++;
				for (let left = removed.length; left > 0; count++) left -= pieces[first + count].length;
				pieces.splice(first, count, ...(inserted ? [inserted] : []));
				length += inserted.length - removed.length;
				for (let at = pieces.length - 1; at >= 0; at--) if (!pieces[at] && pieces.length > 1) pieces.splice(at, 1);
			}
			groups.push(rows);
			if (length === before.length && pieces.join('') === before) return groups.reverse().flat().map(({pos, removed, inserted}) => ({pos, removed, inserted}));
		}
	} catch (_) { return; }
}

function _rapierRecordMetadata(entry, ledger) {
	try {
		if (Object.hasOwn(entry, 'metadata')) return _rapierValidMetadataEffect(entry.metadata) ? entry.metadata : undefined;
		if (Array.isArray(entry.splices)) return null;
		return _rapierLedgerIndex(ledger).metadata(entry);
	} catch (_) { return undefined; }
}

function _rapierPictureFinish(record, original, earlier, lookup) {
	const tx = record?.transaction, rows = record?.splices;
	if (tx?.operation !== 'document.finish-picture' || !tx.sourceTransactionId || tx.sourceTransactionIds ||
		tx.reverts || tx.reapplies || record.metadata || !Array.isArray(rows) || rows.length !== 2 ||
		original?.transaction?.operation !== 'document.embed-image' || !Array.isArray(original.splices)) return false;
	const reference = rows.find(row => /^\]\[[a-z0-9-]+\]$/i.test(row.removed));
	if (!reference || !/^\]\[[a-z0-9-]+\]$/i.test(reference.inserted) || reference.removed === reference.inserted) return false;
	const definition = rows.find(row => row !== reference), oldLabel = reference.removed.slice(2, -1), newLabel = reference.inserted.slice(2, -1);
	const body = (text, label) => {
		const prefix = '[' + label + ']: ';
		if (typeof text !== 'string' || !text.startsWith(prefix)) return null;
		const value = text.slice(prefix.length), end = value.indexOf(' '), bytes = end < 0 ? value : value.slice(0, end), title = end < 0 ? '' : value.slice(end);
		return dataImage(bytes)?.codec === 'image/svg+xml' && !/[\r\n]/.test(title) ? title : null;
	};
	const title = body(definition.removed, oldLabel);
	if (title === null || body(definition.inserted, newLabel) !== title) return false;
	if (![definition.removed, reference.removed].every(text => {
		let count = 0;
		for (const row of original.splices) for (let at = row.inserted.indexOf(text); at >= 0; at = row.inserted.indexOf(text, at + 1)) count++;
		return count === 1;
	})) return false;
	return rows.every((row, index) => {
		let start = row.pos, end = start + row.removed.length;
		const cross = (splice, owner) => {
			const stop = splice.pos + splice.inserted.length;
			if (splice.pos < end && stop > start || !splice.inserted.length && splice.pos > start && splice.pos < end) {
				if (owner && start >= splice.pos && end <= stop && splice.inserted.slice(start - splice.pos, end - splice.pos) === row.removed) return 'owned';
				return 'changed';
			}
			if (stop <= start) { const shift = splice.removed.length - splice.inserted.length; start += shift; end += shift; }
			return null;
		};
		for (const prior of rows.slice(0, index).reverse()) if (cross(prior, false)) return false;
		for (let at = earlier.length - 1; at >= 0; at--) {
			const prior = earlier[at], source = lookup.splices(prior);
			if (!source) return false;
			const owner = prior === original || prior.transaction?.reapplies === original.transaction.id;
			for (const splice of source.slice().reverse()) {
				const result = cross(splice, owner);
				if (result) return result === 'owned';
			}
		}
		return false;
	});
}

function _rapierHistoryWalker(records, lookup, visit = null, observe = null) {
	let nodes = new Map(), references = new Map(), pictures = new Map();
	const byId = new Map(), finished = new Set(), earlier = [];
	const update = (target, delta) => {
		const pending = [[target, delta]];
		while (pending.length) {
			const [id, change] = pending.pop(), node = nodes.get(id), was = node.active;
			node.blockers += change;
			if (node.blockers < 0) throw Error('effect');
			node.active = node.blockers === 0;
			if (was !== node.active) for (const ref of node.references) pending.push([ref, node.active ? 1 : -1]);
		}
	};
	const activity = new Map();
	const active = id => {
		if (visit) return nodes.get(id).active;
		const pending = [[id, 0]];
		while (pending.length) {
			const frame = pending.at(-1), target = frame[0];
			if (activity.has(target)) { pending.pop(); continue; }
			const dependents = nodes.get(target).dependents;
			if (frame[1] === dependents.length) { activity.set(target, true); pending.pop(); continue; }
			const next = dependents[frame[1]];
			if (!activity.has(next)) pending.push([next, 0]);
			else if (activity.get(next)) { activity.set(target, false); pending.pop(); }
			else frame[1]++;
		}
		return activity.get(id);
	};
	const lastUndo = new Map(), contexts = new Map(), order = [];
	const contextOf = origin => {
		if (!origin) return null;
		if (!_rapierValidAuthored(origin)) throw Error('origin');
		const known = new Set(), pending = origin.basis.slice();
		while (pending.length) {
			const id = pending.pop(), context = contexts.get(id);
			if (!context) throw Error('origin');
			if (known.has(id)) continue;
			known.add(id);
			if (context.basis) pending.push(...context.basis);
			else for (let index = 0; index < context.index; index++) known.add(order[index]);
		}
		const inactive = new Set();
		for (let index = order.length - 1; index >= 0; index--) {
			const id = order[index];
			if (!known.has(id) || inactive.has(id)) continue;
			for (const ref of references.get(id)) {
				if (!known.has(ref)) throw Error('origin');
				inactive.add(ref);
			}
		}
		return {known, inactive};
	};
	const walker = {observe, failed: false};
	walker.add = record => {
		if (walker.failed) return false;
		try {
			const tx = record?.transaction;
			if (!tx || typeof tx.id !== 'string' || !tx.id || nodes.has(tx.id) || (tx.reverts && tx.reapplies)) { walker.failed = true; return false; }
			const supplied = tx.sourceTransactionIds || (tx.sourceTransactionId ? [tx.sourceTransactionId] : []);
			if (!Array.isArray(supplied) || new Set(supplied).size !== supplied.length ||
				(tx.sourceTransactionIds && tx.sourceTransactionId && (supplied.length !== 1 || supplied[0] !== tx.sourceTransactionId))) { walker.failed = true; return false; }
			let refs = supplied;
			if (tx.operation === 'document.finish-picture' && tx.sourceTransactionId) {
				const owner = tx.sourceTransactionId;
				if (!nodes.has(owner) || !active(owner) || finished.has(owner) ||
					!_rapierPictureFinish(record, byId.get(owner), earlier, lookup ||= _rapierRecordIndex(records))) { walker.failed = true; return false; }
				pictures.set(tx.id, owner); finished.add(owner); refs = [];
			}
			if (tx.reverts || tx.reapplies) {
				const target = tx.reverts || tx.reapplies;
				if (!nodes.has(target) || (supplied.length && (supplied.length !== 1 || supplied[0] !== target))) { walker.failed = true; return false; }
				if (tx.reverts) refs = [target];
				else {
					const context = contextOf(record.authored || tx.authored);
					const undo = (lastUndo.get(target) || []).findLast(id => context
						? context.known.has(id) && !context.inactive.has(id) : active(id));
					if (!undo) { walker.failed = true; return false; }
					refs = [undo];
				}
			}
			if (refs.some(id => typeof id !== 'string' || !nodes.has(id) || pictures.has(id))) { walker.failed = true; return false; }
			if (tx.actor?.kind === 'agent' && refs.some(id => byId.get(id).transaction.actor?.kind !== 'agent')) { walker.failed = true; return false; }
			nodes.set(tx.id, {active: true, blockers: 0, references: refs, dependents: []}); references.set(tx.id, refs.slice());
			byId.set(tx.id, record); earlier.push(record);
			for (const ref of refs) {
				nodes.get(ref).dependents.push(tx.id);
				if (visit) update(ref, 1);
			}
			activity.clear();
			const origin = record.authored || tx.authored;
			contexts.set(tx.id, {index: order.length, basis: origin?.basis || null}); order.push(tx.id);
			if (tx.reverts) {
				if (!lastUndo.has(tx.reverts)) lastUndo.set(tx.reverts, []);
				lastUndo.get(tx.reverts).push(tx.id);
			}
			if (visit) visit(record, nodes, refs);
			if (walker.observe) walker.observe(record, refs, active);
			return true;
		} catch (_) { walker.failed = true; return false; }
	};
	walker.finish = () => {
		if (walker.failed) return {ok: false};
		const blockers = new Map(), effectiveActIds = [];
		for (let i = order.length - 1; i >= 0; i--) {
			const id = order[i], node = nodes.get(id), on = visit ? node.active : !(blockers.get(id) > 0);
			if (!visit && on) for (const ref of node.references) blockers.set(ref, (blockers.get(ref) || 0) + 1);
			if (on && !pictures.has(id)) effectiveActIds.push(id);
		}
		effectiveActIds.reverse();
		const result = {ok: true, effectiveActIds, active: new Set(effectiveActIds), references, pictures};
		walker.shared = true;
		return result;
	};
	const add = walker.add;
	walker.add = record => {
		if (walker.shared) { references = new Map(references); pictures = new Map(pictures); walker.shared = false; }
		return add(record);
	};
	return walker;
}

function _rapierWalkHistoryEffects(records, lookup, visit = null, observe = null) {
	if (!Array.isArray(records)) return {ok: false};
	const walker = _rapierHistoryWalker(records, lookup, visit, observe);
	for (const record of records) if (!walker.add(record)) return {ok: false};
	return walker.finish();
}

function _rapierHistoryEffects(records, visit = null) {
	return _rapierWalkHistoryEffects(records, null, visit);
}

function _rapierMetadataProof(lookup, from = null) {
	const values = {...from?.values}, required = {...from?.required},
		assignments = {filename: [...(from?.assignments.filename || [])], docKind: [...(from?.assignments.docKind || [])]};
	const requireInitial = (key, value) => {
		if (Object.hasOwn(required, key) && required[key] !== value) throw Error('metadata_effect');
		required[key] = value;
	};
	const observe = (record, refs, active) => {
		const effect = lookup.metadata(record);
		if (effect === undefined) throw Error('metadata');
		for (const [key, pair] of Object.entries(effect || {})) {
			if (!Object.hasOwn(values, key)) requireInitial(key, pair.before);
			else if (values[key] !== pair.before) throw Error('metadata');
			values[key] = pair.after;
			if (!refs.length) assignments[key].push({id: record.transaction.id, value: pair.after});
		}
		if (!effect && !refs.length) return;
		for (const key of ['filename', 'docKind']) {
			const expected = assignments[key].findLast(row => active(row.id));
			if (expected) {
				if (!Object.hasOwn(values, key)) requireInitial(key, expected.value);
				else if (values[key] !== expected.value) throw Error('metadata_effect');
			} else if (Object.hasOwn(values, key)) requireInitial(key, values[key]);
		}
	};
	const replay = initial => {
		if (!_rapierValidMetadata(initial) || Object.keys(required).some(key => initial[key] !== required[key])) return null;
		return {...initial, ...values};
	};
	return {observe, replay, fork: other => _rapierMetadataProof(other || lookup, {values, required, assignments})};
}

function _rapierMetadataState(initial, records, effects = _rapierHistoryEffects(records)) {
	if (!_rapierValidMetadata(initial) || !effects.ok) return null;
	try {
		const state = {...initial}, lookup = _rapierRecordIndex(records);
		for (const record of records) if (effects.active.has(record.transaction.id) && !effects.references.get(record.transaction.id)?.length) {
			const effect = lookup.metadata(record);
			if (effect === undefined) return null;
			for (const [key, pair] of Object.entries(effect || {})) state[key] = pair.after;
		}
		return state;
	} catch (_) { return null; }
}

function _rapierReplayMetadata(initial, records) {
	if (!_rapierValidMetadata(initial)) return null;
	try {
		const lookup = _rapierRecordIndex(records), proof = _rapierMetadataProof(lookup);
		return _rapierWalkHistoryEffects(records, lookup, null, proof.observe).ok ? proof.replay(initial) : null;
	} catch (_) { return null; }
}

function _rapierHasHistoryEffect(record, earlier = []) {
	const tx = record?.transaction;
	if (!tx || !(tx.reverts || tx.reapplies || tx.sourceTransactionId || tx.sourceTransactionIds?.length)) return false;
	let id = tx.id;
	if (!id) {
		const ids = new Set(earlier.map(row => row?.transaction?.id));
		id = 'candidate'; while (ids.has(id)) id += ':';
	}
	return _rapierHistoryEffects([...earlier, {...record, transaction: {...tx, id}}]).ok;
}

const _rapierPrepareHistoryRecords = (() => {
	const copies = new WeakMap();
	let prepared = new WeakMap();
	const view = collection => Object.freeze({size: collection.size, has: key => collection.has(key),
		...(collection instanceof Map ? {get: key => collection.get(key)} : {}),
		keys: () => collection.keys(), values: () => collection.values(), entries: () => collection.entries(),
		[Symbol.iterator]: () => collection[Symbol.iterator]()});
	const capture = value => {
		const active = new Set(), pending = [{value, depth: 0}], result = {};
		const finish = (frame, value, immutable, height = -1) => {
			const parent = frame.parent;
			if (!parent) { result.value = value; return; }
			parent.immutable &&= immutable;
			parent.height = Math.max(parent.height, height + 1);
			if (!parent.out && parent.previous[frame.key] !== value)
				parent.out = Array.isArray(parent.previous) ? parent.previous.slice() : {...parent.previous};
			if (parent.out) parent.out[frame.key] = value;
		};
		while (pending.length) {
			const frame = pending.pop(), value = frame.value;
			if (frame.leaving) {
				active.delete(value);
				const copy = frame.out ? Object.freeze(frame.out) : frame.previous;
				copies.set(value, {copy, immutable: frame.immutable, height: frame.height, ...(frame.frozen && !frame.immutable ? {frozen: true, descriptors: frame.descriptors, fields: frame.fields} : {})});
				copies.set(copy, {copy, immutable: true, height: frame.height});
				finish(frame, copy, frame.immutable, frame.height); continue;
			}
			const old = frame.parent?.previous;
			if (old && Object.hasOwn(old, frame.key) && Object.is(value, old[frame.key]) && (value === null || typeof value !== 'object')) {
				finish(frame, value, true); continue;
			}
			if (value === null || typeof value === 'boolean' || typeof value === 'string' && !/[\uD800-\uDFFF]/u.test(value) ||
				typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) {
				finish(frame, value, true); continue;
			}
			if (!value || typeof value !== 'object' || frame.depth > 64 || active.has(value)) throw Error('history_data');
			const previous = copies.get(value);
			if (previous?.immutable) {
				if (frame.depth + previous.height > 64) throw Error('history_data');
				finish(frame, previous.copy, true, previous.height); continue;
			}
			frame.previous = previous?.copy;
			frame.height = 0;
			if (previous?.frozen) {
				frame.frozen = frame.immutable = true;
				frame.descriptors = previous.descriptors; frame.fields = previous.fields;
				frame.out = null; frame.leaving = true; active.add(value); pending.push(frame);
				for (let at = frame.fields.length - 1; at >= 0; at--) {
					const key = frame.fields[at], child = frame.descriptors[key].value;
					if (child && typeof child === 'object') pending.push({value: child, parent: frame, key, depth: frame.depth + 1});
				}
				continue;
			}
			frame.frozen = frame.immutable = Object.isFrozen(value);
			const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
			if (!array && !plainPrototype(proto)) throw Error('history_data');
			const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
			if (array && keys.length !== descriptors.length.value + 1) throw Error('history_data');
			for (const key of keys) {
				if (array && key === 'length') continue;
				const field = descriptors[key];
				if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key) ||
					!Object.hasOwn(field, 'value') || !field.enumerable || array &&
					(!/^(0|[1-9]\d*)$/.test(key) || +key >= descriptors.length.value)) throw Error('history_data');
			}
			const fields = array ? keys.filter(key => key !== 'length') : keys;
			const sameKeys = frame.previous && Object.keys(frame.previous).length === fields.length && fields.every(key => Object.hasOwn(frame.previous, key));
			frame.out = sameKeys ? null : array ? [] : {};
			if (!sameKeys && !array) fields.sort();
			frame.descriptors = descriptors; frame.fields = fields;
			frame.leaving = true; active.add(value); pending.push(frame);
			for (let at = fields.length - 1; at >= 0; at--) {
				const key = fields[at], child = descriptors[key].value;
				const prior = array && child && typeof child === 'object' ? copies.get(child) : undefined;
				if (prior?.immutable && !active.has(child) && frame.depth + 1 + prior.height <= 64) {
					finish({parent: frame, key}, prior.copy, true, prior.height); continue;
				}
				pending.push({value: child, parent: frame, key, depth: frame.depth + 1});
			}
		}
		return result.value;
	};
	let resumable = [];
	const rowOf = (lookup, record) => {
		const splices = lookup.splices(record), metadata = lookup.metadata(record);
		if (splices && !Object.isFrozen(splices)) {
			for (const row of splices) Object.freeze(row);
			Object.freeze(splices);
		}
		if (metadata && !Object.isFrozen(metadata)) {
			for (const pair of Object.values(metadata)) Object.freeze(pair);
			Object.freeze(metadata);
		}
		return Object.freeze({record, splices, metadata});
	};
	const observe = (records, basis, byId, rows, effects, proof) => {
		for (const refs of effects.references.values()) Object.freeze(refs);
		const effectView = Object.freeze({ok: true, effectiveActIds: Object.freeze(effects.effectiveActIds),
			active: view(effects.active), references: view(effects.references), pictures: view(effects.pictures)});
		const observation = Object.freeze({ok: effects.ok, records, rows: Object.freeze(rows), effects: effectView, byId: view(byId),
			replayMetadata: initial => effects.ok ? proof.replay(initial) : null,
			validRecord: (index, documentAuthority, maxDocumentBytes, utf8Length, allowGap = false) => {
				if (!effects.ok || !Number.isSafeInteger(index) || index < 0 || index >= records.length) return false;
				const row = rows[index], tx = row.record.transaction;
				return _rapierCheckLedgerRecord(row.record, records[index - 1] || null, documentAuthority, maxDocumentBytes, utf8Length, allowGap,
					{...row, duplicate: false, semantic: !!(tx.reverts || tx.reapplies || tx.sourceTransactionId || tx.sourceTransactionIds?.length)});
			}});
		prepared = new WeakMap([[records, {basis, observation}]]);
		return observation;
	};
	const authorityOf = state => state.records[0]?.transaction?.documentAuthority;
	const keep = state => { resumable = [state, ...resumable.filter(row => row !== state && row.records[0] !== state.records[0] &&
		authorityOf(row) === authorityOf(state))].slice(0, 4); };
	const extend = records => {
		const base = resumable.find(row => row.records.length < records.length && row.records[0] === records[0] &&
			row.records.every((record, at) => record === records[at]));
		if (!base) return null;
		resumable = resumable.filter(row => row !== base);
		const more = records.slice(base.records.length), byId = new Map(base.byId);
		for (const record of more) {
			const id = record?.transaction?.id;
			if (typeof id !== 'string' || !id || byId.has(id)) return null;
			byId.set(id, record);
		}
		const {lookup, walker} = base;
		lookup.extend(more);
		const rows = base.rows.concat(more.map(record => rowOf(lookup, record)));
		const proof = base.proof.fork(lookup);
		walker.observe = proof.observe;
		for (const record of more) if (!walker.add(record)) return null;
		const effects = walker.finish();
		if (!effects.ok) return null;
		if (rows.every(row => row.splices && row.metadata !== undefined)) keep({records, lookup, walker, proof, byId, rows});
		return observe(records, records, byId, rows, effects, proof);
	};
	return (input, earlier = input) => {
		try {
			if (!Array.isArray(input) || !Array.isArray(earlier)) return {ok: false};
			const records = capture(input), basis = input === earlier ? records : capture(earlier), previous = prepared.get(records);
			if (previous?.basis === basis) return previous.observation;
			if (basis === records) {
				let grown = null;
				try { grown = extend(records); } catch (_) { grown = null; }
				if (grown) return grown;
			}
			const byId = new Map();
			for (const record of records) {
				const id = record?.transaction?.id;
				if (typeof id !== 'string' || !id || byId.has(id)) return {ok: false};
				byId.set(id, record);
			}
			const lookup = _rapierRecordIndex(basis), proof = _rapierMetadataProof(lookup);
			const rows = records.map(record => rowOf(lookup, record));
			const walker = _rapierHistoryWalker(records, lookup, null, proof.observe);
			for (const record of records) if (!walker.add(record)) return {ok: false};
			const effects = walker.finish();
			if (!effects.ok) return {ok: false};
			if (basis === records && rows.every(row => row.splices && row.metadata !== undefined))
				keep({records, lookup, walker, proof, byId, rows});
			return observe(records, basis, byId, rows, effects, proof);
		} catch (_) { return {ok: false}; }
	};
})();

const _rapierJournalRecord = (() => {
	const copies = new WeakMap();
	const fixed = value => { if (value && typeof value === 'object') { for (const key of Object.keys(value)) fixed(value[key]); Object.freeze(value); } return value; };
	return record => {
		let copy = copies.get(record);
		if (!copy) { copy = fixed(JSON.parse(JSON.stringify(record))); copies.set(record, copy); }
		return copy;
	};
})();

function _rapierValidLedgerRecord(record, prior, earlier, documentAuthority, maxDocumentBytes, utf8Length, allowGap = false) {
	try {
		if (!_rapierPlainLedgerData(record) || !Array.isArray(earlier)) return false;
		const own = Array.isArray(record?.splices), lookup = own ? null : _rapierRecordIndex(earlier);
		const metadata = Object.hasOwn(record, 'metadata')
			? _rapierValidMetadataEffect(record.metadata) ? record.metadata : undefined : own ? null : lookup.metadata(record);
		return _rapierCheckLedgerRecord(record, prior, documentAuthority, maxDocumentBytes, utf8Length, allowGap,
			{splices: own ? record.splices : lookup.splices(record), metadata,
				semantic: _rapierHasHistoryEffect(record, earlier), duplicate: earlier.some(row => row?.transaction?.id === record?.transaction?.id)});
	} catch (_) { return false; }
}

function _rapierCheckLedgerRecord(record, prior, documentAuthority, maxDocumentBytes, utf8Length, allowGap,
	{splices, metadata, semantic, duplicate}) {
	try {
		if (Object.hasOwn(record, 'authored') && !_rapierValidAuthored(record.authored)) return false;
		if (!record || typeof record !== 'object' ||
				typeof record.beforeHash !== 'string' || !record.beforeHash.length ||
				typeof record.afterHash !== 'string' || !record.afterHash.length) return false;
		const own = Array.isArray(record.splices), navigation = !!(record.transaction?.reverts || record.transaction?.reapplies);
		if ((!own && !navigation) || (own && record.splices.length > 64) ||
			(record.transaction?.reverts && record.transaction?.reapplies)) return false;
		const metadataChanged = Object.values(metadata || {}).some(pair => pair.before !== pair.after);
		const coincidentWitness = !splices?.length && record.beforeHash === record.afterHash &&
			record.authored && _rapierValidAuthored(record.authored) && record.authored.splices.some(row => row.removed.length);
		if (metadata === undefined || (!splices?.length && !metadataChanged && !semantic && !coincidentWitness) ||
			(record.beforeHash === record.afterHash && splices?.length) ||
			(record.beforeHash !== record.afterHash && !splices?.length) ||
			((record.transaction?.sourceTransactionId || record.transaction?.sourceTransactionIds?.length || navigation) && !semantic)) return false;
		if (!splices || splices.length > 64 || !splices.every(row =>
				row && Number.isSafeInteger(row.pos) && row.pos >= 0 && !Object.is(row.pos, -0) &&
				typeof row.removed === 'string' && typeof row.inserted === 'string' &&
				!/[\uD800-\uDFFF]/u.test(row.removed) && !/[\uD800-\uDFFF]/u.test(row.inserted) &&
				utf8Length(row.removed) <= maxDocumentBytes &&
				utf8Length(row.inserted) <= maxDocumentBytes)) return false;
		if (record.authored && record.authored.splices.some(row => utf8Length(row.removed) > maxDocumentBytes || utf8Length(row.inserted) > maxDocumentBytes)) return false;
		const transaction = record.transaction;
		const nullableText = (value, limit, empty = true) => value === null ||
			(typeof value === 'string' && value.length <= limit && (empty || value.length > 0));
		const optional = (value, valid) => value === undefined || valid(value);
		const identity = (value, limit) => typeof value === 'string' && value.length > 0 && value.length <= limit;
		if (!transaction || typeof transaction.id !== 'string' || !transaction.id.length ||
				transaction.id.length > 256 || duplicate ||
				typeof transaction.documentAuthority !== 'string' ||
				transaction.documentAuthority !== documentAuthority ||
				(transaction.transport !== 'platform' && transaction.transport !== 'webmcp') ||
				typeof transaction.operation !== 'string' || !transaction.operation.length ||
				transaction.operation.length > _RAPIER_TRANSACTION_OPERATION_LIMIT ||
				!nullableText(transaction.requestId, _RAPIER_TRANSACTION_REQUEST_LIMIT) ||
				!nullableText(transaction.sourceTransactionId, 256, false) ||
				!optional(transaction.label, value => nullableText(value, 120)) ||
				!optional(transaction.turnBaseRevision, value => Number.isSafeInteger(value) && value >= 0) ||
				!optional(transaction.turnId, value => value === null || identity(value, 160)) ||
				!optional(transaction.turnLabel, value => value === null || identity(value, 120)) ||
				!optional(transaction.contribution, value => identity(value, 120)) ||
				!optional(transaction.contributionBaseRevision, value => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0)) ||
				!optional(transaction.sourceTransactionIds, value => Array.isArray(value) && value.length > 0 &&
					new Set(value).size === value.length && value.every(id => identity(id, 256))) ||
				!optional(transaction.remoteTransactionId, value => identity(value, 256)) ||
				!nullableText(transaction.parent, 256, false) ||
				!nullableText(transaction.reverts, 256, false) ||
				!nullableText(transaction.reapplies, 256, false) ||
				!(transaction.createdAt === null || (Number.isSafeInteger(transaction.createdAt) && transaction.createdAt >= 0)) ||
				!Array.isArray(transaction.affectedBlockIds) ||
				!transaction.affectedBlockIds.every(id => Number.isSafeInteger(id) && id >= 0) ||
				!Number.isSafeInteger(transaction.revision) || transaction.revision < 1 ||
				!Number.isSafeInteger(transaction.baseRevision) ||
				transaction.baseRevision + 1 !== transaction.revision ||
				(prior && (transaction.revision <= prior.transaction.revision ||
					(transaction.baseRevision === prior.transaction.revision
						? (transaction.parent !== prior.transaction.id || record.beforeHash !== prior.afterHash)
						: (!allowGap || transaction.baseRevision <= prior.transaction.revision))))) return false;
		return !!transaction.actor && typeof transaction.actor.kind === 'string' &&
			/^(?:human|agent|system)$/.test(transaction.actor.kind) &&
			typeof transaction.actor.id === 'string' && transaction.actor.id.length > 0 &&
			transaction.actor.id.length <= _RAPIER_TRANSACTION_ACTOR_LIMIT &&
			optional(transaction.actor.name, value => identity(value, 120));
	} catch (_) { return false; }
}

export { _rapierPrepareHistoryRecords, _rapierValidAuthored, _RAPIER_TRANSACTION_ACTOR_LIMIT, _RAPIER_TRANSACTION_OPERATION_LIMIT, _RAPIER_TRANSACTION_REQUEST_LIMIT, _rapierTransformSplices, _rapierRecordSplices, _rapierValidLedgerRecord, _rapierJournalRecord, _rapierValidMetadata, _rapierValidMetadataEffect, _rapierMetadataDelta, _rapierTransformMetadata, _rapierRecordMetadata, _rapierHistoryEffects, _rapierMetadataState, _rapierReplayMetadata, _rapierHasHistoryEffect, journalOperations};
