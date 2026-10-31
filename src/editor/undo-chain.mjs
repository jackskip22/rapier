// SPDX-License-Identifier: AGPL-3.0-only
function _rapierUndoSnapshotMatches(snapshot, authority, epoch, revision, ledgerLength) {
	return snapshot.authority === String(authority || '') &&
		snapshot.epoch === Number(epoch || 0) &&
		snapshot.revision === Number(revision || 0) && snapshot.ledgerLength === ledgerLength;
}

function _rapierUndoRecordIndex(ledger) {
	const byId = new Map(ledger.map(record => [record.transaction.id, record]));
	return byId.size === ledger.length ? byId : null;
}

export { _rapierUndoSnapshotMatches, _rapierUndoRecordIndex };
