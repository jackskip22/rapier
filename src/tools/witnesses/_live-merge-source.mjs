// SPDX-License-Identifier: AGPL-3.0-only
// Concurrent pairs converge in either arrival order. A delete never removes a
// concurrent insert, an agent edit over an active composition is held,
// a seeded schedule of 1,000 concurrent edits from three clients replays to one text, presence rebases, undo is exact, and a log trimmed to what clients can reach decides every edit the same.
import assert from 'node:assert/strict';
import {createDoc, applyEdit, applySplices, sourceEdits, sourceSplices, mergeSource, mergeSplices, replay, rebasePresence, undoEdit, trim} from '../../kernel/live-merge.mjs';
import {_rapierTransformSplices as transformSplices} from '../../kit/ledger/journal-records.mjs';
import {transportInterval, transportTouchedInterval} from '../../kit/ledger/merge.mjs';
import {liveQueueCells} from './_live-queue-cells.mjs';

const rng = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ed = (client, seq, gen, ...splices) => ({client, seq, gen, splices});
const sp = (at, remove, insert) => ({at, remove, insert});
const run = (doc, ...edits) => edits.reduce((d, e) => applyEdit(d, e).state, doc);

// A random ascending splice list against a text, over a small alphabet so ties and overlaps are frequent.
function randomSplices(text, random) {
	const out = [];
	const boundaries = [0];
	for (const scalar of text) boundaries.push(boundaries.at(-1) + scalar.length);
	let index = 0;
	for (let n = 1 + Math.floor(random() * 2); n > 0; n--) {
		index += Math.floor(random() * (boundaries.length - index) / (n > 1 ? 2 : 1));
		const at = boundaries[index], count = random() < 0.5 ? 0 : Math.floor(random() * Math.min(4, boundaries.length - index));
		const remove = boundaries[index + count] - at;
		const insert = random() < 0.2 ? '' : ['a', 'ab', '😀', '\n'][Math.floor(random() * 4)];
		if (remove || insert) out.push(sp(at, remove, insert));
		index += count;
	}
	return out;
}

