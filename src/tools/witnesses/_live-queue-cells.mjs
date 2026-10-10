// SPDX-License-Identifier: AGPL-3.0-only
// Accepted source, optimistic queues, retry identity and selective Undo share one history.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createDoc, applyEdit, applySplices, mergeSplices, parallelSplices, replay, rebasePresence, reconcileQueue, undoQueue, undoEdit, trim} from '../../kernel/live-merge.mjs';

const copy = value => JSON.parse(JSON.stringify(value));
const edit = (client, seq, gen, splices) => ({client, seq, gen, splices});
const splice = (at, remove, insert) => ({at, remove, insert});

function pairedGaps() {
	const source = 'abcd', variants = [];
	for (let at = 0; at <= source.length; at++) for (let remove = 0; remove <= source.length - at; remove++)
		for (const insert of ['', 'X']) if (remove || insert) variants.push(splice(at, remove, insert));
	const edits = variants.map(row => [row]);
	for (const a of variants) for (const b of variants) if (a.at + a.remove < b.at) edits.push([a, b]);
	let pairs = 0;
	for (const left of edits) for (const pattern of edits) {
		const right = pattern.map(row => ({...row, insert: row.insert ? 'Y' : ''}));
		const receipt = mergeSplices('ann', left, [{client: 'bob', splices: right}]);
		const actual = applySplices(applySplices(source, right), receipt.splices);
		assert.equal(replay(applySplices(source, left), receipt.remote), actual,
			'two distinct insertion gaps survive concurrent multi-splice deletions');
		pairs++;
	}
	return pairs;
}

function admissionAndRetry() {
	let state = createDoc('a😀b');
	const untouched = JSON.stringify(state);
	assert.throws(() => rebasePresence(state, {anchor: 2, head: 2}, 0), /splits a scalar/);
	for (const row of [splice(2, 0, '!'), splice(1, 1, ''), splice(0, 0, '\ud800'), splice(-1, 0, '!'),
		splice(Number.MAX_SAFE_INTEGER, 1, '!')]) {
		assert.throws(() => applyEdit(state, edit('ann', 1, 0, [row])), RangeError);
		assert.equal(JSON.stringify(state), untouched, 'a refused splice leaves source and history unchanged');
	}
	const first = edit('__proto__', 1, 0, [splice(0, 0, 'first ')]);
	state = applyEdit(state, first).state;
	const second = edit('__proto__', 2, 1, [splice(state.text.length, 0, ' last')]);
	state = applyEdit(state, second).state;
	const retry = applyEdit(copy(state), copy(first));
	assert.equal(retry.status, 'duplicate');
	assert.equal(retry.gen, 1, 'a lost old acknowledgement names its own generation');
	assert.equal(retry.state.text, state.text, 'retry cannot overwrite later accepted source');
	assert.deepEqual(retry.splices, state.log[0].splices);
	assert.throws(() => applyEdit(state, {...first, splices: [splice(0, 0, 'changed')]}), /operation id reused/);
	const trimmed = trim(state, state.gen);
	assert.equal(applyEdit(copy(trimmed), first).gen, 1, 'retry identity survives a retained-history checkpoint');
	assert.equal(applyEdit(copy(trimmed), first).state.text, state.text);
	assert.throws(() => applyEdit(state, edit('other', 1, 0, [splice(5, 0, 'outside old source')])), /out of range/);
	const undo = undoEdit(state, 'person', 1, 1), undone = applyEdit(state, undo).state;
	assert.equal(undone.text, 'a😀b last', 'an explicit author-target Undo keeps another later act');
	assert.throws(() => applyEdit(state, {...undo, splices: [splice(0, 1, 'forged')]}), /undo source mismatch/);
	assert.equal(applyEdit(undone, undoEdit(undone, 'person', 2, undone.gen)).state.text, state.text,
		'Undo of an Undo restores that act and keeps later source');
	let restored = createDoc('abc');
	restored = applyEdit(restored, edit('ann', 1, 0, [splice(1, 1, 'B')])).state;
	restored = applyEdit(restored, undoEdit(restored, 'bob', 1, 1)).state;
	restored = applyEdit(restored, undoEdit(restored, 'bob', 2, 2)).state;
	assert.equal(restored.text, 'aBc');
	assert.equal(applyEdit(restored, undoEdit(restored, 'ann', 2, 1)).state.text, 'abc',
		'an act restored by Undo keeps its original ownership when it is undone again');
	const source = 'A paragraph keeps words here. 😀\r\n';
	const changed = source.replace('words', 'typed words'), last = changed.replace('here', 'right here');
	const rows = [{pos: 0, removed: source, inserted: changed}, {pos: 0, removed: changed, inserted: last}];
	const projected = parallelSplices(source, rows), remote = [{client: 'agent', splices: [splice(source.indexOf('words') + 5, 0, ' AGENT')]}];
	const joined = mergeSplices('ann', projected, remote);
	assert.equal(applySplices(replay(source, remote), joined.splices), 'A paragraph keeps typed words AGENT right here. 😀\r\n',
		'whole-block input records keep unchanged gaps available to concurrent collaborators');
	assert.equal(replay(last, joined.remote), 'A paragraph keeps typed words AGENT right here. 😀\r\n');
	assert.throws(() => parallelSplices(source, [{pos: 0, removed: 'wrong', inserted: 'source'}]), /source_edits_invalid/);
	const escaped = '"\\'.repeat(131072), astral = '😀' + escaped.slice(0, -4) + '🌱';
	const boundary = '# Title\n\nHello there. Body text to replace.\n';
	for (const [before, row] of [
		[boundary, {pos: 10, removed: boundary.slice(10, 20), inserted: escaped}],
		['a😀b', {pos: 3, removed: '', inserted: astral}],
		['a😀b', {pos: 1, removed: '😀', inserted: astral}],
	]) {
		const exact = parallelSplices(before, [row], {authoredRanges: true});
		assert.equal(row.inserted.length, 262144);
		assert.deepEqual(exact, [splice(row.pos, row.removed.length, row.inserted)],
			'a declared source range retains its exact large replacement without an edit-distance budget');
		assert.equal(applySplices(before, exact), before.slice(0, row.pos) + row.inserted + before.slice(row.pos + row.removed.length));
	}
	assert.throws(() => parallelSplices('a😀b', [{pos: 2, removed: '', inserted: escaped}], {authoredRanges: true}), RangeError);
}

