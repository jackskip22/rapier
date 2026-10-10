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

function _rapierRecordSplices(entry, ledger) {
	try {
		if (entry && Array.isArray(entry.splices)) return entry.splices;
		const tx = entry?.transaction, targetId = tx?.reverts || tx?.reapplies;
		const prior = (ledger || []).filter(record => record?.transaction?.revision < tx?.revision);
		const target = targetId && prior.find(record => record?.transaction?.id === targetId);
		if (!target) return null;
		const rows = _rapierRecordSplices(target, prior);
		if (!rows) return null;
		return tx.reverts ? rows.slice().reverse().map(row => ({pos: row.pos, removed: row.inserted, inserted: row.removed})) : rows;
	} catch (_) { return null; }
}

function _rapierRecordMetadata(entry, ledger) {
	try {
		if (Object.hasOwn(entry, 'metadata')) return _rapierValidMetadataEffect(entry.metadata) ? entry.metadata : undefined;
		// An expanded record owns its complete effect; only compact navigation inherits one.
		if (Array.isArray(entry.splices)) return null;
		const tx = entry.transaction, targetId = tx.reverts || tx.reapplies;
		const prior = (ledger || []).filter(record => record?.transaction?.revision < tx.revision);
		const target = targetId && prior.find(record => record?.transaction?.id === targetId);
		if (!target) return undefined;
		const effect = _rapierRecordMetadata(target, prior);
		if (effect == null) return effect;
		return tx.reverts ? Object.fromEntries(Object.entries(effect).map(([key, pair]) =>
			[key, {before: pair.after, after: pair.before}])) : effect;
	} catch (_) { return undefined; }
}

// Active inverses suppress their targets. Reversing an inverse restores its targets,
// including assignments hidden by later choices. Nothing outside these records is retained.
function _rapierHistoryEffects(records, visit = null) {
	try {
		if (!Array.isArray(records)) return {ok: false};
		const nodes = new Map(), references = new Map();
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
		const lastUndo = new Map();
		for (const record of records) {
			const tx = record?.transaction;
			if (!tx || typeof tx.id !== 'string' || !tx.id || nodes.has(tx.id) || (tx.reverts && tx.reapplies)) return {ok: false};
			const supplied = tx.sourceTransactionIds || (tx.sourceTransactionId ? [tx.sourceTransactionId] : []);
			if (!Array.isArray(supplied) || new Set(supplied).size !== supplied.length ||
				(tx.sourceTransactionIds && tx.sourceTransactionId && (supplied.length !== 1 || supplied[0] !== tx.sourceTransactionId))) return {ok: false};
			let refs = supplied;
			if (tx.reverts || tx.reapplies) {
				const target = tx.reverts || tx.reapplies;
				if (!nodes.has(target) || (supplied.length && (supplied.length !== 1 || supplied[0] !== target))) return {ok: false};
				if (tx.reverts) refs = [target];
				else {
					const undo = lastUndo.get(target);
					if (!undo || !nodes.get(undo).active) return {ok: false};
					refs = [undo];
				}
			}
			if (refs.some(id => typeof id !== 'string' || !nodes.get(id)?.active)) return {ok: false};
			nodes.set(tx.id, {active: true, blockers: 0, references: refs}); references.set(tx.id, refs.slice());
			for (const ref of refs) update(ref, 1);
			if (tx.reverts) lastUndo.set(tx.reverts, tx.id);
			if (visit) visit(record, nodes, refs);
		}
		const effectiveActIds = [...nodes].filter(([, node]) => node.active).map(([id]) => id);
		return {ok: true, effectiveActIds, active: new Set(effectiveActIds), references};
	} catch (_) { return {ok: false}; }
}

function _rapierMetadataState(initial, records, effects = _rapierHistoryEffects(records)) {
	if (!_rapierValidMetadata(initial) || !effects.ok) return null;
	const state = {...initial};
	for (const record of records) if (effects.active.has(record.transaction.id) && !effects.references.get(record.transaction.id)?.length) {
		const effect = _rapierRecordMetadata(record, records);
		if (effect === undefined) return null;
		for (const [key, pair] of Object.entries(effect || {})) state[key] = pair.after;
	}
	return state;
}

// Prove each recorded transition and each inverse's semantic result, not only the final values.
function _rapierReplayMetadata(initial, records) {
	if (!_rapierValidMetadata(initial)) return null;
	let state = {...initial};
	const earlier = [], assignments = {filename: [], docKind: []};
	const effects = _rapierHistoryEffects(records, (record, nodes, refs) => {
		const effect = _rapierRecordMetadata(record, earlier);
		if (effect === undefined) throw Error('metadata');
		state = _rapierTransformMetadata(state, effect);
		if (!state) throw Error('metadata');
		if (!refs.length) for (const [key, pair] of Object.entries(effect || {}))
			assignments[key].push({id: record.transaction.id, value: pair.after});
		for (const key of ['filename', 'docKind']) {
			let expected = initial[key];
			for (let i = assignments[key].length - 1; i >= 0; i--) if (nodes.get(assignments[key][i].id).active) {
				expected = assignments[key][i].value; break;
			}
			if (state[key] !== expected) throw Error('metadata_effect');
		}
		earlier.push(record);
	});
	return effects.ok ? state : null;
}

function _rapierHasHistoryEffect(record, earlier = []) {
	const tx = record?.transaction;
	if (!tx || !(tx.reverts || tx.reapplies || tx.sourceTransactionId || tx.sourceTransactionIds?.length)) return false;
	let id = tx.id;
	if (!id) { id = 'candidate'; while (earlier.some(row => row?.transaction?.id === id)) id += ':'; }
	return _rapierHistoryEffects([...earlier, {...record, transaction: {...tx, id}}]).ok;
}

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
		if (!_rapierPlainLedgerData(record) || (Object.hasOwn(record, 'authored') && !_rapierValidAuthored(record.authored))) return false;
		if (!record || typeof record !== 'object' ||
				typeof record.beforeHash !== 'string' || !record.beforeHash.length ||
				typeof record.afterHash !== 'string' || !record.afterHash.length) return false;
		const own = Array.isArray(record.splices), navigation = !!(record.transaction?.reverts || record.transaction?.reapplies);
		if ((!own && !navigation) || (own && record.splices.length > 64) ||
			(record.transaction?.reverts && record.transaction?.reapplies)) return false;
		const splices = _rapierRecordSplices(record, earlier), metadata = _rapierRecordMetadata(record, earlier);
		const semantic = _rapierHasHistoryEffect(record, earlier);
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
				transaction.id.length > 256 || !Array.isArray(earlier) ||
				earlier.some(row => row?.transaction?.id === transaction.id) ||
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
			optional(transaction.actor.name, value => nullableText(value, 120, false));
	} catch (_) { return false; }
}

export { _rapierValidAuthored, _RAPIER_TRANSACTION_ACTOR_LIMIT, _RAPIER_TRANSACTION_OPERATION_LIMIT, _RAPIER_TRANSACTION_REQUEST_LIMIT, _rapierTransformSplices, _rapierRecordSplices, _rapierValidLedgerRecord, _rapierJournalRecord, _rapierValidMetadata, _rapierValidMetadataEffect, _rapierMetadataDelta, _rapierTransformMetadata, _rapierRecordMetadata, _rapierHistoryEffects, _rapierMetadataState, _rapierReplayMetadata, _rapierHasHistoryEffect};
