// SPDX-License-Identifier: MIT
// Transient projections and selective inverses of the existing canonical journal.
import {_rapierTransformSplices, _rapierRecordSplices, _rapierRecordMetadata, _rapierValidMetadata, _rapierTransformMetadata, _rapierMetadataDelta, _rapierHistoryEffects, _rapierMetadataState, _rapierReplayMetadata} from './journal-records.mjs';
import {diffChars, diffLines} from '../../agent/diff.mjs';
import {textRoot, rootAfter} from './hash.mjs';
import {authoredHistory} from './transport.mjs';
import {plainData} from './data.mjs';

const historyFailure = reason => ({ok: false, reason});
const historyInteger = value => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
const historyBoundary = (source, at) => historyInteger(at) && at <= source.length && !(at > 0 && at < source.length &&
	(source.charCodeAt(at - 1) & 0xFC00) === 0xD800 && (source.charCodeAt(at) & 0xFC00) === 0xDC00);

function historyAct(record, effects = null) {
	const tx = record.transaction;
	return {id: tx.id, actor: {...tx.actor}, createdAt: tx.createdAt, baseRevision: tx.baseRevision, revision: tx.revision,
		operation: tx.operation || 'document.change',
		...(tx.turnId ? {turnId: tx.turnId} : {}),
		...(tx.contribution ? {contribution: tx.contribution} : {}),
		...(tx.sourceTransactionId ? {sourceTransactionId: tx.sourceTransactionId} : {}),
		...(tx.sourceTransactionIds?.length ? {sourceTransactionIds: tx.sourceTransactionIds.slice()} : {}),
		...(tx.reverts ? {reverts: tx.reverts} : {}), ...(tx.reapplies ? {reapplies: tx.reapplies} : {}),
		...(record.changeSet && Object.hasOwn(record.changeSet, 'label') ? {label: record.changeSet.label} : {}),
		...(Array.isArray(tx.affectedBlockIds) ? {affectedBlockIds: tx.affectedBlockIds.slice()} : {}),
		...(record.metadata ? {metadata: plainData(record.metadata)} : {}),
		...(effects ? {active: effects.active.has(tx.id)} : {})};
}

export function groupHistoryActs(acts) {
	const groups = [], grouped = new Map();
	for (const act of acts) {
		const key = JSON.stringify([act.actor.kind, act.actor.id, act.turnId || null, act.turnId ? null : act.id]);
		let group = grouped.get(key);
		if (!group) {
			group = {id: act.turnId || act.id, actor: {...act.actor}, actIds: [], createdAt: act.createdAt,
				...(act.turnId ? {turnId: act.turnId} : {})};
			groups.push(group); grouped.set(key, group);
		}
		group.actIds.push(act.id);
	}
	return groups;
}

// Reading an admitted repair can recover pre-existing lone UTF-16 units. This is
// not a document mutation; the forward replay and roots still validate every row.
function historyPreviousSource(source, splices) {
	let value = source;
	for (let index = splices.length - 1; index >= 0; index--) {
		const row = splices[index];
		if (!row || !historyInteger(row.pos) || typeof row.removed !== 'string' || typeof row.inserted !== 'string' ||
			row.pos > value.length || row.inserted.length > value.length - row.pos ||
			value.slice(row.pos, row.pos + row.inserted.length) !== row.inserted) return null;
		value = value.slice(0, row.pos) + row.removed + value.slice(row.pos + row.inserted.length);
	}
	return value;
}

