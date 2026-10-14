// SPDX-License-Identifier: MIT

const _RAPIER_TRANSACTION_ACTOR_LIMIT = 160;
const _RAPIER_TRANSACTION_OPERATION_LIMIT = 96;
const _RAPIER_TRANSACTION_REQUEST_LIMIT = 160;

/* Validate every row, not only the final string: a half-pair replacement can produce a whole
	 character while leaving unencodable fragments in the ledger; two invalid rows can also repair
	 each other. Refusal is atomic. Pre-existing damage elsewhere stays untouched and editable. */
function _rapierTransformSplices(text, splices, inverse = false) {
	try {
		if (!Array.isArray(splices)) return null;
		let value = String(text == null ? '' : text);
		// In Unicode mode a complete pair is one scalar, outside the surrogate range.
		const whole = text => typeof text === 'string' && !/[\uD800-\uDFFF]/u.test(text);
		const splitsPair = at => at > 0 && at < value.length &&
			(value.charCodeAt(at - 1) & 0xFC00) === 0xD800 &&
			(value.charCodeAt(at) & 0xFC00) === 0xDC00;
		const rows = inverse ? splices.slice().reverse() : splices;
		for (const row of rows) {
			if (!row || !Number.isSafeInteger(row.pos) || row.pos < 0 || Object.is(row.pos, -0)) return null;
			const pos = row.pos;
			const removed = inverse ? row.inserted : row.removed;
			const inserted = inverse ? row.removed : row.inserted;
			if (!whole(removed) || !whole(inserted) || pos > value.length ||
					pos + removed.length > value.length || splitsPair(pos) || splitsPair(pos + removed.length) ||
					value.slice(pos, pos + removed.length) !== removed) return null;
			value = value.slice(0, pos) + inserted + value.slice(pos + removed.length);
		}
		return value;
	} catch (_) { return null; }
}

function _rapierPlainLedgerData(record) {
	try {
		const active = new Set(), pending = [[record, false]];
		while (pending.length) {
			const [value, leaving] = pending.pop();
			if (leaving) { active.delete(value); continue; }
			if (value === null || typeof value === 'boolean') continue;
			if (typeof value === 'string') { if (/[\uD800-\uDFFF]/u.test(value)) return false; continue; }
			if (typeof value === 'number') { if (!Number.isFinite(value) || Object.is(value, -0)) return false; continue; }
			if (!value || typeof value !== 'object' || active.has(value)) return false;
			const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
			if (!array && proto !== null && (Object.getPrototypeOf(proto) !== null ||
				Object.getOwnPropertyDescriptor(proto, 'constructor')?.value?.name !== 'Object')) return false;
			const keys = Reflect.ownKeys(value);
			if (array && keys.length !== value.length + 1) return false;
			active.add(value); pending.push([value, true]);
			for (const key of keys) {
				if (array && key === 'length') continue;
				if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key) ||
					(array && (!Number.isSafeInteger(Number(key)) || Number(key) < 0 || Number(key) >= value.length || String(Number(key)) !== key))) return false;
				const field = Object.getOwnPropertyDescriptor(value, key);
				if (!field || !Object.hasOwn(field, 'value') || !field.enumerable) return false;
				pending.push([field.value, false]);
			}
		}
		return true;
	} catch (_) { return false; }
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

// An origin binds transported placement to exact authored rows and their causal basis.
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

// The lookup is an observation of one call's supplied records. Material rows keep
// their existing borrowed-row API; an inverse owns fresh rows. Navigation only
// follows strictly earlier revisions, including when an unadmitted list is unordered.
function _rapierRecordIndex(records) {
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
			if (path[i].transaction.reverts && value != null) value = effects
				? Object.fromEntries(Object.entries(value).map(([key, pair]) => [key, {before: pair.after, after: pair.before}]))
				: value.slice().reverse().map(row => ({pos: row.pos, removed: row.inserted, inserted: row.removed}));
			cache.set(path[i], value);
		}
		return value;
	};
	return {byId, splices: record => resolve(record, false), metadata: record => resolve(record, true)};
}

function _rapierRecordSplices(entry, ledger) {
	try {
		if (entry && Array.isArray(entry.splices)) return entry.splices;
		return _rapierRecordIndex(ledger || []).splices(entry);
	} catch (_) { return null; }
}

// Source identifies a retained checkpoint even when host revision numbers differ.
function journalOperations(before, after, journal) {
	if (typeof before !== 'string' || typeof after !== 'string' || !Array.isArray(journal)) return;
	if (before === after) return [];
	try {
		let text = after;
		const lookup = _rapierRecordIndex(journal), groups = [];
		for (let index = journal.length - 1; index >= 0; index--) {
			const rows = lookup.splices(journal[index]);
			const prior = _rapierTransformSplices(text, rows, true);
			if (prior === null) return;
			groups.push(rows);
			if (prior === before) return groups.reverse().flat().map(({pos, removed, inserted}) => ({pos, removed, inserted}));
			text = prior;
		}
	} catch (_) { return; }
}

