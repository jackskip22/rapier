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

function _rapierRecordSplices(entry, ledger) {
	try {
		if (entry && Array.isArray(entry.splices) && entry.splices.length) return entry.splices;
		const transaction = entry && entry.transaction;
		const targetId = String(transaction?.reverts || transaction?.reapplies || '');
		const target = targetId && (ledger || []).find(record => record?.transaction?.id === targetId);
		if (!target || !Array.isArray(target.splices) || !target.splices.length) return null;
		return transaction.reverts ? target.splices.slice().reverse().map(row => ({
			pos: row.pos, removed: row.inserted, inserted: row.removed,
		})) : target.splices;
	} catch (_) { return null; }
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
		const active = new Set(), pending = [[record, false]];
		while (pending.length) {
			const [value, leaving] = pending.pop();
			if (leaving) { active.delete(value); continue; }
			if (value === null || typeof value === 'string' || typeof value === 'boolean') continue;
			if (typeof value === 'number') { if (!Number.isFinite(value)) return false; continue; }
			if (!value || typeof value !== 'object' || active.has(value)) return false;
			const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
			if (!array && proto !== null && (Object.getPrototypeOf(proto) !== null ||
					Object.getOwnPropertyDescriptor(proto, 'constructor')?.value?.name !== 'Object')) return false;
			const keys = Reflect.ownKeys(value);
			if (array && keys.length !== value.length + 1) return false;
			active.add(value); pending.push([value, true]);
			for (const key of keys) {
				if (array && key === 'length') continue;
				if (typeof key !== 'string' || key === '__proto__' || key === 'constructor' || key === 'prototype' ||
						(array && (!Number.isSafeInteger(Number(key)) || Number(key) < 0 ||
							Number(key) >= value.length || String(Number(key)) !== key))) return false;
				const field = Object.getOwnPropertyDescriptor(value, key);
				if (!field || !Object.hasOwn(field, 'value')) return false;
				pending.push([field.value, false]);
			}
		}
		if (!record || typeof record !== 'object' ||
				typeof record.beforeHash !== 'string' || !record.beforeHash.length ||
				typeof record.afterHash !== 'string' || !record.afterHash.length || record.beforeHash === record.afterHash) return false;
		const own = Array.isArray(record.splices) && record.splices.length;
		const navigation = !!(record.transaction?.reverts || record.transaction?.reapplies);
		if ((!own && !navigation) || (own && record.splices.length > 64) ||
				(record.transaction?.reverts && record.transaction?.reapplies)) return false;
		const splices = _rapierRecordSplices(record, earlier);
		if (!splices || splices.length > 64 || !splices.every(row =>
				row && Number.isSafeInteger(row.pos) && row.pos >= 0 && !Object.is(row.pos, -0) &&
				typeof row.removed === 'string' && typeof row.inserted === 'string' &&
				!/[\uD800-\uDFFF]/u.test(row.removed) && !/[\uD800-\uDFFF]/u.test(row.inserted) &&
				utf8Length(row.removed) <= maxDocumentBytes &&
				utf8Length(row.inserted) <= maxDocumentBytes)) return false;
		const transaction = record.transaction;
		const nullableText = (value, limit, empty = true) => value === null ||
			(typeof value === 'string' && value.length <= limit && (empty || value.length > 0));
		// A grouped agent contribution's optional fields, bounded like the identities beside them: a name of 1 to 120 characters, a
		// revision, at most 500 source identities (the journal the kernel retains) of 1 to 160, and a hosted row's identity of 1 to 256.
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
				!nullableText(transaction.sourceTransactionId, _RAPIER_TRANSACTION_REQUEST_LIMIT) ||
				!optional(transaction.contribution, value => identity(value, 120)) ||
				!optional(transaction.contributionBaseRevision, value => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0)) ||
				!optional(transaction.sourceTransactionIds, value => Array.isArray(value) && value.length <= 500 &&
					value.every(id => identity(id, _RAPIER_TRANSACTION_REQUEST_LIMIT))) ||
				!optional(transaction.remoteTransactionId, value => identity(value, 256)) ||
				!nullableText(transaction.parent, 256, false) ||
				!nullableText(transaction.reverts, 256, false) ||
				!nullableText(transaction.reapplies, 256, false) ||
				!Number.isSafeInteger(transaction.createdAt) || transaction.createdAt < 0 ||
				!Array.isArray(transaction.affectedBlockIds) || transaction.affectedBlockIds.length > 64 ||
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
			transaction.actor.id.length <= _RAPIER_TRANSACTION_ACTOR_LIMIT;
	} catch (_) { return false; }
}

export { _RAPIER_TRANSACTION_ACTOR_LIMIT, _RAPIER_TRANSACTION_OPERATION_LIMIT, _RAPIER_TRANSACTION_REQUEST_LIMIT, _rapierTransformSplices, _rapierRecordSplices, _rapierValidLedgerRecord, _rapierJournalRecord};
