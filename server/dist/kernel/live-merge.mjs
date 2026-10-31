// SPDX-License-Identifier: AGPL-3.0-only

import {diff, merge} from '../packages/rapier-diff/index.mjs';
import {transformPair} from '../kit/ledger/transport.mjs';
import {parseComments, commentSplices, derivedCommentEdits} from '../agent/comments.mjs';
import {_rapierTransformSplices as transformSplices, _rapierHistoryEffects as historyEffects, journalOperations} from '../kit/ledger/journal-records.mjs';
import {projectInverseSource} from '../kit/ledger/inverse-source.mjs';
import {sourceView, replaceText} from '../kit/ledger/source.mjs';

const orderKey = entry => entry.actId || entry.client;

export function sourceEdits(before, after, journal) {
	if (before === after) return [];
	const recorded = journalOperations(before, after, journal);
	if (recorded) return recorded;
	return sourceSplices(before, after).reverse().map(row => ({pos: row.at,
		removed: before.slice(row.at, row.at + row.remove), inserted: row.insert}));
}

function sourceChanges(before, after) {
	if (typeof before !== 'string' || typeof after !== 'string') throw new TypeError('source strings required');
	const {edits: changes} = diff(before, after, {_unit: 'char'});
	const direct = changes.length === 1 && (changes[0].before[0] === changes[0].before[1] || changes[0].after[0] === changes[0].after[1]);
	let count = 0;
	for (const change of changes) {
		if (change.coarse) throw new RangeError('source_diff_limit');
		if (!direct) {
			for (const _ of before.slice(...change.before)) if (++count > 4096) throw new RangeError('source_diff_limit');
			for (const _ of after.slice(...change.after)) if (++count > 4096) throw new RangeError('source_diff_limit');
		}
	}
	return changes;
}

export function sourceSplices(before, after) {
	return sourceChanges(before, after).map(change => ({at: change.before[0],
		remove: change.before[1] - change.before[0], insert: after.slice(...change.after)}));
}

export function mergeThreeWay(base, local, remote) {
	const changes = [sourceChanges(base, local), sourceChanges(base, remote)];
	const merged = merge(base, local, remote, {_edits: changes});
	const edits = sourceSplices(local, merged.text).reverse().map(row => ({pos: row.at,
		removed: local.slice(row.at, row.at + row.remove), inserted: row.insert}));
	if (transformSplices(local, edits) !== merged.text) throw new RangeError('source_replay_mismatch');
	return {...merged, edits, clean: merged.conflicts.length === 0};
}

export function parallelSplices(base, edits, {authoredRanges = false} = {}) {
	if (!Array.isArray(edits)) throw new RangeError('source_edits_invalid');
	let text = base;
	const log = [];
	for (const row of edits) {
		const after = transformSplices(text, [row]);
		if (after === null) throw new RangeError('source_edits_invalid');
		const whole = [{at: row.pos, remove: row.removed.length, insert: row.inserted}];
		let splices = whole;
		if (!authoredRanges) {
			try { splices = sourceSplices(row.removed, row.inserted).map(splice => ({...splice, at: row.pos + splice.at})); }
			catch (error) { if (error?.message !== 'source_diff_limit') throw error; }
		}
		if (applySplices(text, splices) !== after) throw new RangeError('source_replay_mismatch');
		if (splices.length) log.push({splices});
		text = after;
	}
	const splices = composeChanges(base, log);
	if (applySplices(base, splices) !== text) throw new RangeError('source_replay_mismatch');
	return splices;
}

export function createDoc(text = '') {
	if (typeof text !== 'string') throw new TypeError('source string required');
	return {text, gen: 0, base: 0, log: [], seen: {}};
}

