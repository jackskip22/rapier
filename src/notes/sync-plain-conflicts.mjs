// SPDX-License-Identifier: AGPL-3.0-only
import {sha256, exactBytes} from './integrity.mjs';
import {inspectTextConflicts, resolveTextConflict, canonicalJSON} from './merge.mjs';
import {manifestName, parseCanonical} from './history.mjs';
import {_rapierHistoryEffects} from '../kit/ledger/journal-records.mjs';
const td = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true});
const fail = () => Object.assign(new Error('this note changed: read both versions again before choosing.'), {code: 'merge_stale'});
const same = (a, b) => canonicalJSON(a) === canonicalJSON(b);
const hash = text => sha256(exactBytes(text));
async function descriptor(conflict, id) {
	return {kind: conflict.kind, path: ['notes', id, 'text'], blockHash: await hash(conflict.block),
		variants: await Promise.all(conflict.variants.map(async row => ({device: row.device, content: await hash(row.text)})))};
}
const belongs = (row, id) => row.path?.[0] === 'notes' && row.path[1] === id && row.path[2] === 'text';
async function choiceReceipts(folder, entry, text, rows) {
	if (!rows.some(row => belongs(row, entry.id) && row.resolvedBy)) return null;
	const prior = await folder.store.read('history/' + manifestName(entry.id));
	const proof = parseCanonical(prior, {noteId: entry.id, text, now: Date.now()});
	if (proof.ledger.sha256 !== entry.canonicalHistory) throw fail();
	const effects = _rapierHistoryEffects(proof.ledger.records);
	if (!effects.ok) throw fail();
	return {active: effects.active, choices: new Set(proof.ledger.records.filter(row => row.transaction.operation === 'notes.sync.resolve').map(row => row.transaction.id))};
}
async function proved(text, id, rows, nested = false, receipts = null) {
	const found = [];
	for (const conflict of inspectTextConflicts(text, {nested})) {
		if (text.indexOf(conflict.block) !== text.lastIndexOf(conflict.block)) continue;
		const compact = await descriptor(conflict, id);
		const kept = rows.find(row => belongs(row, id) && row.blockHash === compact.blockHash && same(row.variants, compact.variants) &&
			(!row.resolvedBy || receipts?.choices.has(row.resolvedBy) && !receipts.active.has(row.resolvedBy)));
		if (kept) found.push({conflict, kept});
	}
	return found;
}
export async function plainConflicts(folder, guard = () => {}) {
	await guard();
	const lease = await folder.owner.acquire(folder.scope);
	try {
		const snapshot = await lease.read(), result = [];
		for (const [file, entry] of Object.entries(snapshot.index.notes)) {
			if (!(snapshot.index.conflicts || []).some(row => belongs(row, entry.id))) continue;
			const read = await lease.read({bodies: [file]}), bytes = read.bodies.get(file);
			if (!bytes || read.index.notes[file]?.id !== entry.id) continue;
			const text = td.decode(bytes);
			const receipts = await choiceReceipts(folder, read.index.notes[file], text, read.index.conflicts || []);
			for (const {conflict, kept} of await proved(text, entry.id, read.index.conflicts || [], false, receipts))
				result.push({file, id: entry.id, digest: await hash(text), conflict: {...conflict, path: kept.path, blockHash: kept.blockHash}});
		}
		await guard(); return result;
	} finally { await lease.release(); }
}
export async function writePlainNote({folder, file, id, digest, text, conflicts = [], choice = null, guard = () => {}, now = Date.now}) {
	await guard();
	const lease = await folder.owner.acquire(folder.scope);
	try {
		const result = await lease.transact(async ({index, bodies}) => {
			await guard();
			const bytes = bodies.get(file), current = bytes && td.decode(bytes);
			if (current == null || index.notes[file]?.id !== id || await hash(current) !== digest) throw fail();
			let next = text, rows = index.conflicts || [], resolved = null;
			if (choice) {
				const receipts = await choiceReceipts(folder, index.notes[file], current, rows);
				const match = (await proved(current, id, rows, false, receipts)).find(row => row.conflict.start === choice.conflict.start &&
					row.conflict.end === choice.conflict.end && row.conflict.block === choice.conflict.block &&
					same(row.conflict.variants, choice.conflict.variants));
				if (!match) throw fail();
				next = resolveTextConflict(current, match.conflict, choice.variant ?? choice.device);
				resolved = match.kept;
			}
			if (typeof next !== 'string') throw fail();
			const keep = new Set((await proved(next, id, rows, true)).map(row => row.kept));
			rows = rows.filter(row => !belongs(row, id) || row.resolvedBy || row === resolved || keep.has(row));
			const inspected = inspectTextConflicts(next);
			for (const conflict of conflicts) {
				if (conflict.advisory === true) continue;
				if (!inspected.some(row => row.block === conflict.block && same(row.variants, conflict.variants))) throw fail();
				const row = await descriptor(conflict, id);
				rows = rows.filter(prior => !belongs(prior, id) || prior.blockHash !== row.blockHash || !prior.resolvedBy);
				if (!rows.some(prior => same(prior, row))) rows.push(row);
			}
			const plan = await folder.planCanonicalChange(index, {file, current, next,
				operation: choice ? 'notes.sync.resolve' : 'notes.sync.merge', now: now()});
			if (resolved) {
				const history = plan.writes.find(row => row.file === 'history/' + manifestName(id));
				const proof = parseCanonical(history?.bytes, {noteId: id, text: next, now: now()});
				const act = proof.ledger.records.at(-1)?.transaction;
				if (proof.ledger.sha256 !== index.notes[file].canonicalHistory || act?.operation !== 'notes.sync.resolve') throw fail();
				rows = rows.map(row => row === resolved ? {...row, resolvedBy: act.id} : row);
			}
			index.conflicts = rows;
			await guard();
			return {kind: choice ? 'sync-choice' : 'sync-plain', index,
				writes: [{file, bytes: exactBytes(next), expectedDigest: digest}, ...plan.writes], canonical: plan.canonical};
		}, {bodies: [file], admissionGuard: guard});
		if (result.dropped?.includes(file)) throw fail();
		return result;
	} finally { await lease.release(); }
}
