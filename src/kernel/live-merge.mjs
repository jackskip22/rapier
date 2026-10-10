// SPDX-License-Identifier: AGPL-3.0-only
// Merge core for live editing of one Markdown source string. Pure: no DOM, no I/O, no clock, no randomness.
//
// An edit is {client, seq, gen, splices, agent?}: exact splices {at, remove, insert} (UTF-16 offsets, ascending,
// not overlapping) against generation `gen`. The server orders edits; one made against an older generation is rebased
// across every edit applied since. Rules:
// - A concurrent insert is never deleted: a removal that spans it splits around it.
// - Inserts at the same offset order by client id (the lower id first).
// - A client's base generation must include its own earlier edits (it sends the next edit after the acknowledgement).
// - An agent edit that overlaps an active human composition is held, not applied.
// State is a plain value: {text, gen, base, log, seen}; log[i] produced generation base + i + 1, and
// trim() drops what no client can still be behind. Every function returns new values, never mutates.

import {diffChars} from '../agent/diff.mjs';
import {transformPair} from '../kit/ledger/transport.mjs';
import {parseComments, commentSplices} from '../agent/comments.mjs';
import {_rapierTransformSplices as transformSplices} from '../kit/ledger/journal-records.mjs';

// Prefer the editor's exact local history. Its revision numbers are local; replayed
// source identifies the acknowledged checkpoint without confusing it with a server revision.
export function sourceEdits(before, after, journal) {
	if (before === after) return [];
	if (Array.isArray(journal)) {
		let text = after;
		const edits = [];
		for (let index = journal.length - 1; index >= 0; index--) {
			const rows = journal[index]?.splices, prior = transformSplices(text, rows, true);
			if (prior === null) break;
			edits.unshift(...rows.map(({pos, removed, inserted}) => ({pos, removed, inserted})));
			if (prior === before) return edits;
			text = prior;
		}
	}
	return sourceSplices(before, after).reverse().map(row => ({pos: row.at,
		removed: before.slice(row.at, row.at + row.remove), inserted: row.insert}));
}

// Exact source edits, retaining unchanged text between hunks. Positions count UTF-16 units;
// the existing diff tokenizer works in Unicode scalars, so no splice splits a surrogate pair.
export function sourceSplices(before, after) {
	if (typeof before !== 'string' || typeof after !== 'string') throw new TypeError('source strings required');
	let start = 0, end = before.length, tail = after.length;
	while (start < end && start < tail && before[start] === after[start]) start++;
	if (start && (before.charCodeAt(start - 1) & 0xfc00) === 0xd800) start--;
	while (end > start && tail > start && before[end - 1] === after[tail - 1]) { end--; tail--; }
	if ((before.charCodeAt(end) & 0xfc00) === 0xdc00) { end++; tail++; }
	if (start === end || start === tail) return start === end && start === tail ? [] : [{at: start, remove: end - start, insert: after.slice(start, tail)}];
	const parts = diffChars(before.slice(start, end), after.slice(start, tail), {maxEditLength: 4096});
	if (!parts) throw new RangeError('source_diff_limit');
	const out = [];
	let at = start;
	for (const part of parts) {
		if (part.added) {
			const prior = out.at(-1);
			if (prior && prior.at + prior.remove === at) prior.insert += part.value;
			else out.push({at, remove: 0, insert: part.value});
		}
		else {
			if (part.removed) out.push({at, remove: part.value.length, insert: ''});
			at += part.value.length;
		}
	}
	return normalize(out);
}