export function applySplices(text, splices) {
	if (typeof text !== 'string') throw new TypeError('source string required');
	if (text.length <= 4096) {
		check(text.length, splices, text);
		for (let index = splices.length - 1; index >= 0; index--) {
			const row = splices[index]; text = text.slice(0, row.at) + row.insert + text.slice(row.at + row.remove);
		}
		return text;
	}
	if (!Array.isArray(splices)) throw new RangeError('bad splices');
	const rows = Array.from(splices, row => row && ({at: row.at, remove: row.remove, insert: row.insert}));
	const first = rows.at(-1);
	check(text.length, rows, sourceView(text, first && {pos: first.at, length: first.remove, text: first.insert}));
	return replaceText(text, rows.reverse().map(({at, remove, insert}) => ({pos: at, remove, insert})));
}

export function replay(text, log) {
	for (const e of log) text = applySplices(text, e.splices);
	return text;
}

function check(length, splices, text) {
	if (!Array.isArray(splices)) throw new RangeError('bad splices');
	let end = 0;
	for (const s of splices) {
		if (!s || !Number.isSafeInteger(s.at) || Object.is(s.at, -0) || !Number.isSafeInteger(s.remove) ||
			Object.is(s.remove, -0) || s.remove < 0 || typeof s.insert !== 'string' || /[\uD800-\uDFFF]/u.test(s.insert))
			throw new RangeError('bad splice');
		if (s.at < end || !Number.isSafeInteger(s.at + s.remove) || s.at + s.remove > length) throw new RangeError('splice out of order or out of range');
		if (text !== undefined) for (const at of [s.at, s.at + s.remove])
			if (at && at < text.length && (text.charCodeAt(at - 1) & 0xfc00) === 0xd800 &&
				(text.charCodeAt(at) & 0xfc00) === 0xdc00) throw new RangeError('splice splits a scalar');
		end = s.at + s.remove;
	}
}

function mapPos(pos, y, after) {
	const b = y.at, ye = b + y.remove, k = y.insert.length;
	if (pos < b) return pos;
	if (pos === b) return after ? b + k : b;
	return pos <= ye ? b + k : pos + k - y.remove;
}

export function rebaseHistory(state, client, gen, splices) {
	let out = normalize(splices);
	for (const e of since(state, gen))
		out = transformPair(out, normalize(e.splices), client < orderKey(e)).left;
	return out;
}

export function mergeSplices(client, splices, log) {
	let out = normalize(splices);
	const remote = [];
	for (const row of log) {
		const entry = {client: row.client, ...(row.actId ? {actId: row.actId} : {}), splices: normalize(row.splices)};
		const next = transformPair(out, entry.splices, client < orderKey(entry));
		out = next.left;
		if (next.right.length) remote.push({...entry, splices: next.right});
	}
	return {splices: out, remote};
}

export function mergeSource(base, edits, client, log) {
	const submitted = transformSplices(base, edits);
	if (submitted === null) throw new RangeError('source_edits_invalid');
	const current = replay(base, log);
	if (edits.length && log.length && [base, submitted, current].some(text => {
		const parsed = parseComments(text); return parsed.record && !parsed.reason;
	})) {
		const local = derivedCommentEdits(base, edits);
		let merged, initial = [], correction;
		if (local) {
			merged = mergeSourceText(base, local.edits, client, log);
			correction = commentSplices(current, merged.splices);
			initial = asLog(local.restore, client);
		} else {
			const remote = derivedCommentEdits(base, sequentialSource(base, log));
			if (!remote) throw new RangeError('source_comments_conflict');
			merged = mergeSourceText(base, edits, client, asLog(remote.edits, client));
			correction = commentSplices(submitted, sequentialSource(submitted, merged.remote));
			merged.splices.unshift(...remote.restore);
		}
		const text = transformSplices(merged.text, correction);
		const splices = [...merged.splices, ...correction];
		const remote = [...initial, ...merged.remote, ...asLog(correction, client)];
		if (text === null || transformSplices(current, splices) !== text || replay(submitted, remote) !== text)
			throw new RangeError('source_replay_mismatch');
		return {text, splices, remote};
	}
	return mergeSourceText(base, edits, client, log);
}