export function liveMergeSourceCells() {
	const source = 'Before\r\nAlpha 😀\r\nAfter', start = source.indexOf('Alpha'), end = start + 5;
	// A replacement's retained boundary character must not hide part of the person's new source.
	for (const [replacement, split] of [
		['Human words', [{pos: end, removed: '', inserted: 'n words'}, {pos: start, removed: 'Alph', inserted: 'Hum'}]],
		['New Aword', [{pos: start, removed: '', inserted: 'New '}, {pos: start + 5, removed: 'lpha', inserted: 'word'}]],
	]) for (const splices of [[{pos: start, removed: 'Alpha', inserted: replacement}], split]) {
		const changed = transformSplices(source, splices);
		assert.equal(changed, source.replace('Alpha', replacement));
		assert.equal(transportInterval(start, end, splices), null, 'a touched source range cannot retain edit authority');
		const extent = transportTouchedInterval(start, end, splices);
		assert.deepEqual(extent, {start, end: start + replacement.length}, 'coarse and split replacements disclose the whole current extent');
		assert.equal(changed.slice(extent.start, extent.end), replacement);
	}
	const adjacent = [{pos: end, removed: '', inserted: '>>'}, {pos: start, removed: '', inserted: '<<'}];
	assert.equal(transformSplices(source, adjacent), source.replace('Alpha', '<<Alpha>>'));
	for (const [range, expected] of [
		[{start, end}, {start: start + 2, end: end + 2}],
		[{start, end: start}, {start: start + 2, end: start + 2}],
		[{start: end, end}, {start: end + 4, end: end + 4}],
	]) {
		assert.deepEqual(transportInterval(range.start, range.end, adjacent), expected);
		assert.deepEqual(transportTouchedInterval(range.start, range.end, adjacent), expected,
			'disjoint boundary inserts preserve exact ranges and zero-width carets');
	}
	const original = 'one 🗡️ target tail', first = 'H'.repeat(6000), second = 'J'.repeat(6000);
	const journal = [{revision: 101, baseRevision: 100, splices: [{pos: 0, removed: '', inserted: first}]},
		{revision: 102, baseRevision: 101, splices: [{pos: original.length + first.length, removed: '', inserted: second}]},
		{revision: 103, baseRevision: 102, splices: [{pos: 1, removed: 'H', inserted: 'X'}]}];
	const authored = journal.flatMap(row => row.splices), submitted = transformSplices(original, authored);
	assert.deepEqual(sourceEdits(original, submitted, journal), authored, 'source replay finds an exact local suffix independently of server revisions');
	const remote = [{client: 'agent', splices: [{at: original.indexOf('target'), remove: 0, insert: 'AGENT'}]}];
	const joined = mergeSource(original, authored, 'human', remote);
	assert.equal(joined.text, 'HX' + first.slice(2) + 'one 🗡️ AGENTtarget tail' + second);
	assert.equal(transformSplices(replay(original, remote), joined.splices), joined.text);
	assert.equal(replay(submitted, joined.remote), joined.text, 'reciprocal deltas replay after a later edit to locally inserted source');
	assert.equal(transformSplices('base', sourceEdits('base', 'changed base', [{splices: [{pos: 0, removed: '', inserted: 'wrong'}]}])), 'changed base',
		'a broken retained suffix cannot stand in for the exact old source');
	assert.throws(() => mergeSource(original, [{pos: 5, removed: '', inserted: 'invalid'}], 'human', remote), /source_edits_invalid/,
		'journal splice boundaries cannot split a scalar');
	assert.equal(mergeSource(original, [{pos: 0, removed: '', inserted: ''}], 'human', remote).text, replay(original, remote));
	// Concurrent text lands where the base puts it, however the draft's edits are grouped: rebuilding the draft from a word
	// diff of 'abcd' to 'aXbcYd' (one replaced word) puts the remote 'Z' after the draft's second insert, 'aXbcYZd'.
	assert.equal(mergeSource('abcd', [{pos: 1, removed: '', inserted: 'X'}, {pos: 4, removed: '', inserted: 'Y'}], 'human',
		[{client: 'agent', splices: [{at: 2, remove: 0, insert: 'Z'}]}]).text, 'aXbZcYd', 'a draft of two inserts keeps a concurrent insert between them');
	for (const [before, after] of [['', '🗡️'], ['🗡️', ''], ['abc', 'abc'], ['a🗡b', 'a🗞b'],
		['one 🗡️ two\r\nthree', 'HUMAN one 🗡️ TWO\r\nthree!'], ['abc target xyz', 'Aabc target xyZ']]) {
		const splices = sourceSplices(before, after);
		assert.equal(applySplices(before, splices), after, 'source diff replays exact scalars and line endings');
		for (const splice of splices) for (const at of [splice.at, splice.at + splice.remove])
			assert.ok(!(at && at < before.length && /[\uD800-\uDBFF]/.test(before[at - 1]) && /[\uDC00-\uDFFF]/.test(before[at])), 'source boundary splits a scalar');
	}
	for (const [text, human, agent] of [['abcdef', 'abHUMANef', 'abcAGENTdef'], ['a🗡b', 'aHUMAN🗡b', 'aAGENT🗡b'],
		['one target tail', 'HUMAN one target tail END', 'one AGENT tail']]) {
		const left = ed('human', 1, 0, ...sourceSplices(text, human)), right = ed('agent', 1, 0, ...sourceSplices(text, agent));
		const a = run(createDoc(text), left, right).text, b = run(createDoc(text), right, left).text;
		assert.equal(a, b, 'source-derived concurrent edits converge');
		assert.ok(a.includes('HUMAN') && a.includes('AGENT'), 'removal cannot consume a concurrent insert');
	}
	// Two typists in one paragraph converge in either arrival order, and in the same bytes every time.
	const base = 'The quick fox jumps.';
	const a = ed('ann', 1, 0, sp(9, 0, ' brown')), b = ed('bob', 1, 0, sp(9, 0, ' red'), sp(19, 0, ' now'));
	const ab = run(createDoc(base), a, b), ba = run(createDoc(base), b, a);
	assert.equal(ab.text, ba.text);
	assert.equal(ab.text, 'The quick brown red fox jumps now.');
	assert.equal(JSON.stringify(run(createDoc(base), a, b)), JSON.stringify(ab));
	// Delete over a concurrent insert keeps the insert, from either side.
	const del = ed('ann', 1, 0, sp(4, 10, '')), ins = ed('bob', 1, 0, sp(6, 0, 'RED '));
	const d1 = run(createDoc(base), del, ins), d2 = run(createDoc(base), ins, del);
	assert.equal(d1.text, d2.text);
	assert.ok(d1.text.includes('RED '), 'insert lost: ' + d1.text);
	assert.equal(d1.text, 'The RED jumps.');
	// Only an active composition holds an agent. Past human edits do not create a permission gate.
	const doc = run(createDoc(base), ed('ann', 1, 0, sp(4, 5, 'slow')));
	const composing = [{client: 'ann', gen: doc.gen, anchor: 4, head: 8}];
	const heldEdit = {...ed('agent', 1, 1, sp(5, 2, 'XX')), agent: true};
	const over = applyEdit(doc, heldEdit, {composing});
	assert.equal(over.status, 'held'); assert.equal(over.state, doc); assert.equal(over.state.gen, 1);
	assert.equal(applyEdit(doc, {...ed('agent', 1, 1, sp(0, 3, 'A')), agent: true}, {composing}).status, 'applied');
	const released = applyEdit(over.state, heldEdit, {composing: []});
	assert.equal(released.status, 'applied', 'the same held request applies when composition ends');
	assert.equal(released.state.text, 'The sXXw fox jumps.');
	assert.equal(applyEdit(released.state, heldEdit, {composing}).status, 'duplicate', 'composition cannot replay an acknowledged edit');
	assert.equal(applyEdit(doc, ed('agent', 1, doc.gen, sp(5, 2, 'XX')), {composing}).status, 'applied');
	const shifted = run(doc, ed('bob', 1, doc.gen, sp(0, 0, '>> ')));
	assert.equal(applyEdit(shifted, {...ed('agent', 1, shifted.gen, sp(8, 2, 'XX')), agent: true}, {composing}).status, 'held',
		'an active range rebases from its exact generation before collision admission');
	const caret = [{client: 'ann', gen: 0, anchor: 9, head: 9}];
	assert.equal(applyEdit(doc, {...ed('agent', 1, doc.gen, sp(8, 0, '!')), agent: true}, {composing: caret}).status, 'held',
		'a rebased composition caret retains its insertion gap');
	assert.equal(applyEdit(doc, {...ed('agent', 1, doc.gen, sp(9, 0, '!')), agent: true}, {composing: caret}).status, 'applied');
	// Pairs: any two concurrent edits converge in either order (random multi-splice, replace, delete, insert).
	const random = rng(7);
	for (let n = 0; n < 4000; n++) {
		const text = 'abca\nbc\u{1F600}'.slice(0, 2 + Math.floor(random() * 8)).replace(/\uD83D$/, '');
		const x = ed('c1', 1, 0, ...randomSplices(text, random)), y = ed('c2', 1, 0, ...randomSplices(text, random));
		const p = run(createDoc(text), x, y).text, q = run(createDoc(text), y, x).text;
		assert.equal(p, q, JSON.stringify({text, x: x.splices, y: y.splices, p, q}));
		const receipt = mergeSplices(x.client, x.splices, [{client: y.client, splices: y.splices}]);
		assert.equal(applySplices(applySplices(text, y.splices), receipt.splices), p);
		assert.equal(replay(applySplices(text, x.splices), receipt.remote), p, 'the reciprocal receipt preserves the same merged bytes');
	}
	// Seeded schedule: 1,000 concurrent edits, three clients with stale views; every client replaying the server's order agrees.
	const r = rng(20261006);
	const names = ['c1', 'c2', 'c3'];
	let server = createDoc('# Notes\n\nOne paragraph of words.\n\nAnother paragraph.\n');
	const initial = server.text;
	const clients = names.map(id => ({id, seq: 0, gen: 0, text: initial, last: 0}));
	let held = 0, trimmed = server, longest = 0;
	for (let n = 0; n < 1000; n++) {
		const c = clients[Math.floor(r() * 3)];
		const from = Math.max(c.last, c.gen), to = from + Math.floor(r() * (server.gen - from + 1));
		c.text = replay(c.text, server.log.slice(c.gen, to)); c.gen = to;
		const splices = randomSplices(c.text, r);
		const agent = r() < 0.1;
		const edit = {client: c.id, seq: ++c.seq, gen: c.gen, splices, agent};
		const composing = n % 7 === 0 ? [{client: 'person', anchor: 0, head: server.text.length, gen: server.gen}] : [];
		const receipt = mergeSplices(c.id, splices, server.log.slice(c.gen));
		const res = applyEdit(server, edit, {composing}), tres = applyEdit(trimmed, edit, {composing});
		if (res.status === 'applied') assert.equal(replay(applySplices(c.text, splices), receipt.remote), res.state.text,
			'continued source replays the exact reciprocal delta over several remote commits');
		server = res.state;
		// The trimmed twin keeps every offline client's base, and decides every edit the same.
		assert.deepEqual([tres.status, tres.gen, tres.splices], [res.status, res.gen, res.splices]);
		trimmed = trim(tres.state, Math.min(...clients.map(x => x.gen)));
		longest = Math.max(longest, trimmed.log.length);
		if (res.status === 'held') held++; else c.last = res.gen;
	}
	const texts = clients.map(() => replay(initial, server.log));
	assert.ok(texts.every(x => x === server.text));
	assert.equal(server.gen + held, 1000);
	assert.equal(trimmed.text, server.text);
	assert.ok(longest < server.log.length / 2, 'trim kept ' + longest + ' of ' + server.log.length);
	assert.throws(() => applyEdit(trimmed, {client: 'late', seq: 1, gen: trimmed.base - 1, splices: []}), /trimmed/);
	// Presence rebases across applied edits; a client's own typing carries its caret.
	const pd = run(createDoc('hello world'), ed('ann', 1, 0, sp(0, 0, 'Oh, ')), ed('bob', 1, 1, sp(8, 3, '')), ed('bob', 2, 2, sp(4, 0, '>')));
	assert.deepEqual(rebasePresence(pd, {anchor: 6, head: 11}, 0), {anchor: 9, head: 13, gen: 3});
	assert.deepEqual(rebasePresence(run(createDoc('abc'), ed('ann', 1, 0, sp(1, 0, 'XY'))), {anchor: 1, head: 1}, 0, 'ann'), {anchor: 3, head: 3, gen: 1});
	assert.deepEqual(rebasePresence(run(createDoc('abc'), ed('ann', 1, 0, sp(1, 0, 'XY'))), {anchor: 1, head: 1}, 0, 'bob'), {anchor: 1, head: 1, gen: 1});
	// Undo restores exactly, alone and under a neighbour's later edit, and undoing twice walks back.
	const u0 = createDoc('one two three');
	const u1 = run(u0, ed('ann', 1, 0, sp(4, 3, 'TWO!')));
	let u = applyEdit(u1, undoEdit(u1, 'ann', 2)).state;
	assert.equal(u.text, 'one two three');
	assert.equal(undoEdit(u, 'ann', 3), null);
	const v = run(u1, ed('bob', 1, 1, sp(0, 0, '>> ')), ed('ann', 2, 2, sp(17, 0, '?')));
	const vu = applyEdit(v, undoEdit(v, 'ann', 3)).state;
	assert.equal(vu.text, '>> one TWO! three');
	const vv = applyEdit(vu, undoEdit(vu, 'ann', 4)).state;
	assert.equal(vv.text, '>> one two three');
	// Undo of an edit a neighbour typed inside keeps the neighbour's text.
	const w = run(createDoc('x'), ed('ann', 1, 0, sp(1, 0, 'abcdef')), ed('bob', 1, 1, sp(4, 0, 'ZZ')));
	assert.equal(applyEdit(w, undoEdit(w, 'ann', 2)).state.text, 'xZZ');
	return 'pairs 4000, schedule 1000 edits (' + held + ' held), final ' + server.text.length + ' chars, trimmed log at most ' + longest + ' of ' + server.log.length + '; ' + liveQueueCells();
}

export default function(_page, t) { return t.pass(liveMergeSourceCells()); }
