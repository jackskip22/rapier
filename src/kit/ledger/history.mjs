// SPDX-License-Identifier: MIT
import {_rapierTransformSplices, _rapierValidMetadata, _rapierTransformMetadata, _rapierMetadataDelta, _rapierHistoryEffects, _rapierMetadataState, _rapierPrepareHistoryRecords} from './journal-records.mjs';
import {projectInverseSource, HistorySource} from './inverse-source.mjs';
import {textRootParts, rootAfter} from './hash.mjs';
import {authoredHistory, authoredPlacements} from './transport.mjs';
import {plainData, canonicalJSON} from './data.mjs';

const historyFailure = reason => ({ok: false, reason});
const historyInteger = value => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
const historyBoundary = (source, at) => historyInteger(at) && at <= source.length && !(at > 0 && at < source.length &&
	(source.charCodeAt(at - 1) & 0xFC00) === 0xD800 && (source.charCodeAt(at) & 0xFC00) === 0xDC00);

function historyAct(record, effects = null) {
	const tx = record.transaction, copy = value => value && typeof value === 'object' ? plainData(value) : value;
	return {id: tx.id, actor: Object.fromEntries(Object.entries(tx.actor).map(([key, value]) => [key, copy(value)])), createdAt: tx.createdAt, baseRevision: tx.baseRevision, revision: tx.revision,
		operation: copy(tx.operation) || 'document.change',
		...(tx.turnId ? {turnId: tx.turnId} : {}),
		...(tx.contribution ? {contribution: copy(tx.contribution)} : {}),
		...(tx.sourceTransactionId ? {sourceTransactionId: tx.sourceTransactionId} : {}),
		...(tx.sourceTransactionIds?.length ? {sourceTransactionIds: tx.sourceTransactionIds.slice()} : {}),
		...(tx.reverts ? {reverts: tx.reverts} : {}), ...(tx.reapplies ? {reapplies: tx.reapplies} : {}),
		...(record.changeSet && Object.hasOwn(record.changeSet, 'label') ? {label: copy(record.changeSet.label)} : {}),
		...(Array.isArray(tx.affectedBlockIds) ? {affectedBlockIds: tx.affectedBlockIds.map(copy)} : {}),
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

export function pictureHistorySplices(input, target, redo) {
	const {records} = input;
	const id = target?.transaction?.id, at = records.indexOf(target);
	if (!id || at < 0 || target.transaction.operation === 'document.finish-picture' || !Array.isArray(target.splices)) return null;
	const later = records.slice(at + 1).filter(row => row?.transaction?.operation === 'document.finish-picture' && Array.isArray(row.splices) && row.splices.length);
	if (!later.length) return null;
	const source = input.source;
	const own = new Set(later.filter(row => row.transaction.sourceTransactionId === id));
	const step = redo ? target.splices : target.splices.slice().reverse().map(row => ({pos: row.pos, removed: row.inserted, inserted: row.removed}));
	const plan = moveOthers => {
		let text = source;
		const rows = [], moved = new Set();
		const only = needle => { const found = text.indexOf(needle); return found >= 0 && text.indexOf(needle, found + 1) < 0 ? found : -1; };
		const apply = row => { const next = _rapierTransformSplices(text, [row]); if (next === null) throw Error('picture_target'); text = next; rows.push(row); };
		const swap = (record, back) => {
			const found = record.splices.map(splice => { const from = back ? splice.inserted : splice.removed; return from ? only(from) : -1; });
			if (found.every(position => position < 0)) return false;
			if (found.some(position => position < 0)) throw Error('partial_picture');
			for (const splice of record.splices) {
				const from = back ? splice.inserted : splice.removed, to = back ? splice.removed : splice.inserted;
				apply({pos: only(from), removed: from, inserted: to});
			}
			return true;
		};
		for (const record of later.slice().reverse()) if ((moveOthers || own.has(record)) && swap(record, true)) moved.add(record);
		for (const splice of step) apply(splice);
		for (const record of later) if (own.has(record) ? redo : moved.has(record)) swap(record, false);
		return rows;
	};
	try { const rows = plan(false); return !own.size && rows.length === step.length ? null : rows; } catch (_) {}
	try { return plan(true); } catch (_) { return null; }
}

let preparedHistories = new WeakMap();
function prepareHistory(input) {
	try {
		if (!input || typeof input.source !== 'string' || !Array.isArray(input.records) || !_rapierValidMetadata(input.metadata)) return historyFailure('history_invalid');
		const source = input.source, metadata = {...input.metadata}, index = _rapierPrepareHistoryRecords(input.records);
		if (!index.ok) return historyFailure('history_invalid');
		const {records, effects} = index;
		const revision = input.revision ?? records.at(-1)?.transaction?.revision ?? 0;
		let prior = input.earliestRevision ?? records[0]?.transaction?.baseRevision ?? revision;
		if (!historyInteger(revision) || !historyInteger(prior)) return historyFailure('history_invalid');
		const earliest = prior, suppliedComplete = input.complete !== false, cached = preparedHistories.get(records);
		if (cached && cached.source === source && cached.revision === revision && cached.earliest === earliest &&
			cached.suppliedComplete === suppliedComplete && cached.metadata.filename === metadata.filename && cached.metadata.docKind === metadata.docKind) return cached;
		let complete = prior === 0;
		const rows = [], byId = new Map();
		for (const owned of index.rows) {
			const {record, splices, metadata: effect} = owned, tx = record?.transaction, actor = tx?.actor;
			if (!tx || typeof tx.id !== 'string' || !tx.id || byId.has(tx.id) || !historyInteger(tx.baseRevision) ||
				!historyInteger(tx.revision) || tx.revision !== tx.baseRevision + 1 || tx.baseRevision < prior ||
				!actor || !['human', 'agent', 'system'].includes(actor.kind) || typeof actor.id !== 'string' || !actor.id ||
				!(tx.createdAt === null || historyInteger(tx.createdAt)) ||
				(tx.turnId != null && (typeof tx.turnId !== 'string' || !tx.turnId || tx.turnId.length > 160))) return historyFailure('history_invalid');
			if (tx.baseRevision !== prior) complete = false;
			const coincidentWitness = !splices.length && record.authored && Array.isArray(record.authored.splices) &&
				record.authored.splices.some(row => row.removed.length);
			if (!splices || effect === undefined || (!splices.length &&
				!Object.values(effect || {}).some(pair => pair.before !== pair.after) && !effects.references.get(tx.id)?.length &&
				!coincidentWitness)) return historyFailure('history_unavailable');
			const row = {record, splices, metadata: effect};
			rows.push(row); byId.set(tx.id, row); prior = tx.revision;
		}
		if (prior !== revision) return historyFailure('history_unavailable');
		let initial = new HistorySource(source), initialMetadata = {...metadata};
		for (let at = rows.length - 1; at >= 0; at--) {
			const row = rows[at];
			row.afterSource = initial; row.afterMetadata = initialMetadata;
			initial = initial.before(row.splices);
			initialMetadata = _rapierTransformMetadata(initialMetadata, row.metadata, true);
			if (!initial || !initialMetadata) return historyFailure('history_invalid');
			row.beforeSource = initial; row.beforeMetadata = initialMetadata;
		}
		const earliestRevision = records[0]?.transaction.baseRevision ?? revision;
		let root = earliestRevision === 0 ? (typeof input.earliestRoot === 'string' && input.earliestRoot || textRootParts(initial.parts())) : null,
			rootRevision = earliestRevision;
		for (const {record, splices} of rows) {
			const hashed = Object.hasOwn(record, 'beforeHash') || Object.hasOwn(record, 'afterHash');
			if (hashed && (![record.beforeHash, record.afterHash].every(value =>
				typeof value === 'string' && /^\d+:[a-z0-9]+:[a-z0-9]+$/.test(value)) ||
				(splices.length ? record.beforeHash === record.afterHash : record.beforeHash !== record.afterHash))) return historyFailure('history_invalid');
			if (record.transaction.baseRevision !== rootRevision) root = null;
			if (hashed) {
				if (root !== null && record.beforeHash !== root) return historyFailure('history_invalid');
				root = record.beforeHash;
			}
			if (root !== null) for (const splice of splices) root = rootAfter(root, splice);
			if (hashed && root !== record.afterHash) return historyFailure('history_invalid');
			rootRevision = record.transaction.revision;
		}
		let initialText;
		const initialSource = () => initialText ??= initial.slice();
		if (records.some(row => Object.hasOwn(row, 'authored'))) authoredHistory(initialSource(), rows.map(({record, splices}) => ({...record, splices})));
		const replayedMetadata = index.replayMetadata(initialMetadata);
		if (!replayedMetadata || ['filename', 'docKind'].some(key => replayedMetadata[key] !== metadata[key])) return historyFailure('history_invalid');
		const resolvedRecords = Object.freeze(rows.map(({record, splices}) => record.splices === splices ? record : Object.freeze({...record, splices}))); 
		const prepared = {ok: true, source, records: resolvedRecords, get initialSource() { return initialSource(); }, initial, metadata, initialMetadata, effects, rows, byId,
			revision, earliest, suppliedComplete, earliestRevision, complete: suppliedComplete && complete && earliestRevision === 0};
		preparedHistories = new WeakMap([[records, prepared]]);
		return prepared;
	} catch (_) { return historyFailure('history_invalid'); }
}

function settle(result, value) {
	Object.defineProperty(result, 'initialSource', {value, writable: true, enumerable: true, configurable: true});
	return value;
}

export function replayHistory(input) {
	const prepared = prepareHistory(input);
	if (!prepared.ok) return prepared;
	const {source, metadata, initialMetadata, revision, earliestRevision, complete, rows, effects} = prepared;
	const acts = rows.filter(({record}) => !effects.pictures.has(record.transaction.id)).map(({record}) => historyAct(record, effects));
	return {ok: true, source, get initialSource() { return settle(this, prepared.initialSource); }, set initialSource(value) { settle(this, value); },
		metadata: {...metadata}, initialMetadata: {...initialMetadata}, revision, earliestRevision, complete, acts,
		effectiveActIds: effects.effectiveActIds.slice(), groups: groupHistoryActs(acts)};
}

export function sourceBefore(input, actId) {
	const prepared = prepareHistory(input);
	if (!prepared.ok) return prepared;
	const row = prepared.byId.get(actId);
	if (!row) return historyFailure('act_unavailable');
	return {ok: true, source: row.beforeSource.slice(), metadata: {...row.beforeMetadata}, revision: row.record.transaction.baseRevision,
		act: historyAct(row.record, prepared.effects), complete: prepared.complete, earliestRevision: prepared.earliestRevision};
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

function projectHistoryRange(prepared, from, to, actId) {
	if (!historyBoundary(prepared.source, from) || !historyBoundary(prepared.source, to) || to < from) return historyFailure('range_invalid');
	let range = {from, to}, before = null;
	const acts = [];
	for (let index = prepared.rows.length - 1; index >= 0; index--) {
		const {record, splices, beforeSource, afterSource} = prepared.rows[index], afterRange = range;
		let touched = false;
		for (let at = splices.length - 1; at >= 0; at--) {
			const mapped = historyRangeBefore(range, splices[at]); touched ||= mapped.touched;
			range = {from: mapped.from, to: mapped.to};
		}
		const include = !prepared.effects.pictures.has(record.transaction.id) &&
			(touched || record.metadata || prepared.effects.references.get(record.transaction.id)?.length);
		if (include || record.transaction.id === actId) {
			const previous = {...range, source: beforeSource.slice(range.from, range.to)};
			if (record.transaction.id === actId) before = previous;
			if (include) acts.push({...historyAct(record, prepared.effects), before: previous,
				after: {...afterRange, source: afterSource.slice(afterRange.from, afterRange.to)}});
		}
	}
	if (actId != null && !before) return historyFailure('act_unavailable');
	acts.reverse();
	return {ok: true, from, to, source: prepared.source.slice(from, to), revision: prepared.revision,
		earliestRevision: prepared.earliestRevision, complete: prepared.complete, acts, groups: groupHistoryActs(acts), ...(before ? {before} : {})};
}

export function historyProjection(input, {from = 0, to = input?.source?.length, actId} = {}) {
	const prepared = prepareHistory(input);
	if (!prepared.ok) return prepared;
	return projectHistoryRange(prepared, from, to, actId);
}

export function historyProjections(input, ranges) {
	const prepared = prepareHistory(input);
	if (!prepared.ok) return prepared;
	if (!Array.isArray(ranges)) return historyFailure('range_invalid');
	return {ok: true, projections: ranges.map(({from = 0, to = prepared.source.length, actId} = {}) =>
		projectHistoryRange(prepared, from, to, actId))};
}

function historyBlockIndex(projected) {
	const items = projected.map(block => ({block, range: {from: block.from, to: block.to}, shift: 0}))
		.sort((a, b) => a.range.from - b.range.from);
	const refresh = node => {
		node.minFrom = node.left?.minFrom ?? node.range.from;
		node.maxTo = Math.max(node.range.to, node.left?.maxTo ?? -1, node.right?.maxTo ?? -1);
	};
	const build = (from, to, parent = null) => {
		if (from === to) return null;
		const mid = Math.floor((from + to) / 2), node = items[mid];
		node.parent = parent; node.left = build(from, mid, node); node.right = build(mid + 1, to, node);
		refresh(node); return node;
	};
	const root = build(0, items.length);
	const shift = (node, delta) => {
		if (!node || !delta) return;
		node.range = {from: node.range.from + delta, to: node.range.to + delta};
		node.minFrom += delta; node.maxTo += delta; node.shift += delta;
	};
	const move = (node, splice, touch) => {
		if (!node || node.maxTo < splice.pos) return;
		const end = splice.pos + splice.inserted.length;
		if (node.minFrom > end) { shift(node, splice.removed.length - splice.inserted.length); return; }
		if (node.shift) { shift(node.left, node.shift); shift(node.right, node.shift); node.shift = 0; }
		const mapped = historyRangeBefore(node.range, splice);
		if (mapped.touched) touch(node);
		node.range = {from: mapped.from, to: mapped.to};
		move(node.left, splice, touch); move(node.right, splice, touch); refresh(node);
	};
	return {move: (splice, touch) => move(root, splice, touch), range(node) {
		let delta = 0;
		for (let parent = node.parent; parent; parent = parent.parent) delta += parent.shift;
		return {from: node.range.from + delta, to: node.range.to + delta};
	}};
}

export function historyPlaces(input, blocks) {
	const prepared = prepareHistory(input);
	if (!prepared.ok) return prepared;
	if (!Array.isArray(blocks) || blocks.some(block => !block ||
		!historyBoundary(prepared.source, block.from) || !historyBoundary(prepared.source, block.to) || block.to < block.from))
		return historyFailure('range_invalid');
	const projected = blocks.map(block => ({id: block.id, from: block.from, to: block.to,
		source: prepared.source.slice(block.from, block.to), acts: []}));
	const ranges = historyBlockIndex(projected);
	for (let index = prepared.rows.length - 1; index >= 0; index--) {
		const {record, splices, beforeSource, afterSource} = prepared.rows[index], touched = new Map();
		for (let at = splices.length - 1; at >= 0; at--) ranges.move(splices[at], node => {
			if (touched.has(node) || prepared.effects.pictures.has(record.transaction.id)) return;
			let after = {...node.range};
			for (let prior = at + 1; prior < splices.length; prior++) {
				const row = splices[prior];
				if (after.from >= row.pos + row.removed.length) {
					const delta = row.inserted.length - row.removed.length;
					after = {from: after.from + delta, to: after.to + delta};
				}
			}
			touched.set(node, after);
		});
		const slices = new Map(), cut = (source, side, from, to) => {
			const key = side + from + ':' + to;
			if (!slices.has(key)) slices.set(key, source.slice(from, to));
			return slices.get(key);
		};
		let act = null;
		for (const [node, afterRange] of touched) {
			const beforeRange = ranges.range(node), previous = {...beforeRange, source: cut(beforeSource, 'b', beforeRange.from, beforeRange.to)},
				after = {...afterRange, source: cut(afterSource, 'a', afterRange.from, afterRange.to)};
			if (previous.source !== after.source || afterRange.from === afterRange.to) node.block.acts.push({...(act ||= historyAct(record)), before: previous, after});
		}
	}

	const acts = prepared.rows.filter(({record}) => !prepared.effects.pictures.has(record.transaction.id)).map(({record}) => historyAct(record));
	const reversed = new Set();
	for (const {record} of prepared.rows) if (prepared.effects.active.has(record.transaction.id) && !record.transaction.reapplies)
		for (const id of prepared.effects.references.get(record.transaction.id) || []) reversed.add(id);

	for (const block of projected) block.acts.reverse();
	return {ok: true, source: prepared.source, get initialSource() { return settle(this, prepared.initialSource); },
		set initialSource(value) { settle(this, value); }, revision: prepared.revision,
		earliestRevision: prepared.earliestRevision, complete: prepared.complete, acts, blocks: projected,
		reversed: acts.filter(act => reversed.has(act.id)).map(act => act.id)};
}

export function selectiveUndo(input, actIds, options = {}) {
	const prepared = prepareHistory(input);
	if (!prepared.ok) return prepared;
	if (!Array.isArray(actIds) || !actIds.length || actIds.some(id => typeof id !== 'string' || !id)) return historyFailure('act_invalid');
	if (!options || typeof options !== 'object' || Array.isArray(options) ||
		(options.keepHunk !== undefined && typeof options.keepHunk !== 'function') ||
		(options.splitSplice !== undefined && typeof options.splitSplice !== 'function')) return historyFailure('act_invalid');
	const requested = new Set(actIds), available = prepared.byId;
	if ([...requested].some(id => !available.has(id))) return historyFailure('act_unavailable');
	const selected = new Set([...requested].filter(id => prepared.effects.active.has(id)));
	const records = prepared.records;
	let inverseId = 'planned-inverse'; while (available.has(inverseId)) inverseId += ':';
	const inverse = {splices: [], transaction: {id: inverseId, sourceTransactionIds: [...selected]}};
	const projectedEffects = selected.size ? _rapierHistoryEffects([...records, inverse]) : prepared.effects;
	const afterMetadata = _rapierMetadataState(prepared.initialMetadata, records, projectedEffects);
	if (!afterMetadata) return historyFailure('history_invalid');
	const metadata = _rapierMetadataDelta(prepared.metadata, afterMetadata), effectChanged = selected.size > 0;
	const sourceEffectChanged = records.some(record => record.splices.length && !prepared.effects.references.get(record.transaction.id)?.length &&
		prepared.effects.active.has(record.transaction.id) !== projectedEffects.active.has(record.transaction.id));
	let coverVisibilityChanged = false;
	if (!sourceEffectChanged && selected.size) {
		let origins = null;
		try { origins = authoredPlacements(prepared.initialSource, records); } catch { origins = null; }
		const groups = new Map();
		if (origins) for (const record of records) {
			const tx = record.transaction, origin = origins.get(tx.id);
			if (!origin?.splices.some(row => row.removed.length) || tx.reverts || tx.reapplies ||
				tx.sourceTransactionId || tx.sourceTransactionIds?.length) continue;
			const key = canonicalJSON({basis: origin.basis, splices: origin.splices});
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key).push(tx.id);
		}
		const covered = (effects, ids) => ids.some(id => effects.active.has(id));
		for (const ids of groups.values()) if (ids.length > 1 && covered(prepared.effects, ids) !== covered(projectedEffects, ids))
			coverVisibilityChanged = true;
	}
	if (!sourceEffectChanged && !coverVisibilityChanged) return {ok: true, splices: [], after: prepared.source, actIds: [...requested],
		sourceTransactionIds: [...selected], metadata, afterMetadata, effectChanged, unchanged: !metadata && !effectChanged,
		superseded: [], overlaps: []};
	try {
		const transported = records.some(row => row.authored) ? authoredHistory(prepared.initialSource, records, selected) : null;
		const rows = transported ? transported.records.map(record => ({record, splices: record.splices,
			sourceIndices: transported.sourceIndices.get(record.transaction.id)})) : prepared.rows;
		const result = projectInverseSource(transported ? {...prepared, rows, records: transported.records} : prepared, selected, projectedEffects, options);
		if (!result.ok) return result;
		return {...result, actIds: [...requested], sourceTransactionIds: [...selected], metadata, afterMetadata,
			effectChanged, unchanged: result.after === prepared.source && !metadata && !effectChanged};
	} catch (_) { return historyFailure('history_invalid'); }
}