function sequentialSource(base, log) {
	const rows = [];
	for (const entry of log) {
		for (const row of entry.splices.slice().reverse()) {
			rows.push({client: entry.client, pos: row.at, removed: base.slice(row.at, row.at + row.remove), inserted: row.insert});
			base = applySplices(base, [row]);
		}
	}
	return rows;
}

function asLog(rows, client) {
	return rows.map(row => ({client: row.client ?? client, splices: [{at: row.pos, remove: row.removed.length, insert: row.inserted}]}));
}

function mergeSourceText(base, edits, client, log) {
	const merged = mergeSourceEdits(base, edits, client, log);
	if (log.length && edits.length) {
		const rows = edits.map(row => ({at: row.pos, remove: row.removed.length, insert: row.inserted}));
		const grouped = [];
		for (const row of rows) {
			let entry = grouped.at(-1);
			if (!entry || row.at + row.remove > entry.splices.at(-1).at) {
				entry = {client, splices: []}; grouped.push(entry);
			}
			entry.splices.push(row);
		}
		for (const entry of grouped) entry.splices.reverse();
		const submitted = transformSplices(base, edits);
		if (replay(base, grouped) !== submitted) throw new RangeError('source_merge_diverged');
		for (let opposite of [rows.map(row => ({client, splices: [row]})), ...(grouped.length < rows.length ? [grouped] : [])]) {
			let before = base, other = submitted;
			for (const row of log) {
				const authored = row.splices.slice().reverse().map(splice => ({pos: splice.at,
					removed: before.slice(splice.at, splice.at + splice.remove), inserted: splice.insert}));
				const reversed = mergeSourceEdits(before, authored, row.client, opposite);
				before = applySplices(before, row.splices);
				other = reversed.text;
				opposite = reversed.remote;
			}
			if (other !== merged.text) throw new RangeError('source_merge_diverged');
		}
	}
	return merged;
}

function mergeSourceEdits(base, edits, client, log) {
	const submitted = transformSplices(base, edits);
	if (submitted === null) throw new RangeError('source_edits_invalid');
	let text = replay(base, log), remote = log;
	const splices = [];
	for (const row of edits) {
		if (row.removed === row.inserted) continue;
		const next = mergeSplices(client, [{at: row.pos, remove: row.removed.length, insert: row.inserted}], remote);
		for (const splice of next.splices.slice().reverse()) {
			splices.push({pos: splice.at, removed: text.slice(splice.at, splice.at + splice.remove), inserted: splice.insert});
			text = applySplices(text, [splice]);
		}
		remote = next.remote;
	}
	if (replay(submitted, remote) !== text) throw new RangeError('source_replay_mismatch');
	return {text, splices, remote};
}

function normalize(splices) {
	check(Infinity, splices);
	const out = [];
	for (const s of splices.filter(s => s.remove > 0 || s.insert).sort((p, q) => p.at - q.at)) {
		const l = out[out.length - 1];
		if (l && l.at + l.remove === s.at && (!s.insert || !l.remove))
			out[out.length - 1] = {at: l.at, remove: l.remove + s.remove, insert: l.insert + s.insert};
		else out.push({at: s.at, remove: s.remove, insert: s.insert});
	}
	return out;
}

function since(state, gen) {
	if (!Number.isSafeInteger(gen) || gen < 0 || gen > state.base + state.log.length) throw new RangeError('bad generation');
	if (gen < state.base) throw new RangeError('generation trimmed: resync');
	return state.log.slice(gen - state.base);
}

export function trim(state, gen) {
	if (!Number.isSafeInteger(gen) || gen < 0) throw new RangeError('bad generation');
	gen = Math.min(gen, state.gen);
	if (gen <= state.base) return state;
	return {...state, base: gen, log: state.log.slice(gen - state.base)};
}

function sourceAt(state, gen) {
	let text = state.text;
	for (const entry of since(state, gen).reverse()) text = applySplices(text, entry.undo);
	return text;
}

