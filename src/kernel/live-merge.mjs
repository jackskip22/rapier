// SPDX-License-Identifier: AGPL-3.0-only
// Merge core for live editing of one Markdown source string. Pure: no DOM, no I/O, no clock, no randomness.
//
// An edit is {client, seq, gen, splices, proposal?}: exact splices {at, remove, insert} (UTF-16 offsets, ascending,
// not overlapping) against generation `gen`. The server orders edits; one made against an older generation is rebased
// across every edit applied since. Rules:
// - A concurrent insert is never deleted: a removal that spans it splits around it.
// - Inserts at the same offset order by client id (the lower id first).
// - A client's base generation must include its own earlier edits (it sends the next edit after the acknowledgement).
// - A proposal that overlaps a range a person edited within `holdWindow` generations is held, not applied.
// State is a plain value: {text, gen, base, log, seen, holdWindow}; log[i] produced generation base + i + 1, and
// trim() drops what no client can still be behind. Every function returns new values, never mutates.

import {diffChars} from '../agent/diff.mjs';
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
		if (part.added) out.push({at, remove: 0, insert: part.value});
		else {
			if (part.removed) out.push({at, remove: part.value.length, insert: ''});
			at += part.value.length;
		}
	}
	return normalize(out);
}

export function createDoc(text = '', {holdWindow = 20} = {}) {
	return {text, gen: 0, base: 0, log: [], seen: {}, holdWindow};
}