// Editor records can replace a whole block for one keystroke. Locate its unchanged
// source within each exact row before composing rows; that source remains concurrent.
// A kernel-authored range already declares the replacement: compose it directly,
// without inferring interior changes or imposing an edit-distance budget on its payload.
export function parallelSplices(base, edits, {authoredRanges = false} = {}) {
	if (!Array.isArray(edits)) throw new RangeError('source_edits_invalid');
	let text = base;
	const log = [];
	for (const row of edits) {
		const after = transformSplices(text, [row]);
		if (after === null) throw new RangeError('source_edits_invalid');
		const splices = authoredRanges ? [{at: row.pos, remove: row.removed.length, insert: row.inserted}]
			: sourceSplices(row.removed, row.inserted).map(splice => ({...splice, at: row.pos + splice.at}));
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

// Apply ascending splices to a text (last to first, so offsets stay valid).
export function applySplices(text, splices) {
	if (typeof text !== 'string') throw new TypeError('source string required');
	check(text.length, splices, text);
	for (let i = splices.length - 1; i >= 0; i--) {
		const s = splices[i];
		text = text.slice(0, s.at) + s.insert + text.slice(s.at + s.remove);
	}
	return text;
}

// The text after replaying log entries (each entry's applied splices) from the text they started at.
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

// A position moved across one applied splice. after: a position at the insert point moves past the inserted text.
function mapPos(pos, y, after) {
	const b = y.at, ye = b + y.remove, k = y.insert.length;
	if (pos < b) return pos;
	if (pos === b) return after ? b + k : b;
	return pos <= ye ? b + k : pos + k - y.remove;
}

// Rebase splices made against `gen` across the log entries after it.
export function rebaseHistory(state, client, gen, splices) {
	let out = normalize(splices);
	for (const e of since(state, gen))
		out = transformPair(out, normalize(e.splices), client < e.client).left;
	return out;
}

// Both projections of concurrent edits: the author's edits over the remote history,
// and that history over the submitted draft. The latter is an exact acknowledgement
// delta, so an editor can include later typing without diffing large inserted source.
export function mergeSplices(client, splices, log) {
	let out = normalize(splices);
	const remote = [];
	for (const row of log) {
		const entry = {client: row.client, splices: normalize(row.splices)};
		const next = transformPair(out, entry.splices, client < entry.client);
		out = next.left;
		if (next.right.length) remote.push({client: entry.client, splices: next.right});
	}
	return {splices: out, remote};
}

// Merge a sequential local journal over remote edits. Return the exact committed
// journal and reciprocal acknowledgement; source size does not become a diff budget.
export function mergeSource(base, edits, client, log) {
	const submitted = transformSplices(base, edits);
	if (submitted === null) throw new RangeError('source_edits_invalid');
	const current = replay(base, log);
	if (edits.length && log.length && [base, submitted, current].some(text => {
		const parsed = parseComments(text); return parsed.record && !parsed.reason;
	})) {
		// The discussion carrier contains both authored messages and derived source facts.
		// Ordinary text OT must not turn two derived replacements into adjacent records.
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

// Discard a carrier rewrite only when the comment owner proves every changed byte
// is derivable from the body journal. Authored replies, resolution and literal edits
// fail this equality and remain on the other side of the merge, or in a refused draft.
function derivedCommentEdits(base, edits) {
	const parsed = parseComments(base), submitted = transformSplices(base, edits);
	if (parsed.reason || submitted === null) return null;
	if (!parsed.record) return parseComments(submitted).record ? null : {edits, restore: []};
	let start = parsed.record.start, end = parsed.record.end;
	const body = [];
	for (const row of edits) {
		const stop = row.pos + row.removed.length, delta = row.inserted.length - row.removed.length;
		if (row.pos < end && stop > start || row.pos > start && row.pos < end) {
			if (row.pos < start || stop > end) return null;
			end += delta;
		} else {
			body.push({...row, pos: row.pos >= end ? row.pos - (end - start) + parsed.record.raw.length : row.pos});
			if (stop <= start) { start += delta; end += delta; }
		}
	}
	const clean = transformSplices(base, body), derived = commentSplices(base, body);
	if (clean === null || transformSplices(clean, derived) !== submitted) return null;
	const restore = derived.slice().reverse().map(row => ({pos: row.pos, removed: row.inserted, inserted: row.removed}));
	return {edits: body, restore};
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
		// The reciprocal receipt proves replay of this projection, not the other
		// arrival order. Descending disjoint local edits also form a valid batch:
		// higher edits cannot move or replace the lower edit's base. Prove both
		// representations; choosing singleton rows alone can hide a grouped conflict.
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

// Coalesce removals and inserts at the same source gap. An insert after a removed
// range keeps its original gap; folding it into the removal changes concurrent order.
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

// The log entries after generation gen.
function since(state, gen) {
	if (!Number.isSafeInteger(gen) || gen < 0 || gen > state.base + state.log.length) throw new RangeError('bad generation');
	if (gen < state.base) throw new RangeError('generation trimmed: resync');
	return state.log.slice(gen - state.base);
}

// Drop only history no edit, caret, offline branch or Undo can still need. Retry receipts survive trimming.
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
	check(text.length, splices, text);
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

// Cancelling an act with its Undo restores the original source identity. Carry the
// intervening edits back across that pair before transporting an older act's inverse;
// otherwise an Undo/Redo would make restored text look like somebody else's insertion.
function transportedInverse(state, target) {
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
	// Restored source follows later typing at its old gap; Undo must not move that typing
	// to the other side of the replacement according to the undoing person's name.
	for (const row of rows) inverse = transformPair(inverse, row.splices, false).left;
	return inverse;
}

function actInverse(state, client, target) {
	if (!state.log.some(entry => entry.undoes.length > 1)) return transportedInverse(state, target);
	// A grouped Undo may contain adjacent replacements. Its single wire splice cannot
	// tell a later caret which restored bytes belonged to each original act. Expand only
	// this temporary inverse calculation into exact acts; the retained journal stays whole.
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
				applied.push(append(entry, transportedInverse(doc, prior), [gen]).gen);
			}
		}
		if (doc.text !== expected) throw new RangeError('undo replay mismatch');
		generations.set(entry.gen, applied);
	}
	const changes = [];
	for (const gen of generations.get(target.gen).slice().reverse()) {
		const prior = doc.log.find(row => row.gen === gen);
		changes.push(append({client}, transportedInverse(doc, prior), [gen]));
	}
	return composeChanges(state.text, changes);
}

function requestOf(edit) {
	const target = edit.undoTarget;
	if (target !== undefined && (!target || typeof target.client !== 'string' || !target.client ||
		!Number.isSafeInteger(target.seq) || target.seq < 1)) throw new RangeError('bad undo target');
	if (edit.undoes != null && (!Number.isSafeInteger(edit.undoes) || edit.undoes < 1)) throw new RangeError('bad undo target');
	if (target !== undefined && edit.undoes != null) throw new RangeError('ambiguous undo target');
	if (edit.agent !== undefined && typeof edit.agent !== 'boolean') throw new RangeError('bad author kind');
	return {gen: edit.gen, splices: edit.splices.map(row => ({at: row.at, remove: row.remove, insert: row.insert})),
		agent: !!edit.agent, undoes: edit.undoes ?? null,
		...(target ? {undoTarget: {client: target.client, seq: target.seq}} : {})};
}

// Order one edit. Returns {state, status: 'applied' | 'held' | 'duplicate', gen, splices}. Held and duplicate edits
// leave the state as it was.
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
	let undoes = request.undoes;
	if (request.undoTarget) undoes = state.log.find(entry => entry.client === request.undoTarget.client && entry.seq === request.undoTarget.seq)?.gen;
	if (request.undoTarget && undoes === undefined) throw new RangeError('undo target unavailable');
	if (last && gen < last.gen && undoes == null) throw new RangeError('base generation does not include the client\'s own earlier edit');
	const before = sourceAt(state, gen);
	check(before.length, edit.splices, before);
	if (undoes != null) {
		const target = state.log.find(entry => entry.gen === undoes);
		if (!target || target.gen > gen) throw new RangeError('undo target unavailable');
		const atBase = {...state, gen, log: state.log.slice(0, gen - state.base)};
		const inverse = inactiveActs(atBase.log).has(undoes) ? [] : actInverse(atBase, client, target);
		if (JSON.stringify(normalize(edit.splices)) !== JSON.stringify(inverse)) throw new RangeError('undo source mismatch');
	}
	const alreadyUndone = undoes != null && inactiveActs(state.log).has(undoes);
	const splices = alreadyUndone ? [] : undoes != null ? actInverse(state, client, state.log.find(entry => entry.gen === undoes))
		: rebaseHistory(state, client, gen, edit.splices);
	if (alreadyUndone) undoes = null;
	check(state.text.length, splices, state.text);
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
		agent: request.agent, undoes: undoes == null ? [] : [undoes], request};
	const receipt = {gen: entry.gen, splices, request};
	return {
		state: {...state, text: applySplices(state.text, splices), gen: entry.gen, log: [...state.log, entry],
			seen: {...state.seen, [client]: {seq, gen: entry.gen, receipts: {...last?.receipts, [seq]: receipt}}}},
		status: 'applied', gen: entry.gen, splices,
	};
}

