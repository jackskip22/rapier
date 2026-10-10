// SPDX-License-Identifier: AGPL-3.0-only
// Sync and device restore preserve the same original acts and inverse targets.
import {merge as mergeLedgers} from '../kit/ledger/merge.mjs';
import {authoredPlacements} from '../kit/ledger/transport.mjs';
const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
const same = (a, b) => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
const refuse = (code, message) => { throw Object.assign(new Error(message), {code}); };
const canonicalPrefix = (a, b) => a.documentAuthority === b.documentAuthority && same(a.start, b.start) &&
	a.records.length <= b.records.length && a.records.every((row, i) => same(row, b.records[i]));
const inverseTargets = tx => [...new Set(tx.sourceTransactionIds || (tx.sourceTransactionId ? [tx.sourceTransactionId] : tx.reverts || tx.reapplies ? [tx.reverts || tx.reapplies] : []))].sort();
function actProvenance(row, authored) {
	const {baseRevision, revision, parent, reverts, reapplies, sourceTransactionId, sourceTransactionIds, remoteTransactionId, ...origin} = row.transaction;
	const inverse = inverseTargets(row.transaction);
	return {transaction: origin, inverse, authored,
		metadata: inverse.length ? null : Object.fromEntries(Object.entries(row.metadata || {}).map(([key, pair]) => [key, pair.after])),
		changeSet: row.changeSet ?? null, derivedCommentIndex: row.derivedCommentIndex ?? null};
}
export function preservesActs(before, after) {
	if (before.documentAuthority !== after.documentAuthority || !same(before.start, after.start)) return false;
	const ids = new Map(after.records.map(row => [row.transaction.id, row]));
	// readLedger already proved both replay paths. Compare the shared original
	// placement, because a concurrent insertion can split a retained physical edit.
	const origins = authoredPlacements(before.start.text, before.records), incoming = authoredPlacements(after.start.text, after.records);
	return before.records.every(row => ids.has(row.transaction.id) && same(actProvenance(row, origins.get(row.transaction.id)),
		actProvenance(ids.get(row.transaction.id), incoming.get(row.transaction.id))));
}
export function joinCanonical(first, second) {
	if (first.sha256 === second.sha256) return first;
	if (canonicalPrefix(first, second)) return second;
	if (canonicalPrefix(second, first)) return first;
	let merged;
	try { merged = mergeLedgers(first, second); }
	catch (cause) { throw Object.assign(new Error('both source histories were kept; their common history cannot be proved'), {code: 'notes_history_conflict', cause}); }
	const ids = new Set([...first.records, ...second.records].map(row => row.transaction.id));
	if (!merged.clean || !preservesActs(first, merged.ledger) || !preservesActs(second, merged.ledger) ||
		merged.ledger.records.some(row => !ids.has(row.transaction.id)))
		refuse('notes_history_conflict', 'both source histories were kept; a merge cannot replace an original act with a conflict or a copy');
	return merged.ledger;
}