export function inverseSplices(text, splices) {
	if (typeof text !== 'string') throw new TypeError('source string required');
	check(text.length, splices, text.length <= 4096 ? text : sourceView(text));
	let shift = 0;
	return normalize(splices.map(row => {
		const at = row.at + shift;
		shift += row.insert.length - row.remove;
		return {at, remove: row.insert.length, insert: text.slice(row.at, row.at + row.remove)};
	}));
}

function inactiveActs(log) {
	const inactive = new Set();
	for (let index = log.length - 1; index >= 0; index--) {
		const entry = log[index];
		if (!inactive.has(entry.gen)) for (const gen of entry.undoes) inactive.add(gen);
	}
	return inactive;
}

function transportedInverse(state, target, leftKey) {
	const source = sourceAt(state, target.gen);
	const rows = since(state, target.gen).map(entry => ({...entry}));
	for (let index = rows.length - 1; index >= 0; index--) {
		const entry = rows[index];
		if (!entry.undoes.length) continue;
		const targets = entry.undoes.map(gen => rows.findIndex(row => row.gen === gen));
		if (targets.some(at => at < 0 || at >= index)) continue;
		const reduced = rows.slice(0, index), expected = replay(source, rows.slice(0, index + 1));
		for (const at of targets.sort((a, b) => b - a)) {
			let inverse = inverseSplices(replay(source, reduced.slice(0, at)), reduced[at].splices);
			const moved = [];
			for (const later of reduced.slice(at + 1)) {
				const pair = transformPair(inverse, later.splices, false);
				inverse = pair.left;
				moved.push({...later, splices: pair.right});
			}
			reduced.splice(at, reduced.length - at, ...moved);
		}
		if (replay(source, reduced) !== expected) throw new RangeError('undo replay mismatch');
		rows.splice(0, index + 1, ...reduced);
		index = rows.length;
	}
	let inverse = target.undo;
	for (const row of rows) inverse = transformPair(inverse, row.splices,
		leftKey == null ? false : leftKey < orderKey(row)).left;
	return inverse;
}

function sharedInverseTargets(log) {
	const targets = new Set();
	for (const entry of log) for (const gen of entry.undoes) {
		if (targets.has(gen)) return true;
		targets.add(gen);
	}
	return false;
}

function semanticInverse(state, targets) {
	const initialSource = sourceAt(state, state.base), rows = [];
	let source = initialSource;
	const id = gen => 'generation:' + gen;
	for (const entry of state.log) {
		const splices = entry.splices.slice().reverse().map(row => ({pos: row.at,
			removed: source.slice(row.at, row.at + row.remove), inserted: row.insert}));
		const record = {splices, transaction: {id: id(entry.gen), actor: {kind: entry.agent ? 'agent' : 'human', id: entry.client},
			...(entry.undoes.length ? {sourceTransactionIds: entry.undoes.map(id)} : {})}};
		rows.push({record, splices}); source = applySplices(source, entry.splices);
	}
	if (source !== state.text) throw new RangeError('undo replay mismatch');
	const records = rows.map(row => row.record), selected = new Set(targets.map(id));
	const effects = historyEffects(records), projected = historyEffects([...records,
		{transaction: {id: 'planned-inverse', sourceTransactionIds: [...selected]}}]);
	if (!effects.ok || !projected.ok) throw new RangeError('undo target unavailable');
	const result = projectInverseSource({source, initialSource, rows, effects}, selected, projected);
	if (!result.ok) throw new RangeError('undo replay mismatch');
	return {...result, splices: parallelSplices(source, result.splices, {authoredRanges: true})};
}