// This is a projection of the existing records. No source snapshots or provenance survive the call.
function prepareHistory(input) {
	try {
		if (!input || typeof input.source !== 'string' || !Array.isArray(input.records) || !_rapierValidMetadata(input.metadata)) return historyFailure('history_invalid');
		const source = input.source, records = plainData(input.records), ids = new Set(), rows = [];
		const effects = _rapierHistoryEffects(records);
		if (!effects.ok) return historyFailure('history_invalid');
		const revision = input.revision ?? records.at(-1)?.transaction?.revision ?? 0;
		if (!historyInteger(revision)) return historyFailure('history_invalid');
		let prior = input.earliestRevision ?? records[0]?.transaction?.baseRevision ?? revision, complete = prior === 0;
		if (!historyInteger(prior)) return historyFailure('history_invalid');
		for (const record of records) {
			const tx = record?.transaction, actor = tx?.actor;
			if (!tx || typeof tx.id !== 'string' || !tx.id || ids.has(tx.id) || !historyInteger(tx.baseRevision) ||
				!historyInteger(tx.revision) || tx.revision !== tx.baseRevision + 1 || tx.baseRevision < prior ||
				!actor || !['human', 'agent', 'system'].includes(actor.kind) || typeof actor.id !== 'string' || !actor.id ||
				!(tx.createdAt === null || historyInteger(tx.createdAt)) ||
				(tx.turnId != null && (typeof tx.turnId !== 'string' || !tx.turnId || tx.turnId.length > 160))) return historyFailure('history_invalid');
			if (tx.baseRevision !== prior) complete = false;
			const splices = _rapierRecordSplices(record, records), metadata = _rapierRecordMetadata(record, records);
			if (!splices || metadata === undefined || (!splices.length &&
				!Object.values(metadata || {}).some(pair => pair.before !== pair.after) && !effects.references.get(tx.id)?.length)) return historyFailure('history_unavailable');
			rows.push({record, splices, metadata}); ids.add(tx.id); prior = tx.revision;
		}
		if (prior !== revision) return historyFailure('history_unavailable');
		let initialSource = source, initialMetadata = {...input.metadata};
		for (let index = rows.length - 1; index >= 0; index--) {
			initialSource = historyPreviousSource(initialSource, rows[index].splices);
			initialMetadata = _rapierTransformMetadata(initialMetadata, rows[index].metadata, true);
			if (initialSource === null || !initialMetadata) return historyFailure('history_invalid');
		}
		const earliestRevision = rows[0]?.record.transaction.baseRevision ?? revision;
		let replay = initialSource, root = earliestRevision === 0 ? textRoot(initialSource) : null, rootRevision = earliestRevision;
		for (const {record, splices} of rows) {
			const hashed = Object.hasOwn(record, 'beforeHash') || Object.hasOwn(record, 'afterHash');
			if (hashed && (![record.beforeHash, record.afterHash].every(value =>
				typeof value === 'string' && /^\d+:[a-z0-9]+:[a-z0-9]+$/.test(value)) ||
				(splices.length ? record.beforeHash === record.afterHash : record.beforeHash !== record.afterHash)))
				return historyFailure('history_invalid');
			// Roots bind revision zero to the full source. A retained suffix has only a path root;
			// omitted neutral pairs change that root, so a stated revision gap begins a new chain.
			if (record.transaction.baseRevision !== rootRevision) root = null;
			if (hashed) {
				if (root !== null && record.beforeHash !== root) return historyFailure('history_invalid');
				root = record.beforeHash;
			}
			replay = _rapierTransformSplices(replay, splices);
			if (replay === null) return historyFailure('history_invalid');
			if (root !== null) for (const row of splices) root = rootAfter(root, row);
			if (hashed && root !== record.afterHash) return historyFailure('history_invalid');
			rootRevision = record.transaction.revision;
		}
		if (records.some(row => Object.hasOwn(row, 'authored'))) authoredHistory(initialSource, rows.map(({record, splices}) => ({...record, splices})));
		const metadata = _rapierReplayMetadata(initialMetadata, records);
		if (replay !== source || !metadata || ['filename', 'docKind'].some(key => metadata[key] !== input.metadata[key])) return historyFailure('history_invalid');
		return {ok: true, source, initialSource, metadata, initialMetadata, effects, rows, revision, earliestRevision, complete: input.complete !== false && complete && earliestRevision === 0};
	} catch (_) { return historyFailure('history_invalid'); }
}

export function replayHistory(input) {
	const prepared = prepareHistory(input);
	if (!prepared.ok) return prepared;
	const {source, initialSource, metadata, initialMetadata, revision, earliestRevision, complete, rows, effects} = prepared;
	const acts = rows.map(({record}) => historyAct(record, effects));
	return {ok: true, source, initialSource, metadata, initialMetadata, revision, earliestRevision, complete, acts,
		effectiveActIds: effects.effectiveActIds.slice(), groups: groupHistoryActs(acts)};
}