// Move a cursor or selection {anchor, head} made at generation `gen` to the current generation. The client's own
// edits carry its carets past what it typed; another client's insert at the caret leaves it in front.
export function rebasePresence(state, presence, gen, client = null) {
	let {anchor, head} = presence;
	if (![anchor, head].every(value => Number.isSafeInteger(value) && value >= 0)) throw new RangeError('bad presence');
	const source = sourceAt(state, gen);
	if (anchor > source.length || head > source.length) throw new RangeError('presence out of range');
	check(source.length, [anchor, head].sort((a, b) => a - b).map(at => ({at, remove: 0, insert: ''})), source);
	for (const e of since(state, gen))
		for (let i = e.splices.length - 1; i >= 0; i--) {
			const after = e.client === client;
			anchor = mapPos(anchor, e.splices[i], after);
			head = mapPos(head, e.splices[i], after);
		}
	return {anchor, head, gen: state.gen};
}

// Default Undo chooses the caller's latest active act. An explicit generation can name
// any author's act, including an Undo. Its inverse rebases through everyone's later work.
export function undoEdit(state, client, seq, targetGen) {
	const undone = inactiveActs(state.log);
	for (let i = state.log.length - 1; i >= 0; i--) {
		const e = state.log[i];
		if ((targetGen === undefined ? e.client === client && !e.undoes.length : e.gen === targetGen) && !undone.has(e.gen) && e.undo.length)
			return {client, seq, gen: state.gen, splices: actInverse(state, client, e), undoes: e.gen};
	}
	return null;
}