function actInverse(state, client, target, leftKey = client) {
	const plan = semanticInverse(state, [target.gen]);
	if (plan.overlaps.length || sharedInverseTargets(state.log)) return plan.splices;
	if (!state.log.some(entry => entry.undoes.length > 1)) return transportedInverse(state, target, leftKey);
	let doc = {...createDoc(sourceAt(state, state.base)), base: state.base, gen: state.base};
	const generations = new Map();
	const append = (entry, splices, undoes) => {
		const row = {...entry, gen: doc.gen + 1, splices, undo: inverseSplices(doc.text, splices), undoes};
		doc = {...doc, text: applySplices(doc.text, splices), gen: row.gen, log: [...doc.log, row]};
		return row;
	};
	for (const entry of state.log) {
		const expected = applySplices(doc.text, entry.splices), applied = [];
		if (!entry.undoes.length) applied.push(append(entry, entry.splices, []).gen);
		else {
			const targets = entry.undoes.flatMap(gen => {
				if (!generations.has(gen)) throw new RangeError('undo target unavailable');
				return generations.get(gen);
			}).sort((a, b) => b - a);
			for (const gen of targets) {
				const prior = doc.log.find(row => row.gen === gen);
				applied.push(append(entry, transportedInverse(doc, prior, null), [gen]).gen);
			}
		}
		if (doc.text !== expected) throw new RangeError('undo replay mismatch');
		generations.set(entry.gen, applied);
	}
	const changes = [];
	for (const gen of generations.get(target.gen).slice().reverse()) {
		const prior = doc.log.find(row => row.gen === gen);
		changes.push(append({client}, transportedInverse(doc, prior, leftKey), [gen]));
	}
	return composeChanges(state.text, changes);
}

function inverseGroup(state, client, targets) {
	const inactive = inactiveActs(state.log);
	const plan = semanticInverse(state, targets);
	if (plan.overlaps.length || sharedInverseTargets(state.log) || targets.some(gen => inactive.has(gen))) return plan.splices;
	if (targets.length === 1) return actInverse(state, client, state.log.find(entry => entry.gen === targets[0]), client);
	let current = state;
	const changes = [];
	for (const gen of targets.slice().sort((a, b) => b - a)) {
		if (inactiveActs(current.log).has(gen)) continue;
		const target = current.log.find(entry => entry.gen === gen), splices = actInverse(current, client, target, client);
		const entry = {client, gen: current.gen + 1, splices, undo: inverseSplices(current.text, splices), undoes: [gen]};
		changes.push(entry);
		current = {...current, gen: entry.gen, text: applySplices(current.text, splices), log: [...current.log, entry]};
	}
	return composeChanges(state.text, changes);
}

