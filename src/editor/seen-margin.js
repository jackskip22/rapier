function _rapierSeenRecord(text, name, meta = null) {
	if (text && typeof text === 'object' && typeof text.read === 'function') return Object.freeze({ ..._rapierReviewRoot(name, meta), view: text });
	return Object.freeze({ ..._rapierReviewRoot(name, meta), text: String(text == null ? '' : text) });
}

function _rapierReviewText(root) {
	if (!root) return null;
	if (typeof root.text === 'string') return root.text;
	if (root.view) return root.view.read();
	if (root.stateId && root.stateId === _rapierHistoryStateId()) return _rapierSourceText();
	const reconstructed = _rapierJournalTextAt(root.revision);
	if (reconstructed != null) return reconstructed;
	if (root.integrity) {
		const current = _rapierSourceText();
		const actual = _rapierTextIntegrity(current);
		if (actual.chars === root.integrity.chars && actual.fnv === root.integrity.fnv &&
				actual.adler === root.integrity.adler) return current;
	}
	return null;
}

const _RAPIER_SEEN_LOST_LINE = 'changes since your last look could not be recovered';
function _rapierSeenRestoreNotice(notice, outcome, deltaAvailable, tier) {
	let value = notice || null;
	if (tier === 3) return value;
	if (deltaAvailable) {
		if (!value) value = { tier: 2, title: 'recovered document', subtitle: '' };
		value.delta = { available: true };
	}
	if (outcome && outcome.lost && tier !== 3) {
		if (value) value.baselineLost = true;
		else value = { tier: 2, title: _RAPIER_SEEN_LOST_LINE, subtitle: '' };
	}
	return value;
}
function _rapierScopeOwns(scope, actor, transport) {
	return !!scope && !!actor && scope.kind === actor.kind && scope.id === actor.id &&
		scope.transport === (transport === 'webmcp' ? 'webmcp' : 'platform');
}
const _RAPIER_SINCE_OPEN_REFRESH_MS = 250;
const _rapierSinceOpen = Object.seal({
	worker: null, timer: null, refreshTimer: 0, jobId: 0,
	text: '', revision: -1, units: null,
});
function _rapierSinceOpenAvailable() {
	return rapier.document.docKind === 'markdown' && rapier.view.mode !== 'source' &&
		!rapier.compare.active && !!rapier.review.seen;
}
function _rapierSinceOpenWanted() {
	return rapier.review.moved.size > 0;
}
function _rapierSinceOpenClear() {
	document.querySelectorAll(':is(#editor-blocks, #editor-blocks > .block-sleep-group) > .block-wrapper[data-seen-unit]')
		.forEach(node => { delete node.dataset.seenUnit; });
}
function _rapierSinceOpenClose() {
	if (_rapierSinceOpen.timer) clearTimeout(_rapierSinceOpen.timer);
	_rapierSinceOpen.timer = null;
	if (_rapierSinceOpen.refreshTimer) clearTimeout(_rapierSinceOpen.refreshTimer);
	_rapierSinceOpen.refreshTimer = 0;
	if (_rapierSinceOpen.worker) _rapierSinceOpen.worker.terminate();
	_rapierSinceOpen.worker = null;
	_rapierSinceOpen.jobId++;
	_rapierSinceOpen.text = '';
	_rapierSinceOpen.revision = -1;
	_rapierSinceOpen.units = null;
	_rapierSeenRelease();
	_rapierSinceOpenClear();
}
function _rapierSinceOpenAnchorLine(hunk) {
	let line = Number(hunk.newStart) || 1;
	for (const row of hunk.rows) {
		if (!['context', 'meta', 'omitted'].includes(row.type)) return row.newLine || line;
		if (row.type === 'context') line++;
	}
	return line;
}
function _rapierSinceOpenLineOffsets(text) {
	const offsets = [0];
	for (let index = text.indexOf('\n'); index >= 0; index = text.indexOf('\n', index + 1)) {
		offsets.push(index + 1);
	}
	return offsets;
}
function _rapierSinceOpenRender(result) {
	_rapierSinceOpenClear();
	_rapierSinceOpen.units = result.status === 'same' ? new Map() : null;
	if (result.status !== 'ok') { _rapierSeenObserve(); return; }
	if (Number(rapier.revision.settled || 0) !== _rapierSinceOpen.revision) return;
	const host = document.getElementById('editor-blocks');
	if (!host) return;
	const wrappers = _blockWrapperChildren(host);
	const offsets = _rapierSinceOpenLineOffsets(_rapierSinceOpen.text);
	const blockIndexOfLine = line => {
		const at = _rapierBodyOffsetOfCanonical(
			offsets[Math.max(0, Math.min(offsets.length - 1, line - 1))]);
		if (at < 0) return 0;
		const region = _rapierMarkdownRangeBlockIndices(at, at);
		return region ? region.first : -1;
	};
	const blocksOfAddedRow = row => {
		const text = String(row.text == null ? '' : row.text);
		if (Number.isInteger(row.afterFrom) && row.afterFrom >= 0) {
			const start = _rapierBodyOffsetOfCanonical(row.afterFrom);
			const end = _rapierBodyOffsetOfCanonical(row.afterFrom + text.length);
			if (end < 0) return null;
			return _rapierMarkdownRangeBlockIndices(Math.max(0, start), end);
		}
		const index = blockIndexOfLine(row.newLine);
		return index < 0 ? null : {first: index, last: index};
	};
	const raw = new Map();
	for (const hunk of result.hunks) {
		const rows = hunk.rows.filter(row => !['context', 'meta', 'omitted'].includes(row.type));
		if (!rows.length) continue;
		const touched = new Set();
		let added = false;
		for (const row of rows) {
			if (row.type !== 'add' || row.newLine == null) continue;
			const region = blocksOfAddedRow(row);
			if (!region) continue;
			added = true;
			for (let at = region.first; at <= region.last; at++) touched.add(at);
		}
		if (!added) touched.add(blockIndexOfLine(_rapierSinceOpenAnchorLine(hunk)));
		const change = rows.map(row => row.type + '\u0000' + String(row.text == null ? '' : row.text) + String(row.lineBreak || '')).join('\n');
		for (const at of touched) {
			if (at < 0 || at >= wrappers.length) continue;
			const id = wrappers[at].dataset.blockId;
			if (!id) continue;
			raw.set(id, raw.has(id) ? raw.get(id) + '\n' + change : change);
			if (added) wrappers[at].dataset.seenUnit = id;
		}
	}
	const units = new Map();
	for (const [id, change] of raw) units.set(id, _rapierSeenDigest(change));
	_rapierSinceOpen.units = units;
	_rapierSeenObserve();
}
async function _rapierSinceOpenProject() {
	const baseline = rapier.review.seen;
	const baselineText = _rapierReviewText(baseline);
	if (baselineText == null) { _rapierSinceOpenClose(); return; }
	const current = _rapierGetCanonicalText();
	_rapierSinceOpen.units = null;
	const jobId = ++_rapierSinceOpen.jobId;
	_rapierSinceOpen.text = current;
	_rapierSinceOpen.revision = Number(rapier.revision.settled || 0);
	const request = { type: 'compare', jobId,
		currentName: baseline.name, incomingName: String(rapier.document.filename || 'document'),
		currentText: baselineText, incomingText: current,
		from: globalThis.RapierJournalRecords.journalOperations(baselineText, current, rapier.undo.ledger),
		docKind: rapier.document.docKind, language: rapier.document.codeLang || '' };
	if (_rapierSinceOpen.timer) clearTimeout(_rapierSinceOpen.timer);
	_rapierSinceOpen.timer = null;
	const finish = result => {
		if (jobId !== _rapierSinceOpen.jobId) return;
		if (_rapierSinceOpen.timer) clearTimeout(_rapierSinceOpen.timer);
		_rapierSinceOpen.timer = null;
		_rapierSinceOpenRender(result);
	};
	const coarse = () => {
		if (jobId !== _rapierSinceOpen.jobId) return;
		if (_rapierSinceOpen.worker) _rapierSinceOpen.worker.terminate();
		_rapierSinceOpen.worker = null;
		finish(_rapierCompareWorkerMain(request));
	};
	const admission = _rapierCompareAdmission(baselineText, current);
	const onPage = () => _rapierCompareOnPage(() => jobId === _rapierSinceOpen.jobId, request, finish);
	if (admission.same) {
		finish({ status: 'same', oldCount: admission.oldCount, newCount: admission.newCount, additions: 0, deletions: 0,
			diff: {edits: [], changes: []}, hunks: [], items: [] });
		return;
	}
	_rapierSinceOpen.timer = setTimeout(coarse, _RAPIER_COMPARE_TIMEOUT_MS);
	if (!_rapierSinceOpen.worker) {
		let worker;
		try { worker = await _rapierCompareTakeWorker(); }
		catch (_) { onPage(); return; }
		if (jobId !== _rapierSinceOpen.jobId || !_rapierSinceOpen.timer) { _rapierCompareGiveWorker(worker); return; }
		_rapierSinceOpen.worker = worker;
	}
	let answered = false;
	const worker = _rapierSinceOpen.worker;
	worker.onmessage = event => {
		answered = true;
		const result = event.data || {};
		if (result.jobId !== 'since:' + jobId) return;
		if (_rapierSinceOpen.worker === worker) _rapierSinceOpen.worker = null;
		_rapierCompareGiveWorker(worker);
		finish(result);
	};
	worker.onerror = () => {
		if (answered) { coarse(); return; }
		worker.terminate();
		if (_rapierSinceOpen.worker === worker) _rapierSinceOpen.worker = null;
		onPage();
	};
	worker.postMessage({ ...request, jobId: 'since:' + jobId });
}
function _rapierSinceOpenRefresh() {
	if (!_rapierSinceOpenWanted()) return;
	if (!_rapierSinceOpenAvailable()) { _rapierSinceOpenClose(); return; }
	if (_rapierSinceOpen.refreshTimer) clearTimeout(_rapierSinceOpen.refreshTimer);
	_rapierSinceOpen.refreshTimer = setTimeout(() => {
		_rapierSinceOpen.refreshTimer = 0;
		if (!_rapierSinceOpenWanted()) return;
		if (!_rapierSinceOpenAvailable()) { _rapierSinceOpenClose(); return; }
		if (_rapierMutationBarrierActive() || rapier.composition.block || rapier.composition.source ||
				!_rapierHistoryIsComplete()) return;
		_rapierSinceOpenProject();
	}, _RAPIER_SINCE_OPEN_REFRESH_MS);
}
const _RAPIER_SEEN_DWELL_MS = 1000;
const _RAPIER_SEEN_LEDGER_LIMIT = 4096;
const _RAPIER_SEEN_UNNAMED = '';
function _rapierSeenDigest(text) { return _rapierSpliceHash(String(text == null ? '' : text)); }
function _rapierSeenBound(ledger) {
	while (ledger.size > _RAPIER_SEEN_LEDGER_LIMIT) ledger.delete(ledger.keys().next().value);
}
function _rapierSeenSpend() {
	rapier.review.moved.clear();
	rapier.review.shown.clear();
	rapier.review.decided = null;
}
function _rapierSeenWitnessBlocks(ids, digest) {
	for (const id of ids) {
		rapier.review.moved.delete(String(id));
		rapier.review.shown.delete(String(id));
		rapier.review.shown.set(String(id), { digest: digest == null ? null : String(digest), at: Date.now() });
	}
	_rapierSeenBound(rapier.review.shown);
	globalThis.RapierAgentBrowser?.contextChanged('review');
}
function _rapierSeenHandSaw(ids) {
	const root = document.getElementById('editor-blocks');
	const view = root && root.getBoundingClientRect();
	if (!view || view.height <= 0) return true;
	return ids.every(id => {
		const wrapper = _rapierBlockWrapperById(id, root);
		if (!wrapper) return false;
		const shown = _rapierSeenShown(wrapper, view);
		return _rapierSeenWhole([[shown.lo, shown.hi]], shown.height);
	});
}
function _rapierSeenRecordTransaction(transaction) {
	globalThis.RapierChanges?.schedule();
	const ids = (transaction.affectedBlockIds || []).map(String);
	const decided = rapier.review.decided;
	rapier.review.decided = null;
	if (transaction.actor.kind === 'human') {

		if (_rapierSeenHandSaw(ids)) _rapierSeenWitnessBlocks(ids, null);
		return;
	}

	const admitted = decided ? ids.filter(id => decided.includes(id)) : [];
	if (admitted.length) _rapierSeenWitnessBlocks(admitted, null);
	const owner = Object.freeze({
		actor: transaction.actor,
		transport: transaction.transport === 'webmcp' ? 'webmcp' : 'platform',
	});
	if (ids.length) {
		for (const id of ids) {
			if (admitted.includes(id)) continue;
			rapier.review.shown.delete(id);
			rapier.review.moved.delete(id);
			rapier.review.moved.set(id, owner);
		}
		_rapierSeenBound(rapier.review.moved);
	} else {
		rapier.review.moved.set(_RAPIER_SEEN_UNNAMED, owner);
	}

	_rapierSinceOpenRefresh();
	if (transaction.actor.kind === 'agent') srAnnounce('Agent changed the document.');
}
function _rapierSeenUndelivered(scope = null) {
	if (!_rapierSinceOpenAvailable()) return null;
	const units = _rapierSinceOpen.units;

	if (!units) {
		if (!scope || (rapier.review.seen && rapier.review.seen.restored)) return null;
		for (const owner of rapier.review.moved.values()) {
			if (_rapierScopeOwns(scope, owner.actor, owner.transport)) return null;
		}
		return 0;
	}
	let count = 0;
	for (const [id, digest] of units) {
		const witness = rapier.review.shown.get(id);
		if (witness && (witness.digest === null || witness.digest === digest)) continue;
		if (scope) {

			const owner = rapier.review.moved.get(id);

			if (!owner) { if (rapier.review.seen && rapier.review.seen.restored) return null; continue; }
			if (!_rapierScopeOwns(scope, owner.actor, owner.transport)) continue;
		}
		count++;
	}
	return count;
}
function _rapierSeenAwaiting() {
	if (!rapier.review.moved.size) return false;
	const count = _rapierSeenUndelivered();
	return count == null ? true : count > 0;
}
const _rapierSeenDelivery = Object.seal({
	observer: null, watched: new Map(), timer: 0, moved: false, hands: null,
});
function _rapierSeenDrop() {
	for (const cover of _rapierSeenDelivery.watched.values()) cover.since = 0;
	clearTimeout(_rapierSeenDelivery.timer);
	_rapierSeenDelivery.timer = 0;
}
function _rapierSeenViewMovedByAgent() {
	_rapierSeenDelivery.moved = true;
	_rapierSeenDrop();
}
function _rapierSeenShown(element, view) {
	const box = element.getBoundingClientRect();
	return {
		lo: Math.max(box.top, view.top) - box.top,
		hi: Math.min(box.bottom, view.bottom) - box.top,
		height: box.height,
	};
}
const _RAPIER_SEEN_EDGE_PX = 1;
function _rapierSeenWhole(spans, height) {
	return spans.some(span => span[0] <= _RAPIER_SEEN_EDGE_PX &&
		span[1] >= height - _RAPIER_SEEN_EDGE_PX);
}
function _rapierSeenHeld(cover, lo, hi) {
	cover.held = cover.held.concat([[lo, hi]]).sort((a, b) => a[0] - b[0])
		.reduce((held, span) => {
			const last = held[held.length - 1];
			if (last && span[0] <= last[1] + _RAPIER_SEEN_EDGE_PX) last[1] = Math.max(last[1], span[1]);
			else held.push(span.slice());
			return held;
		}, []);
}
function _rapierSeenPending(unit) {
	const units = _rapierSinceOpen.units;
	if (!units || !units.has(unit)) return false;
	const witness = rapier.review.shown.get(unit);
	return !witness || (witness.digest !== null && witness.digest !== units.get(unit));
}
function _rapierSeenSweep() {
	const root = document.getElementById('editor-blocks');
	if (!root) return;
	clearTimeout(_rapierSeenDelivery.timer);
	_rapierSeenDelivery.timer = 0;

	if (document.documentElement.classList.contains('rapier-engine-modal-locked') ||
			_rapierSeenDelivery.moved) { _rapierSeenDrop(); return; }
	let view, now;
	const whole = new Map();
	let wait = 0;
	for (const [element, cover] of _rapierSeenDelivery.watched) {
		const unit = element.dataset.seenUnit;
		if (!element.isConnected || !_rapierSeenPending(unit)) { cover.since = 0; continue; }
		if (!view) { view = root.getBoundingClientRect(); now = _rapierNow(); }
		const shown = _rapierSeenShown(element, view);
		const digest = _rapierSinceOpen.units.get(unit);

		if (cover.digest !== digest || cover.height !== shown.height) {
			cover.digest = digest;
			cover.height = shown.height;
			cover.held = [];
			cover.since = 0;
		}
		if (shown.hi > shown.lo) {
			const lo = Math.max(cover.lo, shown.lo);
			const hi = Math.min(cover.hi, shown.hi);
			if (cover.since && hi > lo) { cover.lo = lo; cover.hi = hi; }
			else { cover.lo = shown.lo; cover.hi = shown.hi; cover.since = now; }
			if (now - cover.since >= _RAPIER_SEEN_DWELL_MS) {
				_rapierSeenHeld(cover, cover.lo, cover.hi);
				cover.lo = shown.lo;
				cover.hi = shown.hi;
				cover.since = now;
			}
		} else {
			cover.since = 0;
		}
		if (_rapierSeenWhole(cover.held, cover.height)) {
			if (!whole.has(unit)) whole.set(unit, true);
			continue;
		}
		whole.set(unit, false);
		if (cover.since) {
			const left = cover.since + _RAPIER_SEEN_DWELL_MS - now;
			wait = wait ? Math.min(wait, left) : left;
		}
	}
	for (const [unit, covered] of whole) if (covered) _rapierSeenDeliver(unit);
	if (wait > 0) _rapierSeenDelivery.timer = setTimeout(_rapierSeenSweep, wait);
}
function _rapierSeenDeliver(unit) {
	if (!_rapierSeenPending(unit)) return false;
	rapier.review.moved.delete(unit);
	rapier.review.shown.delete(unit);
	rapier.review.shown.set(unit, { digest: _rapierSinceOpen.units.get(unit), at: _rapierNow() });
	_rapierSeenBound(rapier.review.shown);
	_rapierAgentBarRender();
	globalThis.RapierAgentBrowser?.contextChanged('review');
	return true;
}
function _rapierSeenObserve() {
	const host = document.getElementById('editor-blocks');
	if (!host) return;
	if (_rapierSeenDelivery.observer && _rapierSeenDelivery.observer.root !== host) {
		_rapierSeenDelivery.observer.disconnect();
		_rapierSeenDelivery.observer = null;
	}
	if (!_rapierSeenDelivery.observer) {
		_rapierSeenDelivery.observer = new IntersectionObserver(_rapierSeenSweep,
			{ root: host, threshold: [0, 0.5] });
	}
	if (!_rapierSeenDelivery.hands) {

		const acted = event => {
			if (event.isTrusted !== true) return;
			_rapierSeenDelivery.moved = false;
			_rapierSeenSweep();
		};
		const options = { capture: true, passive: true };

		const kinds = ['pointerdown', 'wheel', 'keydown', 'touchstart'];
		for (const kind of kinds) window.addEventListener(kind, acted, options);
		_rapierSeenDelivery.hands = () => {
			for (const kind of kinds) window.removeEventListener(kind, acted, options);
		};
	}
	_rapierSeenDelivery.observer.disconnect();

	const previous = _rapierSeenDelivery.watched;
	_rapierSeenDelivery.watched = new Map();
	for (const element of host.querySelectorAll(':scope > [data-seen-unit], :scope > .block-sleep-group > [data-seen-unit]')) {
		_rapierSeenDelivery.watched.set(element, previous.get(element) ||
			{ digest: null, height: 0, held: [], lo: 0, hi: 0, since: 0 });
		_rapierSeenDelivery.observer.observe(element);
	}
	_rapierSeenSweep();
}
function _rapierSeenRelease() {
	if (_rapierSeenDelivery.observer) _rapierSeenDelivery.observer.disconnect();
	if (_rapierSeenDelivery.hands) { _rapierSeenDelivery.hands(); _rapierSeenDelivery.hands = null; }
	_rapierSeenDelivery.moved = false;
	_rapierSeenDrop();
	_rapierSeenDelivery.watched.clear();
}