function session(source, names = ['ann', 'bob', 'agent']) {
	let server = createDoc(source), sent = 0, retries = 0, corrections = 0;
	const clients = names.map(client => ({client, seq: 0, gen: 0, base: source, pending: [], history: [], flight: null}));
	const text = client => replay(client.base, client.pending);
	const local = (client, splices) => {
		applySplices(text(client), splices);
		client.pending.push({client: client.client, seq: ++client.seq, splices: copy(splices)});
	};
	const undo = (client, target) => {
		const next = undoQueue(client.base, client.history, client.pending, client.client, client.seq + 1, target);
		if (next) {client.seq++; client.pending.push(next);}
		return next;
	};
	const send = client => {
		const head = client.pending[0];
		if (!head) return;
		client.flight ??= copy({...head, gen: client.gen, agent: client.client === 'agent'});
		const before = server, result = applyEdit(server, client.flight);
		server = result.state;
		if (result.status === 'duplicate') {retries++; assert.equal(server, before);}
		else {assert.equal(result.status, 'applied'); sent++;}
		return result;
	};
	const receive = (client, until = server.gen) => {
		while (client.gen < until) {
			const entry = copy(server.log[client.gen]), before = text(client), history = [...client.history, entry];
			const next = reconcileQueue(client.base, client.pending, entry, history);
			assert.equal(applySplices(before, next.splices), next.text, 'the acknowledgement correction preserves every later local edit');
			client.gen = entry.gen; client.base = next.base; client.pending = next.pending; client.history = history;
			if (next.splices.length) corrections++;
			if (next.accepted) {assert.equal(client.flight?.seq, entry.seq); client.flight = null;}
		}
	};
	const recover = client => Object.assign(client, copy(client));
	const drain = () => {
		while (clients.some(client => client.pending.length || client.gen < server.gen)) {
			for (const client of clients) receive(client);
			for (const client of clients) send(client);
		}
		for (const client of clients) assert.equal(text(client), server.text, 'offline queues converge to the authoritative source');
	};
	return {clients, text, local, undo, send, receive, recover, drain, server: () => server,
		receipt: () => ({sent, retries, corrections, text: server.text})};
}