function requestOf(edit) {
	const target = edit.undoTarget;
	if (target !== undefined && (!target || typeof target.client !== 'string' || !target.client ||
		!Number.isSafeInteger(target.seq) || target.seq < 1)) throw new RangeError('bad undo target');
	const targets = edit.undoes == null ? [] : Array.isArray(edit.undoes) ? edit.undoes : [edit.undoes];
	if (edit.undoes != null && (!targets.length || new Set(targets).size !== targets.length ||
		targets.some(gen => !Number.isSafeInteger(gen) || gen < 1))) throw new RangeError('bad undo target');
	if (target !== undefined && edit.undoes != null) throw new RangeError('ambiguous undo target');
	if (edit.agent !== undefined && typeof edit.agent !== 'boolean') throw new RangeError('bad author kind');
	if (edit.actId !== undefined && (typeof edit.actId !== 'string' || !edit.actId || edit.actId.length > 256 ||
		/[\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(edit.actId))) throw new RangeError('bad act identity');
	return {gen: edit.gen, splices: edit.splices.map(row => ({at: row.at, remove: row.remove, insert: row.insert})),
		agent: !!edit.agent, undoes: Array.isArray(edit.undoes) ? edit.undoes.slice() : edit.undoes ?? null,
		...(edit.actId ? {actId: edit.actId} : {}),
		...(target ? {undoTarget: {client: target.client, seq: target.seq}} : {})};
}

export function applyEdit(state, edit, {composing = []} = {}) {
	const {client, seq, gen} = edit;
	if (typeof client !== 'string' || !client || client.length > 256 || !Number.isSafeInteger(seq) || seq < 1 ||
		!Number.isSafeInteger(gen) || gen < 0 || gen > state.gen) throw new RangeError('bad edit');
	check(Infinity, edit.splices);
	const request = requestOf(edit), last = Object.hasOwn(state.seen, client) ? state.seen[client] : null;
	if (last && seq <= last.seq) {
		const receipt = last.receipts[seq];
		if (!receipt || JSON.stringify(receipt.request) !== JSON.stringify(request)) throw new RangeError('operation id reused');
		return {state, status: 'duplicate', gen: receipt.gen, splices: receipt.splices};
	}
	if (gen < state.base) throw new RangeError('base generation trimmed: resync');
	let targets = request.undoes == null ? [] : Array.isArray(request.undoes) ? request.undoes.slice() : [request.undoes];
	if (request.undoTarget) {
		const target = state.log.find(entry => entry.client === request.undoTarget.client && entry.seq === request.undoTarget.seq)?.gen;
		if (target === undefined) throw new RangeError('undo target unavailable');
		targets = [target];
	}
	if (last && gen < last.gen && !targets.length) throw new RangeError('base generation does not include the client\'s own earlier edit');
	const before = sourceAt(state, gen);
	check(before.length, edit.splices, before.length <= 4096 ? before : sourceView(before));
	if (targets.length) {
		if (targets.some(target => target > gen || !state.log.some(entry => entry.gen === target))) throw new RangeError('undo target unavailable');
		const atBase = {...state, text: before, gen, log: state.log.slice(0, gen - state.base)};
		const inverse = inverseGroup(atBase, orderKey(edit), targets);
		if (JSON.stringify(normalize(edit.splices)) !== JSON.stringify(inverse)) throw new RangeError('undo source mismatch');
	}
	const undoes = targets.slice();
	const splices = targets.length ? inverseGroup(state, orderKey(edit), targets)
		: rebaseHistory(state, orderKey(edit), gen, edit.splices);
	check(state.text.length, splices, state.text.length <= 4096 ? state.text : sourceView(state.text));
	if (request.agent && splices.length) for (const presence of composing) {
		if (presence.client === client) continue;
		const moved = rebasePresence(state, presence, presence.gen, presence.client);
		const start = Math.min(moved.anchor, moved.head), end = Math.max(moved.anchor, moved.head);
		if (splices.some(row => row.remove ? row.at < end && row.at + row.remove > start ||
			start === end && row.at <= start && row.at + row.remove >= end : row.at >= start && row.at <= end))
			return {state, status: 'held', gen: state.gen, splices: [], range: [start, end]};
	}
	let shift = 0;
	const touched = splices.map(row => {const at = row.at + shift; shift += row.insert.length - row.remove; return [at, at + row.insert.length];});
	const entry = {gen: state.gen + 1, client, seq, splices, touched, undo: inverseSplices(state.text, splices),
		...(request.actId ? {actId: request.actId} : {}),
		agent: request.agent, undoes, request};
	const receipt = {gen: entry.gen, splices, request};
	return {
		state: {...state, text: applySplices(state.text, splices), gen: entry.gen, log: [...state.log, entry],
			seen: {...state.seen, [client]: {seq, gen: entry.gen, receipts: {...last?.receipts, [seq]: receipt}}}},
		status: 'applied', gen: entry.gen, splices,
	};
}

export function rebasePresence(state, presence, gen, client = null) {
	let {anchor, head} = presence;
	if (![anchor, head].every(value => Number.isSafeInteger(value) && value >= 0)) throw new RangeError('bad presence');
	const source = sourceAt(state, gen);
	if (anchor > source.length || head > source.length) throw new RangeError('presence out of range');
	check(source.length, [anchor, head].sort((a, b) => a - b).map(at => ({at, remove: 0, insert: ''})), source.length <= 4096 ? source : sourceView(source));
	for (const e of since(state, gen))
		for (let i = e.splices.length - 1; i >= 0; i--) {
			const after = e.client === client;
			anchor = mapPos(anchor, e.splices[i], after);
			head = mapPos(head, e.splices[i], after);
		}
	return {anchor, head, gen: state.gen};
}

export function undoEdit(state, client, seq, targetGen) {
	const undone = inactiveActs(state.log);
	for (let i = state.log.length - 1; i >= 0; i--) {
		const e = state.log[i];
		if ((targetGen === undefined ? e.client === client && !e.undoes.length : e.gen === targetGen) && !undone.has(e.gen) && (e.undo.length || e.undoes.length))
			return {client, seq, gen: state.gen, splices: actInverse(state, client, e, client), undoes: e.gen};
	}
	return null;
}

export function reconcileQueue(base, pending, entry, acceptedLog = []) {
	const acknowledged = applySplices(base, entry.splices), old = replay(base, pending);
	const index = pending.findIndex(row => row.client === entry.client && row.seq === entry.seq);
	if (index > 0) throw new RangeError('queue acknowledgement out of order');
	let remote = [], queue;
	if (index === 0) {
		if (applySplices(base, pending[0].splices) !== acknowledged) throw new RangeError('queue acknowledgement mismatch');
		queue = pending.slice(1);
	} else {
		remote = [{client: entry.client, ...(entry.actId ? {actId: entry.actId} : {}), splices: entry.splices}];
		const history = acceptedLog.at(-1)?.gen === entry.gen ? acceptedLog : [...acceptedLog,
			{...entry, undo: inverseSplices(base, entry.splices)}];
		const earlier = history.slice(0, -1), originals = [];
		queue = [];
		for (const row of pending) {
			let splices;
			if (entry.undoes?.length && (row.undoTarget || row.undoTargets || row.undoes != null) &&
				entry.undoes.every(gen => earlier.some(prior => prior.gen === gen))) {
				const current = queuedDocument(acknowledged, history, queue), inactive = inactiveActs(current.log);
				const targets = queueTargets(current.log, row).filter(gen => !inactive.has(gen));
				splices = targets.length ? inverseGroup(current, orderKey(row), targets) : [];
				const authored = queuedDocument(base, earlier, [...originals, row]), absent = inactiveActs(authored.log);
				const incoming = entry.undoes.filter(gen => !absent.has(gen));
				const correction = incoming.length ? inverseGroup(authored, orderKey(entry), incoming) : [];
				if (applySplices(authored.text, correction) !== applySplices(current.text, splices))
					throw new RangeError('queue undo replay mismatch');
				remote = [{client: entry.client, ...(entry.actId ? {actId: entry.actId} : {}), splices: correction}];
			} else {
				const next = mergeSplices(orderKey(row), row.splices, remote);
				remote = next.remote; splices = next.splices;
			}
			originals.push(row); queue.push({...row, splices});
		}
	}
	if (queue.some(row => row.undoTarget || row.undoTargets || row.undoes != null)) {
		const history = acceptedLog.at(-1)?.gen === entry.gen ? acceptedLog : [...acceptedLog,
			{...entry, undo: inverseSplices(base, entry.splices)}];
		const next = [];
		let text = acknowledged, changes = [];
		for (const row of queue) {
			const moved = mergeSplices(orderKey(row), row.splices, changes);
			changes = moved.remote;
			let splices = moved.splices;
			if (row.undoTarget || row.undoTargets || row.undoes != null) {
				const current = queuedDocument(acknowledged, history, next), inactive = inactiveActs(current.log);
				const targets = queueTargets(current.log, row).filter(gen => !inactive.has(gen));
				const expected = targets.length ? inverseGroup(current, orderKey(row), targets) : [];
				if (JSON.stringify(expected) !== JSON.stringify(splices)) {
					changes.push({client: row.client, actId: row.actId, splices: inverseSplices(text, splices)},
						{client: row.client, actId: row.actId, splices: expected});
					splices = expected;
				}
			}
			text = applySplices(text, splices);
			next.push({...row, splices});
		}
		remote = [...remote, ...changes];
		queue = next;
	}
	const text = replay(acknowledged, queue), splices = remote.length > 1 ? composeChanges(old, remote) : remote[0]?.splices ?? [];
	if (applySplices(old, splices) !== text) throw new RangeError('queue replay mismatch');
	return {base: acknowledged, text, pending: queue, splices, accepted: index === 0};
}

function composeChanges(source, log) {
	const parts = source.length ? [{at: 0, length: source.length}] : [];
	const split = at => {
		let offset = 0;
		for (let index = 0; index < parts.length; index++) {
			const part = parts[index], length = part.text?.length ?? part.length;
			if (at === offset) return index;
			if (at < offset + length) {
				const cut = at - offset;
				parts.splice(index, 1, ...(part.text === undefined ? [{at: part.at, length: cut}, {at: part.at + cut, length: length - cut}]
					: [{text: part.text.slice(0, cut)}, {text: part.text.slice(cut)}]));
				return index + 1;
			}
			offset += length;
		}
		if (at !== offset) throw new RangeError('queue correction out of range');
		return parts.length;
	};
	for (const entry of log) for (const row of entry.splices.slice().reverse()) {
		const start = split(row.at), end = split(row.at + row.remove);
		parts.splice(start, end - start, ...(row.insert ? [{text: row.insert}] : []));
	}
	const out = [];
	let at = 0, insert = '';
	for (const part of parts) {
		if (part.text !== undefined) insert += part.text;
		else {
			if (part.at > at || insert) out.push({at, remove: part.at - at, insert});
			at = part.at + part.length; insert = '';
		}
	}
	if (at < source.length || insert) out.push({at, remove: source.length - at, insert});
	return out;
}

function queueTargets(log, row) {
	const refs = row.undoTargets || (row.undoTarget ? [row.undoTarget] : null);
	if (refs) {
		if (!Array.isArray(refs) || !refs.length || refs.some(ref => !ref || typeof ref.client !== 'string' ||
			!Number.isSafeInteger(ref.seq) || ref.seq < 1) ||
			new Set(refs.map(ref => JSON.stringify([ref.client, ref.seq]))).size !== refs.length)
			throw new RangeError('bad undo target');
		return refs.map(ref => {
			const target = log.find(prior => prior.client === ref.client && prior.seq === ref.seq);
			if (!target) throw new RangeError('undo target unavailable');
			return target.gen;
		});
	}
	const generations = row.undoes == null ? [] : Array.isArray(row.undoes) ? row.undoes.slice() : [row.undoes];
	if (new Set(generations).size !== generations.length || generations.some(gen => !Number.isSafeInteger(gen) ||
		gen < 1 || !log.some(prior => prior.gen === gen))) throw new RangeError('undo target unavailable');
	return generations;
}

function queuedDocument(base, acceptedLog, pending) {
	const log = acceptedLog.slice();
	let text = base, gen = log.at(-1)?.gen ?? 0;
	for (const row of pending) {
		const entry = {...row, gen: ++gen, undo: inverseSplices(text, row.splices),
			undoes: queueTargets(log, row)};
		text = applySplices(text, row.splices);
		log.push(entry);
	}
	return {text, gen, base: log[0] ? log[0].gen - 1 : gen, log};
}

export function undoQueue(base, acceptedLog, pending, client, seq, target, actId) {
	const state = queuedDocument(base, acceptedLog, pending), {log} = state;
	const leftKey = typeof actId === 'string' && actId ? actId : client;
	if (Array.isArray(target)) {
		const targets = queueTargets(log, {undoTargets: target}), inactive = inactiveActs(log);
		const active = targets.filter(gen => !inactive.has(gen));
		if (!active.length) return null;
		return {client, seq, splices: inverseGroup(state, leftKey, active),
			undoTargets: active.map(gen => {
				const entry = log.find(row => row.gen === gen);
				return {client: entry.client, seq: entry.seq};
			})};
	}
	const targetGen = target ? log.find(row => row.client === target.client && row.seq === target.seq)?.gen : undefined;
	if (target && targetGen === undefined) return null;
	const edit = undoEdit(state, client, seq, targetGen);
	if (!edit) return null;
	const entry = log.find(row => row.gen === edit.undoes);
	const splices = actId ? actInverse(state, client, entry, leftKey) : edit.splices;
	return {client, seq, splices,
		undoTarget: {client: entry.client, seq: entry.seq}};
}