export function sourceBefore(input, actId) {
	const prepared = prepareHistory(input);
	if (!prepared.ok) return prepared;
	let source = prepared.source, metadata = {...prepared.metadata};
	for (let index = prepared.rows.length - 1; index >= 0; index--) {
		const {record, splices} = prepared.rows[index];
		source = historyPreviousSource(source, splices);
		if (source === null) return historyFailure('history_invalid');
		metadata = _rapierTransformMetadata(metadata, prepared.rows[index].metadata, true);
		if (record.transaction.id === actId) return {ok: true, source, metadata, revision: record.transaction.baseRevision,
			act: historyAct(record, prepared.effects), complete: prepared.complete, earliestRevision: prepared.earliestRevision};
	}
	return historyFailure('act_unavailable');
}

function historyRangeBefore(range, splice) {
	const start = splice.pos, end = start + splice.inserted.length, replacement = splice.removed.length;
	const touched = range.from === range.to ? start <= range.from && end >= range.to
		: start === end ? range.from <= start && start <= range.to : start < range.to && end > range.from;
	if (!touched) {
		const shift = end <= range.from ? replacement - splice.inserted.length : 0;
		return {from: range.from + shift, to: range.to + shift, touched: false};
	}
	return {from: range.from <= start ? range.from : range.from >= end ? range.from + replacement - splice.inserted.length : start,
		to: range.to >= end ? range.to + replacement - splice.inserted.length : range.to <= start ? range.to : start + replacement,
		touched: true};
}

export function historyProjection(input, {from = 0, to = input?.source?.length, actId} = {}) {
	const prepared = prepareHistory(input);
	if (!prepared.ok) return prepared;
	if (!historyBoundary(prepared.source, from) || !historyBoundary(prepared.source, to) || to < from) return historyFailure('range_invalid');
	let text = prepared.source, range = {from, to}, before = null;
	const acts = [];
	for (let index = prepared.rows.length - 1; index >= 0; index--) {
		const {record, splices} = prepared.rows[index], after = {...range, source: text.slice(range.from, range.to)};
		let touched = false;
		for (let at = splices.length - 1; at >= 0; at--) {
			const mapped = historyRangeBefore(range, splices[at]); touched ||= mapped.touched;
			range = {from: mapped.from, to: mapped.to};
		}
		text = historyPreviousSource(text, splices);
		if (text === null) return historyFailure('history_invalid');
		const previous = {...range, source: text.slice(range.from, range.to)};
		if (record.transaction.id === actId) before = previous;
		if (touched || record.metadata || prepared.effects.references.get(record.transaction.id)?.length)
			acts.push({...historyAct(record, prepared.effects), before: previous, after});
	}
	if (actId != null && !before) return historyFailure('act_unavailable');
	acts.reverse();
	return {ok: true, from, to, source: prepared.source.slice(from, to), revision: prepared.revision,
		earliestRevision: prepared.earliestRevision, complete: prepared.complete, acts, groups: groupHistoryActs(acts), ...(before ? {before} : {})};
}

function minimalHistorySplice(before, after, pos = 0) {
	let first = 0, a = before.length, b = after.length;
	while (first < a && first < b && before[first] === after[first]) first++;
	if (!historyBoundary(before, first) || !historyBoundary(after, first)) first--;
	while (a > first && b > first && before[a - 1] === after[b - 1]) { a--; b--; }
	if (!historyBoundary(before, a) || !historyBoundary(after, b)) { a++; b++; }
	return {pos: pos + first, removed: before.slice(first, a), inserted: after.slice(first, b)};
}

// Split only at byte-identical runs inside the recorded replacement, never by proportional character positions.
function historyHunks(row) {
	if (row.removed === row.inserted) return [];
	if (!row.removed || !row.inserted) return [{...row}];
	const size = row.removed.length + row.inserted.length;
	const parts = size <= 16384 ? diffChars(row.removed, row.inserted, {maxEditLength: 256})
		: size <= 1024 * 1024 ? diffLines(row.removed, row.inserted, {maxEditLength: 128}) : null;
	if (!parts) return [minimalHistorySplice(row.removed, row.inserted, row.pos)];
	const hunks = [];
	let offset = 0, start = 0, removed = '', inserted = '';
	const flush = () => { if (removed || inserted) hunks.push({pos: row.pos + start, removed, inserted}); removed = ''; inserted = ''; };
	for (const part of parts) {
		if (part.added || part.removed) {
			if (!removed && !inserted) start = offset;
			if (part.added) inserted += part.value;
			else { removed += part.value; offset += part.value.length; }
		} else { flush(); offset += part.value.length; }
	}
	flush();
	return hunks.length <= 64 ? hunks.reverse() : [minimalHistorySplice(row.removed, row.inserted, row.pos)];
}