function queuedCases() {
	const h = session('The quick fox jumps.\r\n😀\r\n'), [ann, bob, agent] = h.clients;
	h.local(ann, [splice(9, 0, ' brown')]); h.send(ann);
	h.local(ann, [splice(h.text(ann).indexOf('fox'), 3, 'vixen')]);
	h.local(bob, [splice(4, 5, ''), splice(9, 0, 'red')]);
	h.local(bob, [splice(h.text(bob).length, 0, 'Offline words.\r\n')]);
	h.local(agent, [splice(h.text(agent).indexOf('jumps'), 5, 'rests')]);
	h.send(bob); h.send(agent); h.send(ann);
	h.recover(ann); h.recover(bob); h.send(ann);
	h.drain();
	assert.equal(h.server().text, 'The  brownred vixen rests.\r\n😀\r\nOffline words.\r\n');
	h.undo(ann); h.drain();
	assert.equal(h.server().text, 'The  brownred fox rests.\r\n😀\r\nOffline words.\r\n');
	h.undo(bob); h.drain();
	assert.equal(h.server().text, 'The  brownred fox rests.\r\n😀\r\n');

	// The concurrent delete makes the offline delete empty. Its queued Undo must not
	// resurrect the other person's removal, including after the local queue is restored.
	const overlap = session('abc', ['ann', 'bob']), [a, b] = overlap.clients;
	overlap.local(a, [splice(1, 1, '')]); overlap.undo(a);
	overlap.local(b, [splice(1, 1, '')]); overlap.send(b);
	overlap.recover(a); overlap.receive(a); overlap.drain();
	assert.equal(overlap.server().text, 'ac');

	// Later typing inside an optimistic Undo survives when that Undo becomes empty.
	const continuation = session('abc', ['ann', 'bob']), [c, d] = continuation.clients;
	continuation.local(c, [splice(1, 1, '')]); continuation.undo(c);
	continuation.local(c, [splice(1, 1, 'B')]);
	continuation.local(d, [splice(1, 1, '')]); continuation.send(d);
	continuation.receive(c); continuation.drain();
	assert.equal(continuation.server().text, 'aBc');

	// Two people can Undo the same act concurrently. The second is an acknowledged
	// no-op, and retrying either request never restores or removes the text twice.
	const sharedUndo = session('x', ['ann', 'bob']), [e, f] = sharedUndo.clients;
	sharedUndo.local(e, [splice(1, 0, 'shared')]); sharedUndo.drain();
	sharedUndo.undo(e); sharedUndo.undo(f, {client: 'ann', seq: 1});
	sharedUndo.send(e); sharedUndo.send(f); sharedUndo.send(f); sharedUndo.drain();
	assert.equal(sharedUndo.server().text, 'x');
	sharedUndo.undo(e, {client: 'ann', seq: 2}); sharedUndo.drain();
	assert.equal(sharedUndo.server().text, 'xshared');
	return h.receipt();
}

function delayedSchedule() {
	const h = session('# Shared\r\n\r\nPeople and agents edit 😀 together.\r\n');
	let seed = 0x41533431;
	const random = limit => {seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) % limit;};
	for (let step = 0; step < 240; step++) {
		const client = h.clients[random(h.clients.length)], current = h.text(client), boundaries = [0];
		for (const scalar of current) boundaries.push(boundaries.at(-1) + scalar.length);
		const index = random(boundaries.length), at = boundaries[index];
		const remove = index + 1 < boundaries.length && random(4) === 0 ? boundaries[index + 1] - at : 0;
		h.local(client, [splice(at, remove, ['a', 'b', '😀', '\r\n'][random(4)])]);
		if (step % 17 === 0) h.undo(client);
		if (step % 11 === 0) h.recover(client);
		if (random(3) === 0) h.receive(client);
		if (random(3) !== 0) h.send(client);
		if (step % 13 === 0 && client.flight) h.send(client);
	}
	h.drain();
	const receipt = h.receipt();
	return {...receipt, sha256: createHash('sha256').update(receipt.text).digest('hex')};
}

export function liveQueueCells() {
	const pairs = pairedGaps();
	admissionAndRetry();
	const direct = queuedCases(), first = delayedSchedule(), second = delayedSchedule();
	assert.deepEqual(first, second, 'a recorded delivery schedule yields the same exact source and retry decisions');
	return pairs + ' grouped reciprocal pairs; queue ' + first.sent + ' accepted, ' + (first.retries + direct.retries) +
		' lost-ack retries; offline selective Undo and reload exact; source sha256 ' + first.sha256;
}
