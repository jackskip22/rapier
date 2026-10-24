// SPDX-License-Identifier: AGPL-3.0-only
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
	const staleUndo = undoEdit(restored, 'ann', 2, 1);
	const shortened = applyEdit(restored, edit('other', 1, restored.gen, [splice(0, 1, ''), splice(2, 1, '')])).state;
	assert.equal(shortened.text, 'B');
	assert.equal(applyEdit(shortened, staleUndo).state.text, 'b',
		'a stale Undo after Redo validates against its authored source and preserves later deletions');
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
	const prepare = client => {
		const head = client.pending[0];
		if (!head) return;
		if (!client.flight) {
			const {undoTargets, ...request} = head;
			if (undoTargets) request.undoes = undoTargets.map(target => {
				const entry = client.history.find(row => row.client === target.client && row.seq === target.seq);
				assert.ok(entry, 'each grouped target is acknowledged before the group reaches the queue head');
				return entry.gen;
			});
			client.flight = copy({...request, gen: client.gen, agent: client.client === 'agent'});
		}
		assert.equal(Object.hasOwn(client.flight, 'undoTargets'), false, 'internal grouped references never cross the wire');
		return client.flight;
	};
	const send = client => {
		if (!prepare(client)) return;
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
	const cold = () => {server = copy(server);};
	const drain = () => {
		while (clients.some(client => client.pending.length || client.gen < server.gen)) {
			for (const client of clients) receive(client);
			for (const client of clients) send(client);
		}
		for (const client of clients) assert.equal(text(client), server.text, 'offline queues converge to the authoritative source');
	};
	return {clients, text, local, undo, prepare, send, receive, recover, cold, drain, server: () => server,
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

	const overlap = session('abc', ['ann', 'bob']), [a, b] = overlap.clients;
	overlap.local(a, [splice(1, 1, '')]); overlap.undo(a);
	overlap.local(b, [splice(1, 1, '')]); overlap.send(b);
	overlap.recover(a); overlap.receive(a); overlap.drain();
	assert.equal(overlap.server().text, 'ac');

	const continuation = session('abc', ['ann', 'bob']), [c, d] = continuation.clients;
	continuation.local(c, [splice(1, 1, '')]); continuation.undo(c);
	continuation.local(c, [splice(1, 1, 'B')]);
	continuation.local(d, [splice(1, 1, '')]); continuation.send(d);
	continuation.receive(c); continuation.drain();
	assert.equal(continuation.server().text, 'aBc');

	const sharedUndo = session('x', ['ann', 'bob']), [e, f] = sharedUndo.clients;
	sharedUndo.local(e, [splice(1, 0, 'shared')]); sharedUndo.drain();
	sharedUndo.undo(e); sharedUndo.undo(f, {client: 'ann', seq: 1});
	sharedUndo.send(e); sharedUndo.send(f); sharedUndo.send(f); sharedUndo.drain();
	assert.equal(sharedUndo.server().text, 'x');
	sharedUndo.undo(e, {client: 'ann', seq: 2}); sharedUndo.drain();
	assert.equal(sharedUndo.server().text, 'x', 'withdrawing one inverse keeps the other choice effective');
	sharedUndo.undo(e, {client: 'bob', seq: 1}); sharedUndo.drain();
	assert.equal(sharedUndo.server().text, 'xshared', 'withdrawing both independent inverses restores the original');
	return h.receipt();
}

export function liveGroupedQueueCells() {
	const failures = [];
	const scenario = (name, body) => {
		try {body();} catch (error) {error.message = name + ': ' + error.message; failures.push(error);}
	};
	const targets = [{client: 'ann', seq: 1}, {client: 'ann', seq: 2}];
	const replaceTwo = (h, ann) => {
		h.local(ann, [splice(1, 1, 'B')]);
		h.local(ann, [splice(3, 1, 'D')]);
		assert.equal(h.text(ann), 'aBcDe');
	};
	const deleteTwo = (h, ann) => {
		h.local(ann, [splice(1, 1, '')]);
		h.local(ann, [splice(2, 1, '')]);
		assert.equal(h.text(ann), 'ace');
	};
	const numeric = (ann, inverse) => {
		assert.deepEqual(inverse.undoTargets, targets);
		inverse.undoes = inverse.undoTargets.map(target => {
			const prior = ann.history.find(row => row.client === target.client && row.seq === target.seq);
			assert.ok(prior, 'numeric inverse references name already accepted acts');
			return prior.gen;
		});
		delete inverse.undoTargets;
		assert.deepEqual(inverse.undoes, [1, 2]);
	};

	scenario('offline group, lost acknowledgement, cold copies and any-author Undo', () => {
		const grouped = session('abcde', ['ann', 'bob']), [ann, bob] = grouped.clients;
		replaceTwo(grouped, ann);
		const authoredTargets = copy(targets), inverse = grouped.undo(ann, authoredTargets);
		assert.deepEqual(inverse.undoTargets, targets);
		authoredTargets.reverse(); authoredTargets[0].seq = 99;
		assert.deepEqual(inverse.undoTargets, targets, 'the queued group owns an immutable ordered copy of its original targets');
		assert.equal(grouped.text(ann), 'abcde');
		assert.equal(Object.hasOwn(inverse, 'undoes'), false);
		grouped.send(ann);
		assert.equal(grouped.server().text, 'aBcde');
		assert.deepEqual(ann.pending[2].undoTargets, targets);
		grouped.receive(ann); grouped.send(ann);
		assert.equal(grouped.server().text, 'aBcDe');
		assert.deepEqual(ann.pending[1].undoTargets, targets);
		grouped.receive(ann);
		const request = copy(grouped.prepare(ann));
		assert.deepEqual(request.undoes, [1, 2]);
		assert.equal(request.seq, 3); assert.equal(request.gen, 2);
		const accepted = grouped.send(ann);
		assert.equal(accepted.state.text, 'abcde');
		assert.deepEqual(accepted.state.log.at(-1).undoes, [1, 2]);
		const durable = copy(grouped.server());
		grouped.recover(ann); grouped.cold();
		assert.deepEqual(ann.flight, request);
		const repeated = grouped.send(ann);
		assert.equal(repeated.status, 'duplicate'); assert.equal(repeated.gen, 3);
		assert.deepEqual(grouped.server(), durable, 'a lost group acknowledgement survives cold client and server copies without a second inverse');
		grouped.drain();
		assert.equal(grouped.server().text, 'abcde');
		assert.ok(grouped.undo(bob, {client: 'ann', seq: 3})); grouped.drain();
		assert.equal(grouped.server().text, 'aBcDe', 'another author can Undo the whole grouped Undo');
		assert.deepEqual(grouped.server().log.at(-1).undoes, [3]);
		assert.ok(grouped.undo(bob, {client: 'ann', seq: 1})); grouped.drain();
		assert.equal(grouped.server().text, 'abcDe', 'the restored first original remains individually undoable');
	});

	scenario('offline group under a wider remote deletion', () => {
		const overlap = session('abcde', ['ann', 'bob']), [a, b] = overlap.clients;
		deleteTwo(overlap, a); overlap.undo(a, targets);
		assert.equal(overlap.text(a), 'abcde');
		overlap.local(b, [splice(1, 3, '')]); overlap.send(b);
		assert.equal(overlap.server().text, 'ae');
		overlap.recover(a); overlap.receive(a);
		assert.equal(overlap.text(a), 'ae', 'the offline group never restores the remotely deleted b, c, or d');
		assert.deepEqual(a.pending[2].undoTargets, targets);
		overlap.drain();
		assert.equal(overlap.server().text, 'ae');
		assert.deepEqual(overlap.server().log.find(row => row.client === 'ann' && row.seq === 3).request.undoes, [2, 3]);
	});

	scenario('typing into the optimistic group before remote deletion', () => {
		const continuation = session('abcde', ['ann', 'bob']), [c, d] = continuation.clients;
		deleteTwo(continuation, c); continuation.undo(c, targets);
		continuation.local(c, [splice(1, 1, 'B')]); continuation.local(c, [splice(3, 1, 'D')]);
		assert.equal(continuation.text(c), 'aBcDe');
		continuation.local(d, [splice(1, 3, '')]); continuation.send(d);
		continuation.recover(c); continuation.receive(c);
		assert.equal(continuation.text(c), 'aBDe', 'typing after an optimistic grouped Undo survives its overlap correction');
		continuation.drain();
		assert.equal(continuation.server().text, 'aBDe');
	});

	scenario('numeric group after another author changes and undoes its targets', () => {
		const partial = session('abcde', ['ann', 'bob']), [e, f] = partial.clients;
		replaceTwo(partial, e); partial.drain();
		const pending = partial.undo(e, targets); numeric(e, pending);
		partial.local(e, [splice(2, 0, 'X')]);
		assert.equal(partial.text(e), 'abXcde');
		partial.local(f, [splice(2, 1, 'C')]); partial.send(f); partial.receive(f);
		assert.equal(partial.server().text, 'aBCDe');
		partial.receive(e);
		assert.equal(partial.text(e), 'abXCde');
		assert.ok(partial.undo(f, targets[0])); partial.send(f); partial.receive(f);
		assert.equal(partial.server().text, 'abCDe');
		partial.receive(e);
		assert.equal(partial.text(e), 'abXCde', 'numeric grouped correction retires only the still-active original');
		assert.deepEqual(e.pending[0].undoes, [1, 2]);
		partial.drain();
		assert.equal(partial.server().text, 'abXCde');
		const partialGroup = partial.server().log.find(row => row.client === 'ann' && row.seq === 3);
		assert.deepEqual(partialGroup.request.undoes, [1, 2]); assert.deepEqual(partialGroup.undoes, [1, 2]);
		assert.ok(partial.undo(f, {client: 'ann', seq: 3})); partial.drain();
		assert.equal(partial.server().text, 'abXCDe', 'withdrawing the group keeps the independently blocked original and later text');
		assert.ok(partial.undo(f, {client: 'bob', seq: 2})); partial.drain();
		assert.equal(partial.server().text, 'aBXCDe', 'withdrawing the last blocker restores the original on the recorded side of later typing');
	});

	scenario('numeric in-flight group becomes empty before acknowledgement', () => {
		const stale = session('abcde', ['ann', 'bob']), [g, i] = stale.clients;
		replaceTwo(stale, g); stale.drain();
		const outgoing = stale.undo(g, targets); numeric(g, outgoing);
		const flight = copy(stale.prepare(g));
		stale.local(g, [splice(2, 0, 'keep')]);
		assert.equal(stale.text(g), 'abkeepcde');
		assert.ok(stale.undo(i, targets[0])); stale.send(i); stale.receive(i);
		assert.ok(stale.undo(i, targets[1])); stale.send(i); stale.receive(i);
		assert.equal(stale.server().text, 'abcde');
		stale.receive(g);
		assert.equal(stale.text(g), 'abkeepcde');
		assert.deepEqual(g.pending[0].splices, []);
		assert.deepEqual(g.flight, flight, 'remote retirements cannot rewrite an in-flight group request');
		const noop = stale.send(g);
		assert.equal(noop.state.text, 'abcde'); assert.deepEqual(noop.splices, []);
		assert.deepEqual(noop.state.log.at(-1).undoes, [1, 2]);
		assert.deepEqual(noop.state.log.at(-1).request.undoes, [1, 2]);
		stale.recover(g); stale.cold();
		const retry = stale.send(g);
		assert.equal(retry.status, 'duplicate'); assert.equal(retry.gen, noop.gen);
		stale.drain();
		assert.equal(stale.server().text, 'abkeepcde');
		assert.ok(stale.undo(i, {client: 'ann', seq: 3})); stale.drain();
		assert.equal(stale.server().text, 'abkeepcde', 'a zero-source group still owns its original inverse choices');
		assert.ok(stale.undo(i, {client: 'bob', seq: 1})); stale.drain();
		assert.equal(stale.server().text, 'aBkeepcde');
		assert.ok(stale.undo(i, {client: 'bob', seq: 2})); stale.drain();
		assert.equal(stale.server().text, 'aBkeepcDe', 'both originals return only after every blocker has been withdrawn');
	});
	if (failures.length) throw new AggregateError(failures, failures.length + ' grouped offline queue scenarios failed');
	return {cases: 5, originalTargetsRetained: true, internalReferencesStayLocal: true,
		lostAckColdRetryExact: true, remoteDeletionKept: true, laterTypingKept: true,
		numericPartialAndEmptyInverse: true, anyAuthorGroupUndo: true};
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
	const direct = queuedCases(), grouped = liveGroupedQueueCells(), first = delayedSchedule(), second = delayedSchedule();
	assert.deepEqual(first, second, 'a recorded delivery schedule yields the same exact source and retry decisions');
	return pairs + ' grouped reciprocal pairs; queue ' + first.sent + ' accepted, ' + (first.retries + direct.retries) +
		' lost-ack retries; ' + grouped.cases + ' grouped offline cases; offline selective Undo and reload exact; source sha256 ' + first.sha256;
}

export async function liveGroupedUndoCells() {
	const {createKernel, createState} = await import('../../agent/kernel.mjs');
	const {LiveSessions} = await import('../../mcp/live-session.mjs');
	let serial = 0;
	const machine = () => createKernel({state: createState({documentId: 'grouped-live-undo', filename: 'notes.md', text: 'abc'}),
		host: {retainHistory: true, liveSession: true}, clock: () => 1700000000000, mintId: prefix => prefix + (++serial)});
	const agent = {actor: 'agent', principal: 'writer', transport: 'node', agent: 'Guide'};
	const human = {actor: 'human', principal: 'reader', transport: 'node'};
	const replace = async (kernel, start, text) => {
		const read = await kernel.invoke('document.read', {target: {kind: 'source', start, end: start + 1}}, agent);
		const kept = await kernel.invoke('document.edit', {turn_id: 'live-turn', label: 'A turn',
			edits: [{context_handle: read.handle, text}]}, agent);
		assert.equal(kept.outcome, 'applied', JSON.stringify(kept));
		assert.ok(kept.act?.id); assert.equal(kept.act.turn_id, 'live-turn');
	};
	const kernel = machine();
	for (const [start, text] of [[1, 'B'], [2, 'C']]) await replace(kernel, start, text);
	const before = kernel.snapshot(), live = new LiveSessions({});
	let prior = createDoc('abc');
	for (const row of before.journal) prior = live.append(prior, row);
	const stale = undoEdit(prior, 'person', 1, 1);
	assert.equal(before.text, 'aBC');
	const result = await kernel.invoke('document.undo', {target: {kind: 'turn', turn_id: 'live-turn'}}, agent);
	assert.equal(result.outcome, 'applied', JSON.stringify(result));
	const state = kernel.snapshot();
	assert.equal(state.text, 'abc');
	assert.deepEqual(state.journal.at(-1).sourceTransactionIds, before.journal.map(row => row.id));
	let warm = createDoc('abc');
	for (const row of state.journal) warm = live.append(warm, row);
	const cold = new LiveSessions({}).document(copy(state));
	for (const doc of [warm, cold]) {
		assert.equal(doc.text, 'abc');
		assert.deepEqual(doc.log.at(-1).undoes, [1, 2], 'one grouped Undo withdraws every source act after cold reconstruction');
		assert.deepEqual(doc.log.at(-1).record.undoes, [1, 2], 'clients receive the same authored Undo graph');
		assert.equal(undoEdit(doc, 'person', 1, 1), null);
		assert.equal(undoEdit(doc, 'person', 1, 2), null);
		const noop = applyEdit(doc, stale);
		assert.equal(noop.status, 'applied'); assert.equal(noop.state.text, 'abc'); assert.deepEqual(noop.splices, []);
		assert.equal(applyEdit(copy(noop.state), stale).gen, noop.gen, 'an in-flight original Undo is acknowledged once as a no-op');
		assert.deepEqual(noop.state.log.at(-1).undoes, [1], 'the zero-source stale inverse retains its original target');
		const groupWithdrawn = applyEdit(noop.state, undoEdit(noop.state, 'person', 2, 3)).state;
		assert.equal(groupWithdrawn.text, 'abC', 'withdrawing the group preserves the independent inverse of its first member');
		const redo = applyEdit(groupWithdrawn, undoEdit(groupWithdrawn, 'person', 3, noop.gen)).state;
		assert.equal(redo.text, 'aBC', 'withdrawing both inverse choices restores the same source');
		const first = applyEdit(redo, undoEdit(redo, 'person', 4, 1)).state;
		assert.equal(first.text, 'abC', 'the restored first original act remains selectively undoable');
		assert.equal(applyEdit(first, undoEdit(first, 'person', 5, 2)).state.text, 'abc');
	}
	let later = applyEdit(cold, edit('other', 1, cold.gen, [splice(2, 0, ' people ')])).state;
	later = applyEdit(later, undoEdit(later, 'person', 1, 3)).state;
	assert.equal(later.text, 'aB people C', 'Redo of the group preserves later typing between its original changes');
	assert.equal(applyEdit(later, undoEdit(later, 'person', 2, 1)).state.text, 'ab people C');
	const interleaved = machine();
	await replace(interleaved, 1, 'B');
	const checkpoint = interleaved.snapshot();
	interleaved.reconcile({...checkpoint, text: 'aXBc', revision: 2, journal: [{id: 'person-between', ...human,
		requestId: 'typed-between', operation: 'document.human_edit', baseRevision: 1, revision: 2,
		splices: [{pos: 1, removed: '', inserted: 'X'}]}]}, human);
	await replace(interleaved, 1, 'Y');
	assert.equal((await interleaved.invoke('document.undo', {target: {kind: 'turn', turn_id: 'live-turn'}}, agent)).outcome, 'applied');
	const mixed = interleaved.snapshot();
	assert.equal(mixed.text, 'aXbc');
	let projection = createDoc('abc');
	for (const row of mixed.journal) projection = live.append(projection, row);
	projection = new LiveSessions({}).document(copy(mixed));
	const own = undoEdit(projection, projection.log[1].client, 2);
	assert.equal(own.undoes, 2);
	assert.equal(applyEdit(projection, own).state.text, 'abc',
		'the human act between two group members keeps its ownership when the group restores it');
	return 'kernel grouped Undo and cold replay; originals retire once, Redo restores authorship, later typing survives';
}