// One accepted server entry moves an optimistic queue. The server's sequence is authoritative;
// an in-flight request is retained separately, unchanged, until its own entry acknowledges it.
export function reconcileQueue(base, pending, entry, acceptedLog = []) {
	const acknowledged = applySplices(base, entry.splices), old = replay(base, pending);
	const index = pending.findIndex(row => row.client === entry.client && row.seq === entry.seq);
	if (index > 0) throw new RangeError('queue acknowledgement out of order');
	let remote = [], queue;
	if (index === 0) {
		if (applySplices(base, pending[0].splices) !== acknowledged) throw new RangeError('queue acknowledgement mismatch');
		queue = pending.slice(1);
	} else {
		remote = [{client: entry.client, splices: entry.splices}];
		queue = pending.map(row => {
			const next = mergeSplices(row.client, row.splices, remote);
			remote = next.remote;
			return {...row, splices: next.splices};
		});
	}
	if (queue.some(row => row.undoTarget)) {
		const history = acceptedLog.at(-1)?.gen === entry.gen ? acceptedLog : [...acceptedLog,
			{...entry, undo: inverseSplices(base, entry.splices)}];
		const next = [];
		let text = acknowledged, changes = [];
		for (const row of queue) {
			const moved = mergeSplices(row.client, row.splices, changes);
			changes = moved.remote;
			let splices = moved.splices;
			if (row.undoTarget) {
				if (![...history, ...next].some(prior => prior.client === row.undoTarget.client && prior.seq === row.undoTarget.seq))
					throw new RangeError('undo target unavailable');
				const expected = undoQueue(acknowledged, history, next, row.client, row.seq, row.undoTarget)?.splices ?? [];
				if (JSON.stringify(expected) !== JSON.stringify(splices)) {
					changes.push({client: row.client, splices: inverseSplices(text, splices)}, {client: row.client, splices: expected});
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

// Compose exact acknowledgement corrections by retaining source intervals. This has no
// edit-distance budget and does not mistake repeated words for the bytes a later act kept.
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

// Build a local inverse through accepted and queued work. A queued target is named by
// its immutable operation identity; its generation is known before this Undo reaches the server.
export function undoQueue(base, acceptedLog, pending, client, seq, target) {
	const log = acceptedLog.slice();
	let text = base, gen = log.at(-1)?.gen ?? 0;
	for (const row of pending) {
		const undoes = row.undoTarget ? log.find(prior => prior.client === row.undoTarget.client && prior.seq === row.undoTarget.seq)?.gen : row.undoes;
		if (row.undoTarget && undoes === undefined) throw new RangeError('undo target unavailable');
		const entry = {...row, gen: ++gen, undo: inverseSplices(text, row.splices), undoes: undoes == null ? [] : [undoes]};
		text = applySplices(text, row.splices);
		log.push(entry);
	}
	const targetGen = target ? log.find(row => row.client === target.client && row.seq === target.seq)?.gen : undefined;
	if (target && targetGen === undefined) return null;
	const state = {text, gen, base: log[0] ? log[0].gen - 1 : gen, log};
	const edit = undoEdit(state, client, seq, targetGen);
	if (!edit) return null;
	const entry = log.find(row => row.gen === edit.undoes);
	return {client, seq, splices: edit.splices,
		undoTarget: {client: entry.client, seq: entry.seq}};
}