function _rapierRecordMetadata(entry, ledger) {
	try {
		if (Object.hasOwn(entry, 'metadata')) return _rapierValidMetadataEffect(entry.metadata) ? entry.metadata : undefined;
		// An expanded record owns its complete effect; only compact navigation inherits one.
		if (Array.isArray(entry.splices)) return null;
		return _rapierRecordIndex(ledger || []).metadata(entry);
	} catch (_) { return undefined; }
}

// A codec replacement owns only one inserted definition and its reference. Its
// source act remains the picture's author; an arbitrary edit cannot claim upkeep.
function _rapierPictureFinish(record, original, earlier, lookup) {
	const tx = record?.transaction, rows = record?.splices;
	if (tx?.operation !== 'document.finish-picture' || !tx.sourceTransactionId || tx.sourceTransactionIds ||
		tx.reverts || tx.reapplies || record.metadata || !Array.isArray(rows) || rows.length !== 2 ||
		original?.transaction?.operation !== 'document.embed-image' || !Array.isArray(original.splices)) return false;
	const reference = rows.find(row => /^\]\[[a-z0-9-]+\]$/i.test(row.removed));
	if (!reference || !/^\]\[[a-z0-9-]+\]$/i.test(reference.inserted) || reference.removed === reference.inserted) return false;
	const definition = rows.find(row => row !== reference), oldLabel = reference.removed.slice(2, -1), newLabel = reference.inserted.slice(2, -1);
	const body = (text, label) => {
		const prefix = '[' + label + ']: data:image/svg+xml;base64,';
		if (typeof text !== 'string' || !text.startsWith(prefix)) return null;
		const value = text.slice(prefix.length), end = value.indexOf(' '), bytes = end < 0 ? value : value.slice(0, end), title = end < 0 ? '' : value.slice(end);
		return /^[A-Za-z0-9+/]+={0,2}$/.test(bytes) && !/[\r\n]/.test(title) ? title : null;
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

// Every active inverse keeps its original targets suppressed. Independent inverses
// can share a target; withdrawing one restores it only after the last blocker leaves.
// This includes assignments hidden by later choices. No second history is retained.
function _rapierWalkHistoryEffects(records, lookup, visit = null, observe = null) {
	try {
		if (!Array.isArray(records)) return {ok: false};
		const nodes = new Map(), references = new Map(), pictures = new Map(), byId = new Map(), finished = new Set(), earlier = [];
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
		// Most admission needs only the final effect graph. A backwards pass proves it
		// in linear work; prefix activity is asked only by native Redo, picture custody,
		// or a metadata assignment. The explicit stack also bounds long inverse chains.
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
		// Native Redo names an original act. Its inverse target is the last Undo
		// in the author's proved causal view, not an unrelated later arrival.
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
		for (const record of records) {
			const tx = record?.transaction;
			if (!tx || typeof tx.id !== 'string' || !tx.id || nodes.has(tx.id) || (tx.reverts && tx.reapplies)) return {ok: false};
			const supplied = tx.sourceTransactionIds || (tx.sourceTransactionId ? [tx.sourceTransactionId] : []);
			if (!Array.isArray(supplied) || new Set(supplied).size !== supplied.length ||
				(tx.sourceTransactionIds && tx.sourceTransactionId && (supplied.length !== 1 || supplied[0] !== tx.sourceTransactionId))) return {ok: false};
			let refs = supplied;
			if (tx.operation === 'document.finish-picture' && tx.sourceTransactionId) {
				const owner = tx.sourceTransactionId;
				if (!nodes.has(owner) || !active(owner) || finished.has(owner) ||
					!_rapierPictureFinish(record, byId.get(owner), earlier, lookup ||= _rapierRecordIndex(records))) return {ok: false};
				pictures.set(tx.id, owner); finished.add(owner); refs = [];
			}
			if (tx.reverts || tx.reapplies) {
				const target = tx.reverts || tx.reapplies;
				if (!nodes.has(target) || (supplied.length && (supplied.length !== 1 || supplied[0] !== target))) return {ok: false};
				if (tx.reverts) refs = [target];
				else {
					const context = contextOf(record.authored || tx.authored);
					const undo = (lastUndo.get(target) || []).findLast(id => context
						? context.known.has(id) && !context.inactive.has(id) : active(id));
					if (!undo) return {ok: false};
					refs = [undo];
				}
			}
			if (refs.some(id => typeof id !== 'string' || !nodes.has(id) || pictures.has(id))) return {ok: false};
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
			if (observe) observe(record, refs, active);
		}
		if (!visit) for (let i = order.length - 1; i >= 0; i--) {
			const node = nodes.get(order[i]); node.active = node.blockers === 0;
			if (node.active) for (const ref of node.references) nodes.get(ref).blockers++;
		}
		const effectiveActIds = [...nodes].filter(([id, node]) => node.active && !pictures.has(id)).map(([id]) => id);
		return {ok: true, effectiveActIds, active: new Set(effectiveActIds), references, pictures};
	} catch (_) { return {ok: false}; }
}

function _rapierHistoryEffects(records, visit = null) {
	return _rapierWalkHistoryEffects(records, null, visit);
}

// Every transition constrains the two initial metadata scalars. This proves each
// inverse's result once, before the caller supplies the exact initial metadata.
function _rapierMetadataProof(lookup) {
	const values = {}, required = {}, assignments = {filename: [], docKind: []};
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
		// Source-only rows cannot change a previously proved metadata assignment.
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
	return {observe, replay};
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

// Prove each recorded transition and each inverse's semantic result, not only the final values.
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

// A cached observation owns every byte-bearing record. Mutable graphs are compared
// through descriptors on every call; only a proved, recursively frozen graph can
// bypass that walk. Per-object weak entries keep one latest copy, not a revision log.
const _rapierPrepareHistoryRecords = (() => {
	const copies = new WeakMap();
	// Repeated queries share the latest proved snapshot. A live but inactive input
	// does not need to retain its record/effect indexes; immutable copies remain weak.
	let prepared = new WeakMap();
	// Object.freeze does not freeze Map/Set entries. Keep those collections inside
	// the preparation and expose only immutable values through reading closures.
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
				// A frozen shell fixes its descriptors, but every mutable child is still
				// observed afresh. Fixed scalar fields need no second Unicode/data proof.
				frame.frozen = frame.immutable = true;
				frame.descriptors = previous.descriptors; frame.fields = previous.fields;
				frame.out = null; frame.leaving = true; active.add(value); pending.push(frame);
				for (let at = frame.fields.length - 1; at >= 0; at--) {
					const key = frame.fields[at], child = frame.descriptors[key].value;
					if (child && typeof child === 'object') pending.push({value: child, parent: frame, key, depth: frame.depth + 1});
				}
				continue;
			}
			// Check frozen-ness before capturing descriptors. A caller freezing a mutable
			// input later cannot retroactively certify an earlier view of its properties.
			frame.frozen = frame.immutable = Object.isFrozen(value);
			const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
			if (!array && proto !== null && (Object.getPrototypeOf(proto) !== null ||
				Object.getOwnPropertyDescriptor(Object.getOwnPropertyDescriptor(proto, 'constructor')?.value || {}, 'name')?.value !== 'Object')) throw Error('history_data');
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
				const key = fields[at]; pending.push({value: descriptors[key].value, parent: frame, key, depth: frame.depth + 1});
			}
		}
		return result.value;
	};
	return (input, earlier = input) => {
		try {
			if (!Array.isArray(input) || !Array.isArray(earlier)) return {ok: false};
			const records = capture(input), basis = input === earlier ? records : capture(earlier), previous = prepared.get(records);
			if (previous?.basis === basis) return previous.observation;
			const byId = new Map();
			for (const record of records) {
				const id = record?.transaction?.id;
				if (typeof id !== 'string' || !id || byId.has(id)) return {ok: false};
				byId.set(id, record);
			}
			const lookup = _rapierRecordIndex(basis), proof = _rapierMetadataProof(lookup);
			const rows = records.map(record => {
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
			});
			const effects = _rapierWalkHistoryEffects(records, lookup, null, proof.observe);
			if (!effects.ok) return {ok: false};
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
			prepared = new WeakMap([[records, {basis, observation}]]); return observation;
		} catch (_) { return {ok: false}; }
	};
})();