// Runs retain only exact replacement ancestry. A later replacement owns an ambiguous hunk whole.
export function selectiveUndo(input, actIds, options = {}) {
	const prepared = prepareHistory(input);
	if (!prepared.ok) return prepared;
	if (!Array.isArray(actIds) || !actIds.length || actIds.some(id => typeof id !== 'string' || !id)) return historyFailure('act_invalid');
	if (!options || typeof options !== 'object' || Array.isArray(options) ||
		(options.keepHunk !== undefined && typeof options.keepHunk !== 'function') ||
		(options.splitSplice !== undefined && typeof options.splitSplice !== 'function')) return historyFailure('act_invalid');
	const requested = new Set(actIds), available = new Set(prepared.rows.map(({record}) => record.transaction.id));
	if ([...requested].some(id => !available.has(id))) return historyFailure('act_unavailable');
	const selected = new Set([...requested].filter(id => prepared.effects.active.has(id)));
	const records = prepared.rows.map(({record, splices}) => ({...record, splices}));
	let inverseId = 'planned-inverse'; while (available.has(inverseId)) inverseId += ':';
	const inverse = {splices: [], transaction: {id: inverseId, sourceTransactionIds: [...selected]}};
	const projectedEffects = selected.size ? _rapierHistoryEffects([...records, inverse]) : prepared.effects;
	const afterMetadata = _rapierMetadataState(prepared.initialMetadata, records, projectedEffects);
	if (!afterMetadata) return historyFailure('history_invalid');
	const metadata = _rapierMetadataDelta(prepared.metadata, afterMetadata), effectChanged = selected.size > 0;
	const authoredEffectChanged = records.some(record => !prepared.effects.references.get(record.transaction.id)?.length &&
		prepared.effects.active.has(record.transaction.id) !== projectedEffects.active.has(record.transaction.id));
	if (!authoredEffectChanged) return {ok: true, splices: [], after: prepared.source, actIds: [...requested],
		sourceTransactionIds: [...selected], metadata, afterMetadata, effectChanged, unchanged: !metadata && !effectChanged,
		superseded: [], overlaps: []};
	try {
		let pieces = prepared.initialSource ? [{text: prepared.initialSource, owner: null, lineage: []}] : [];
		const all = [], byId = new Map(), byAct = new Map(), processed = [], keptInverseAncestors = new Set();
		const textOf = rows => rows.map(row => row.text || '').join('');
		const boundary = pos => {
			let offset = 0;
			for (let index = 0; index < pieces.length; index++) {
				const row = pieces[index];
				if (!row.text) continue;
				const end = offset + row.text.length;
				if (pos > offset && pos < end) {
					const at = pos - offset;
					pieces.splice(index, 1, {...row, text: row.text.slice(0, at)}, {...row, text: row.text.slice(at)});
				break;
				}
				offset = end;
			}
			offset = 0;
			let first = pieces.length, last = pieces.length;
			for (let index = 0; index < pieces.length; index++) {
				if (offset === pos) { first = index; last = index; while (last < pieces.length && !pieces[last].text) last++; return {first, last}; }
				offset += pieces[index].text?.length || 0;
			}
			if (offset !== pos) throw Error('range');
			return {first, last};
		};
		const owns = (piece, hunk) => piece === hunk.marker || piece.owner === hunk.id ||
			piece.restoredBy?.includes(hunk.id) || hunk.restoredMarkers?.has(piece);
		const effectiveBefore = (hunk, effects, visiting = new Set()) => {
			if (visiting.has(hunk.id)) return null;
			visiting.add(hunk.id); let text = '';
			for (const piece of hunk.before) {
				if (!piece.text) continue;
				const owner = byId.get(piece.owner);
				if (owner && !effects.active.has(owner.actId) && !owner.kept) {
					if (piece.text !== owner.inserted) return null;
					const prior = effectiveBefore(owner, effects, new Set(visiting));
					if (prior === null) return null;
					text += prior;
				} else text += piece.text;
			}
			return text;
		};
		const reactivate = (actIds, effects) => {
			for (const hunk of all) {
				if (!actIds.has(hunk.actId) || hunk.derived || prepared.effects.references.get(hunk.actId)?.length) continue;
				if (keptInverseAncestors.has(hunk.id)) continue;
				const later = [...hunk.supersededBy].some(id => {
					const next = byId.get(id);
					return next && effects.active.has(next.actId) && !prepared.effects.references.get(next.actId)?.length;
				});
				if (later || pieces.some(piece => piece.text && piece.owner === hunk.id) || (!hunk.inserted && hunk.active)) continue;
				const marker = pieces.indexOf(hunk.marker);
				if (marker < 0) throw Error('reactivation');
				const pos = textOf(pieces.slice(0, marker)).length, current = textOf(pieces);
				const removed = effectiveBefore(hunk, effects);
				if (removed === null || current.slice(pos, pos + removed.length) !== removed) throw Error('reactivation');
				boundary(pos + removed.length);
				const start = boundary(pos), end = boundary(pos + removed.length);
				const at = start.last, count = Math.max(0, end.first - at);
				if (textOf(pieces.slice(at, at + count)) !== removed) throw Error('reactivation');
				const replacedOwners = new Set(pieces.slice(at, at + count).map(piece => piece.owner).filter(Boolean));
				pieces.splice(at, count, ...(hunk.inserted ? [{text: hunk.inserted, owner: hunk.id, lineage: hunk.lineage.slice()}] : []));
				for (const owner of replacedOwners) if (owner !== hunk.id && !pieces.some(piece => piece.text && piece.owner === owner)) {
					const prior = byId.get(owner); if (prior) prior.active = false;
				}
				hunk.active = true; delete hunk.undoneBy;
			}
		};
		const transported = records.some(row => row.authored) ? authoredHistory(prepared.initialSource, records, selected) : null;
		const projectedRows = transported ? transported.records.map(record => ({record, splices: record.splices,
			sourceIndices: transported.sourceIndices.get(record.transaction.id)})) : prepared.rows;
		for (const {record, splices, sourceIndices} of projectedRows) {
			const tx = record.transaction, references = new Set(prepared.effects.references.get(tx.id) || []);
			const actSource = options.keepHunk && selected.has(tx.id) ? textOf(pieces) : null;
			processed.push(record);
			if (references.size) {
				// Exact inverse rows restore the previous run identities. Retain the inverse's
				// own transient marker too, so reversing it restores that same ancestry again.
				const targets = all.filter(hunk => hunk.active && references.has(hunk.actId));
				let restored = targets.length ? pieces.slice() : null;
				const inverses = [], priorSplices = options.keepHunk ? [] : null;
				for (let index = targets.length - 1; restored && index >= 0; index--) {
					const target = targets[index], first = restored.indexOf(target.marker);
					if (first < 0) { restored = null; break; }
					let last = first;
					for (let at = first; at < restored.length; at++) if (owns(restored[at], target)) last = at;
					const pos = textOf(restored.slice(0, first)).length;
					const before = restored.slice(first, last + 1), replacement = [];
					for (const piece of before) {
						if (piece === target.marker) replacement.push(...target.before);
						else if (!owns(piece, target)) replacement.push(piece);
					}
					const id = tx.id + '#inverse:' + index, lineage = new Set([id]);
					for (const piece of before) for (const parent of piece.lineage || piece.mark?.lineage || []) lineage.add(parent);
					const hunk = {id, actId: tx.id, removed: textOf(before), inserted: textOf(replacement), before, reversedHunk: target.id,
						chosen: selected.has(tx.id), lineage: [...lineage], supersededBy: new Set(), active: true,
						restoredMarkers: new Set(replacement.filter(piece => !piece.text))};
					if (hunk.chosen && options.keepHunk) {
						const spliceIndex = splices.findIndex(row => row.pos <= pos && row.pos + row.removed.length >= pos);
						const keep = options.keepHunk({actId: tx.id, spliceIndex: Math.max(0, spliceIndex), hunkIndex: index,
							splice: {pos, removed: hunk.removed, inserted: hunk.inserted}, beforeSource: textOf(restored), actSource, priorSplices});
						if (typeof keep !== 'boolean') throw Error('hunk_selection');
						hunk.chosen = !keep;
					}
					hunk.kept = selected.has(tx.id) && !hunk.chosen;
					// A semantic owner retaining this inverse also retains the exact ancestors
					// it restored; effect reactivation must not change them behind that owner.
					if (hunk.kept) for (let prior = target; prior; prior = byId.get(prior.reversedHunk)) keptInverseAncestors.add(prior.id);
					hunk.marker = {mark: hunk};
					const insertion = replacement.map(piece => piece.text ? {...piece,
						lineage: [...new Set([...(piece.lineage || []), id])],
						restoredBy: [...(piece.restoredBy || []), id]} : piece);
					restored.splice(first, last + 1 - first, hunk.marker, ...insertion);
					inverses.push(hunk); priorSplices?.push({pos, removed: hunk.removed, inserted: hunk.inserted});
				}
				if (restored && textOf(restored) === _rapierTransformSplices(textOf(pieces), splices)) {
					pieces = restored;
					for (const target of targets) { target.active = false; target.undoneBy = tx.id; }
					for (const piece of pieces) if (piece.mark) {
						piece.mark.active = true; delete piece.mark.undoneBy;
					}
					for (const hunk of inverses) { all.push(hunk); byId.set(hunk.id, hunk); }
					byAct.set(tx.id, inverses);
					continue;
				}
			}

			if (references.size) {
				const previous = _rapierHistoryEffects(processed.slice(0, -1)), current = _rapierHistoryEffects(processed);
				const activated = new Set(current.effectiveActIds.filter(id => !previous.active.has(id) &&
					id !== tx.id && !current.references.get(id)?.length));
				if (activated.size) {
					const before = pieces, priorStates = all.map(hunk => [hunk, hunk.active, hunk.undoneBy]); pieces = pieces.slice();
					try {
						reactivate(activated, current);
						if (textOf(pieces) === _rapierTransformSplices(textOf(before), splices)) continue;
					} catch (_) {}
					pieces = before;
					for (const [hunk, active, undoneBy] of priorStates) { hunk.active = active; hunk.undoneBy = undoneBy; }
				}
			}
			const priorSplices = options.keepHunk ? [] : null;
			for (let rowIndex = 0; rowIndex < splices.length; rowIndex++) {
				const original = splices[rowIndex];
				let rows;
				if (options.splitSplice) {
					const beforeSource = textOf(pieces), parts = options.splitSplice({actId: tx.id, beforeSource, splice: original});
					// Semantic boundaries only refine this act's exact bytes, never its history.
					if (!Array.isArray(parts) || _rapierTransformSplices(beforeSource, parts) !== _rapierTransformSplices(beforeSource, [original]))
						throw Error('hunk_projection');
					rows = parts.flatMap(historyHunks);
				} else rows = historyHunks(original);
				for (let index = 0; index < rows.length; index++) {
					const row = rows[index];
					const derived = (sourceIndices?.[rowIndex] ?? rowIndex) === record.derivedCommentIndex;
					let chosen = selected.has(tx.id) && !derived;
					boundary(row.pos + row.removed.length);
					const start = boundary(row.pos), end = boundary(row.pos + row.removed.length);
					let at = start.last, count = Math.max(0, end.first - at);
					if (!row.removed.length) {
						// A new insertion at a replacement's left boundary stays before that replacement.
						const marker = pieces.slice(start.first, start.last).findIndex(item => item.mark?.inserted.length);
						at = marker < 0 ? start.last : start.first + marker; count = 0;
					}
					const removed = pieces.slice(at, at + count);
					if (textOf(removed) !== row.removed) throw Error('replay');
					// A semantic owner may retain a drawing hunk while prose in that same act undoes.
					// The predicate only selects transient hunks; every original row still replays.
					if (chosen && options.keepHunk) {
						const keep = options.keepHunk({actId: tx.id, spliceIndex: rowIndex, hunkIndex: index,
							splice: {pos: row.pos, removed: row.removed, inserted: row.inserted}, beforeSource: textOf(pieces), actSource, priorSplices});
						if (typeof keep !== 'boolean') throw Error('hunk_selection');
						chosen = !keep;
					}
					const id = tx.id + '#' + rowIndex + ':' + index;
					const lineage = new Set([id]);
					for (const piece of removed) for (const parent of piece.lineage || piece.mark?.lineage || []) lineage.add(parent);
					const hunk = {id, actId: tx.id, removed: row.removed, inserted: row.inserted, before: removed, derived,
						chosen, kept: selected.has(tx.id) && !chosen, lineage: [...lineage], supersededBy: new Set(), active: true};
					hunk.marker = {mark: hunk};
					all.push(hunk); byId.set(id, hunk);
					if (!byAct.has(tx.id)) byAct.set(tx.id, []);
					byAct.get(tx.id).push(hunk);
					for (const parent of lineage) {
						const earlier = byId.get(parent);
						if (earlier && earlier !== hunk) earlier.supersededBy.add(id);
					}
					pieces.splice(at, count, hunk.marker, ...(row.inserted ? [{text: row.inserted, owner: id, lineage: [...lineage]}] : []));
					priorSplices?.push({pos: row.pos, removed: row.removed, inserted: row.inserted});
				}
			}
		}
		if (textOf(pieces) !== prepared.source) throw Error('head');
		const origins = new Map();
		let offset = 0;
		for (const piece of pieces) if (piece.text) { origins.set(piece, offset); offset += piece.text.length; }
		const superseded = [];
		for (let index = all.length - 1; index >= 0; index--) {
			const hunk = all[index];
			const inheritedInactive = !hunk.derived && !hunk.kept && !keptInverseAncestors.has(hunk.id) && !projectedEffects.active.has(hunk.actId) &&
				!prepared.effects.references.get(hunk.actId)?.length;
			if (!hunk.chosen && !inheritedInactive) continue;
			hunk.active = prepared.effects.active.has(hunk.actId);
			const laterActIds = [...new Set([...hunk.supersededBy].filter(id =>
				(byId.get(id)?.kept || byId.get(id)?.active && projectedEffects.active.has(byId.get(id)?.actId))).map(id => byId.get(id).actId))];
			const marker = pieces.indexOf(hunk.marker);
			if ((!hunk.active && !inheritedInactive) || laterActIds.length || marker < 0) {
				if (hunk.chosen) superseded.push({actId: hunk.actId, hunk: hunk.id, laterActIds: hunk.undoneBy ? [hunk.undoneBy] : laterActIds,
					reason: hunk.active ? 'later_edit' : 'already_undone'});
				continue;
			}
			for (let at = pieces.length - 1; at >= 0; at--) if (pieces[at] !== hunk.marker && owns(pieces[at], hunk)) pieces.splice(at, 1);
			pieces.splice(pieces.indexOf(hunk.marker), 1, ...hunk.before);
			// Restoring an inverse can restore a deletion marker without any owned
			// text. That exact marker already represents the active deletion.
			for (const piece of hunk.before) if (piece.mark) { piece.mark.active = true; delete piece.mark.undoneBy; }
		}
		// A hidden withdrawal can have no splice of its own. Reversing that withdrawal
		// reactivates the original hunk at its retained marker, never at a text search.
		reactivate(new Set(records.filter(record => !prepared.effects.active.has(record.transaction.id) &&
			projectedEffects.active.has(record.transaction.id)).map(record => record.transaction.id)), projectedEffects);
		const after = textOf(pieces), changes = [];
		let cursor = 0, inserted = '';
		for (const piece of pieces) {
			if (!piece.text) continue;
			const origin = origins.get(piece);
			if (origin == null) { inserted += piece.text; continue; }
			if (origin < cursor) throw Error('source_order');
			const removed = prepared.source.slice(cursor, origin);
			if (removed !== inserted) changes.push(minimalHistorySplice(removed, inserted, cursor));
			inserted = ''; cursor = origin + piece.text.length;
		}
		const removed = prepared.source.slice(cursor);
		if (removed !== inserted) changes.push(minimalHistorySplice(removed, inserted, cursor));
		const splices = changes.length <= 64 ? changes.reverse() : [minimalHistorySplice(prepared.source, after)];
		if (_rapierTransformSplices(prepared.source, splices) !== after) throw Error('plan');
		return {ok: true, splices, after, actIds: [...requested], sourceTransactionIds: [...selected], metadata, afterMetadata,
			effectChanged, unchanged: after === prepared.source && !metadata && !effectChanged, superseded,
			overlaps: superseded.filter(row => row.reason === 'later_edit')};
	} catch (_) { return historyFailure('history_invalid'); }
}
