// SPDX-License-Identifier: AGPL-3.0-only
// Pure decisions only. The engine retains ledger mutation, byte accounting, source ownership,
// branch filtering and rollback. Records keep their identity; no history is copied or re-hashed.
function _rapierUndoTrimCut(ledger) {
	const lastReference = new Map();
	for (let index = 1; index < ledger.length; index++) {
		const transaction = ledger[index].transaction || {};
		lastReference.set(String(transaction.reverts || transaction.reapplies || ''), index);
	}
	let cut = 1;
	for (let index = 0; index < cut && index < ledger.length; index++) {
		if (Array.isArray(ledger[index].splices) && ledger[index].splices.length) {
			const last = lastReference.get(ledger[index].transaction.id);
			if (last !== undefined) cut = Math.max(cut, last + 1);
		}
	}
	return cut;
}

function _rapierUndoNavigationPairIndex(ledger) {
	for (let index = 1; index + 2 < ledger.length; index++) {
		const first = ledger[index], second = ledger[index + 1];
		const firstTarget = String(first.transaction?.reverts || first.transaction?.reapplies || '');
		const secondTarget = String(second.transaction?.reverts || second.transaction?.reapplies || '');
		if ((!Array.isArray(first.splices) || !first.splices.length) &&
				(!Array.isArray(second.splices) || !second.splices.length) &&
				firstTarget && firstTarget === secondTarget &&
				!!first.transaction.reverts !== !!second.transaction.reverts &&
				second.transaction.parent === first.transaction.id &&
				second.transaction.baseRevision === first.transaction.revision) return index;
	}
	return -1;
}

function _rapierUndoMaterialPairIndex(ledger, branch, cursor) {
	for (let index = 1; index + 2 < ledger.length; index++) {
		const first = ledger[index], second = ledger[index + 1];
		const id = String(first.transaction?.id || '');
		const branchIndex = branch.indexOf(first);
		if (Array.isArray(first.splices) && first.splices.length &&
				!first.transaction?.reverts && !first.transaction?.reapplies &&
				(!Array.isArray(second.splices) || !second.splices.length) &&
				second.transaction?.reverts === id && !second.transaction?.reapplies &&
				second.transaction.parent === id &&
				second.transaction.baseRevision === first.transaction.revision &&
				first.afterHash === second.beforeHash &&
				branchIndex >= cursor &&
				!ledger.slice(index + 2).some(record =>
					String(record.transaction?.reverts || record.transaction?.reapplies || '') === id)) return index;
	}
	return -1;
}

function _rapierUndoSnapshotMatches(snapshot, authority, epoch, revision, ledgerLength) {
	return snapshot.authority === String(authority || '') &&
		snapshot.epoch === Number(epoch || 0) &&
		snapshot.revision === Number(revision || 0) && snapshot.ledgerLength === ledgerLength;
}

function _rapierUndoRecordIndex(ledger) {
	const byId = new Map(ledger.map(record => [record.transaction.id, record]));
	return byId.size === ledger.length ? byId : null;
}

export { _rapierUndoTrimCut, _rapierUndoNavigationPairIndex, _rapierUndoMaterialPairIndex,
	_rapierUndoSnapshotMatches, _rapierUndoRecordIndex };