// Apply ascending splices to a text (last to first, so offsets stay valid).
export function applySplices(text, splices) {
	check(text.length, splices);
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

function check(length, splices) {
	let end = 0;
	for (const s of splices) {
		if (!Number.isInteger(s.at) || !Number.isInteger(s.remove) || s.remove < 0 || typeof s.insert !== 'string') throw new RangeError('bad splice');
		if (s.at < end || s.at + s.remove > length) throw new RangeError('splice out of order or out of range');
		end = s.at + s.remove;
	}
}

// Transform splice x over y, which was applied first. xFirst: x wins a tie at the same offset.
function transform(x, y, xFirst) {
	const a = x.at, xe = a + x.remove, b = y.at, ye = b + y.remove, k = y.insert.length, d = k - y.remove;
	const out = [];
	if (x.remove > 0) {
		const left = a < b ? [a, Math.min(xe, b)] : null;
		const right = xe > ye ? [Math.max(a, ye) + d, xe + d] : null;
		if (left && right && k === 0) out.push({at: left[0], remove: right[1] - left[0], insert: ''});
		else {
			if (left) out.push({at: left[0], remove: left[1] - left[0], insert: ''});
			if (right) out.push({at: right[0], remove: right[1] - right[0], insert: ''});
		}
	}
	if (x.insert) {
		const q = a < b ? a : a === b ? (xFirst ? b : b + k) : a > ye ? a + d : b + k;
		const at = out.find(s => s.at === q && s.remove > 0);
		if (at) at.insert = x.insert; else out.push({at: q, remove: 0, insert: x.insert});
	}
	return out.sort((p, q) => p.at - q.at);
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
		for (let i = e.splices.length - 1; i >= 0; i--) out = normalize(out.flatMap(s => transform(s, e.splices[i], client < e.client)));
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
		const applied = rebaseHistory({base: 0, log: [{client, splices: out}]}, entry.client, 0, entry.splices);
		out = rebaseHistory({base: 0, log: [entry]}, client, 0, out);
		if (applied.length) remote.push({client: entry.client, splices: applied});
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

// Ascending, no empty splices, touching splices joined into one (the same text result, one canonical form).
function normalize(splices) {
	const out = [];
	for (const s of splices.filter(s => s.remove > 0 || s.insert).sort((p, q) => p.at - q.at)) {
		const l = out[out.length - 1];
		if (l && l.at + l.remove === s.at) out[out.length - 1] = {at: l.at, remove: l.remove + s.remove, insert: l.insert + s.insert};
		else out.push(s);
	}
	return out;
}

// The log entries after generation gen.
function since(state, gen) {
	if (gen < state.base) throw new RangeError('generation trimmed: resync');
	return state.log.slice(gen - state.base);
}

// Drop the entries at or before generation gen: no edit, caret or undo can be based there any more. The session
// calls it with the oldest generation any connected client still holds (and keeps holdWindow for proposals).
export function trim(state, gen) {
	gen = Math.min(gen, state.gen);
	if (gen <= state.base) return state;
	return {...state, base: gen, log: state.log.slice(gen - state.base)};
}

function overlaps(a, b) {
	return a[0] <= b[1] && b[0] <= a[1];
}

// Order one edit. Returns {state, status: 'applied' | 'held' | 'duplicate', gen, splices}. Held and duplicate edits
// leave the state as it was.
export function applyEdit(state, edit) {
	const {client, seq, gen} = edit;
	if (typeof client !== 'string' || !Number.isInteger(seq) || !Number.isInteger(gen) || gen > state.gen) throw new RangeError('bad edit');
	if (gen < state.base) throw new RangeError('base generation trimmed: resync');
	const last = state.seen[client];
	if (last && seq <= last.seq) return {state, status: 'duplicate', gen: last.gen, splices: []};
	if (last && gen < last.gen && edit.undoes == null) throw new RangeError('base generation does not include the client\'s own earlier edit');
	check(Infinity, edit.splices);
	const splices = rebaseHistory(state, client, gen, edit.splices);
	check(state.text.length, splices);
	if (edit.proposal && splices.length) {
		const mine = [splices[0].at, Math.max(...splices.map(s => s.at + s.remove))];
		for (const e of since(state, Math.max(state.base, state.gen - state.holdWindow))) {
			if (e.proposal) continue;
			for (const t of e.touched) {
				const r = heldRange(state, t, e.gen);
				if (overlaps(mine, r)) return {state, status: 'held', gen: state.gen, splices: [], range: r};
			}
		}
	}
	let shift = 0;
	const touched = [], undo = [];
	for (const s of splices) {
		const at = s.at + shift;
		touched.push([at, at + s.insert.length]);
		undo.push({at, remove: s.insert.length, insert: state.text.slice(s.at, s.at + s.remove)});
		shift += s.insert.length - s.remove;
	}
	const entry = {gen: state.gen + 1, client, seq, splices, touched, undo, proposal: !!edit.proposal, undoes: edit.undoes ?? null};
	return {
		state: {...state, text: applySplices(state.text, splices), gen: entry.gen, log: [...state.log, entry], seen: {...state.seen, [client]: {seq, gen: entry.gen}}},
		status: 'applied', gen: entry.gen, splices,
	};
}

function heldRange(state, range, fromGen) {
	let [s, e] = range;
	for (const entry of since(state, fromGen))
		for (let i = entry.splices.length - 1; i >= 0; i--) { s = mapPos(s, entry.splices[i], false); e = mapPos(e, entry.splices[i], false); }
	return [s, e];
}

// Move a cursor or selection {anchor, head} made at generation `gen` to the current generation. The client's own
// edits carry its carets past what it typed; another client's insert at the caret leaves it in front.
export function rebasePresence(state, presence, gen, client = null) {
	let {anchor, head} = presence;
	for (const e of since(state, gen))
		for (let i = e.splices.length - 1; i >= 0; i--) {
			const after = e.client === client;
			anchor = mapPos(anchor, e.splices[i], after);
			head = mapPos(head, e.splices[i], after);
		}
	return {anchor, head, gen: state.gen};
}

// The edit that undoes a client's own latest edit not yet undone, or null. Send it through applyEdit: it is
// against the generation that edit produced, so it rebases over everyone's later work, which it never deletes.
export function undoEdit(state, client, seq) {
	const undone = new Set(state.log.filter(e => e.client === client && e.undoes !== null).map(e => e.undoes));
	for (let i = state.log.length - 1; i >= 0; i--) {
		const e = state.log[i];
		if (e.client === client && e.undoes === null && !undone.has(e.gen) && e.undo.length)
			return {client, seq, gen: e.gen, splices: e.undo, undoes: e.gen};
	}
	return null;
}