// A ledger record as the journal and the Notes return validate it below: plain data, nothing
// undefined anywhere in it. A live record could carry a row whose type or order is not yet known (a
// block just inserted, before its first render: `type: undefined`), and the validator would refuse
// the whole ledger for that one field -- silently at boot, where a refused ledger is cleared, and
// as "Rapier could not be reopened: the document history could not be restored" on a return from
// Notes. The copy is made once per record; records are frozen, so it never goes stale.
const _rapierJournalRecord = (() => {
	const copies = new WeakMap();
	return record => {
		let copy = copies.get(record);
		if (!copy) { copy = JSON.parse(JSON.stringify(record)); copies.set(record, copy); }
		return copy;
	};
})();

function _rapierValidLedgerRecord(record, prior, earlier, documentAuthority, maxDocumentBytes, utf8Length, allowGap = false) {
	// Recovery records are data, not executable objects. Inspect descriptors without invoking
	// accessors, and use an ancestor set (not a global seen set) so shared acyclic data stays valid.
	// Iterative traversal refuses cycles without exhausting the call stack. Proxies/counters that
	// throw are refused by the same gate rather than escaping into document recovery.
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

// Both callers proved plain data themselves: the public single-row validator above,
// or the private owned-snapshot preparation. No caller-supplied trusted flag exists.
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
		if (metadata === undefined || (!splices?.length && !Object.values(metadata || {}).some(pair => pair.before !== pair.after) && !semantic) ||
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
		// Identity fields are bounded individually; durable history has no record-count limit.
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
