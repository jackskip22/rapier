
function rapierSetFindOpen(open) {
	rapier.find.open = !!open;
	if (rapier.find.open) hideFormatToolbar();
	_rapierScheduleRestoreCursor(300);
	const input = document.getElementById('find-input');
	if (!input) return;
	if (!rapier.find.open) { input._rapierFindWarm = null; return; }
	const warm = () => {
		if (!rapier.find.open || !md || rapier.view.mode === 'source' || rapier.document.docKind !== 'markdown' ||
				_rapierFindOwnsCurrentDocument()) return;
		try {
			const source = _rapierGetCanonicalText();
			if (source.length >= 262144) return;
			input._rapierFindWarm = _rapierVisibleSourceProjection(source, md, input._rapierFindWarm);
		}
		catch (_) { input._rapierFindWarm = null; }
	};
	if (typeof requestIdleCallback === 'function') requestIdleCallback(warm, { timeout: 1000 });
	else setTimeout(warm, 200);
}

function _setFindCount(cur, total) {
	const el = document.getElementById('find-count');
	if (!el) return;
	const label = total === 0 || total === '0' ? 'No matches' : 'Match ' + cur + ' of ' + total;
	if (el.getAttribute('aria-label') === label) return;
	el.setAttribute('aria-label', label);
	el.innerHTML =
		'<span class="find-count__cur">' + cur + '</span>' +
		'<span class="find-count__sep">/</span>' +
		'<span class="find-count__tot">' + total + '</span>';
}

function _rapierFindTotalLabel() {
	return String(rapier.find.ranges.length) + (rapier.find.overflow ? '+' : '');
}

function _findCurrentRange() {
	if (!_rapierFindOwnsCurrentDocument()) return null;
	const match = rapier.find.ranges[rapier.find.current];
	const editor = document.getElementById('editor-blocks');
	if (!editor) return null;
	if (match?.surface !== 'picture' && match?.blockId != null)
		_rapierRefreshFindBlockProjection(_rapierWysiwygLedger.entries.get(String(match.blockId))?.wrapper);
	const range = match?.surface === 'picture' ? _rapierPictureFind.range(match) : match && match.range;
	if (!(range instanceof Range) || range.collapsed) return null;
	const start = range.startContainer;
	return start === editor || editor.contains(start) ? range : null;
}

function _rapierSyncFindHighlights() {
	if (!CSS.highlights) return;
	const host = document.getElementById('editor-blocks');
	const live = range => range instanceof Range && !range.collapsed &&
		host?.contains(range.startContainer) && host.contains(range.endContainer);
	const ranges = rapier.find.ranges.filter(record => record.surface !== 'picture')
		.map(record => record.range).filter(live);
	if (ranges.length) CSS.highlights.set('rapier-find-all', new Highlight(...ranges));
	else CSS.highlights.delete('rapier-find-all');
	const current = rapier.find.ranges[rapier.find.current];
	if (current?.surface !== 'picture' && live(current?.range))
		CSS.highlights.set('rapier-find-current', new Highlight(current.range));
	else CSS.highlights.delete('rapier-find-current');
}

function _rapierRetireFindBlockProjection(wrapper) {
	const id = Number(wrapper?.dataset?.blockId);
	if (!Number.isSafeInteger(id)) return;
	_rapierFindRuntime.documentGuard?.projection?.blocks?.delete(id);
	for (const record of new Set([...rapier.find.ranges, ..._rapierFindRuntime.textRecords])) {
		if (record.surface !== 'picture' && Number(record.blockId) === id) record.range = null;
	}
	_rapierSyncFindHighlights();
}

function _rapierRefreshFindBlockProjection(wrapper, paint = true) {
	if (!_rapierFindOwnsCurrentDocument() || !wrapper?.isConnected || wrapper._rapierUnrendered) return;
	const id = Number(wrapper.dataset.blockId);
	const records = rapier.find.ranges.filter(record => record.surface !== 'picture' &&
		Number(record.blockId) === id && typeof record.shown === 'string');
	if (!records.length) return;
	const memo = _rapierFindRuntime.documentGuard.projection;
	const prior = memo?.blocks?.get(id);
	const projection = _rapierFindBlockProjection(id, prior);
	if (!projection) { _rapierRetireFindBlockProjection(wrapper); return; }
	if (prior === projection && records.every(record => record.range instanceof Range && !record.range.collapsed &&
		projection.root.contains(record.range.startContainer) && projection.root.contains(record.range.endContainer))) return;
	if (memo?.blocks) memo.blocks.set(id, projection);
	const occurrences = new Map();
	for (const record of records) {
		const key = record.shown;
		if (!occurrences.has(key)) occurrences.set(key, _rapierFindLiteralHits(projection.text, key, _RAPIER_FIND_MATCH_LIMIT).hits
			.filter(hit => projection.text.slice(hit.start, hit.end) === key));
		const hit = occurrences.get(key)[record.ordinal];
		record.range = hit ? _rapierFindProjectionRange(projection, hit.start, hit.end) : null;
	}
	if (paint) _rapierSyncFindHighlights();
}

function _findOverlayRoot() {
	let root = document.getElementById('rapier-find-overlay');
	if (root) return root;
	root = document.createElement('div');
	root.id = 'rapier-find-overlay';
	root.className = 'rapier-find-overlay';
	root.setAttribute('aria-hidden', 'true');
	document.body.appendChild(root);
	return root;
}

function _findClearFallbackMarkers(keep = null) {
	document.querySelectorAll('.block-wrapper.rapier-find-current-fallback')
		.forEach(element => { if (element !== keep) element.classList.remove('rapier-find-current-fallback'); });
}

function _findClearVisualOverlay(removeRoot) {
	if (_rapierFindRuntime.overlayFrame) cancelAnimationFrame(_rapierFindRuntime.overlayFrame);
	_rapierFindRuntime.overlayFrame = 0;
	_findClearFallbackMarkers();
	const root = document.getElementById('rapier-find-overlay');
	if (!root) return;
	if (root.firstChild) root.replaceChildren();
	if (removeRoot) root.remove();
}

function _findPaintCurrentOverlay() {
	_rapierFindRuntime.overlayFrame = 0;
	if (!_rapierFindOwnsCurrentDocument()) {
		_findClearVisualOverlay(false);
		return;
	}
	const range = _findCurrentRange();
	const editor = document.getElementById('editor-blocks');
	const root = _findOverlayRoot();
	if (!editor || editor.hidden || getComputedStyle(editor).display === 'none') { _findClearVisualOverlay(false); return; }

	const clip = editor.getBoundingClientRect();
	const frame = _rapierViewportFrame();
	const next = document.createDocumentFragment();
	_rapierPictureFind.paint(next, clip, frame);
	let fallback = null;
	if (range && rapier.find.ranges[rapier.find.current]?.surface !== 'picture') {
		const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
		let painted = false;
		for (const rect of rects) {
			const left = Math.max(rect.left, clip.left);
			const right = Math.min(rect.right, clip.right);
			const top = Math.max(rect.top, clip.top);
			const bottom = Math.min(rect.bottom, clip.bottom);
			if (right <= left || bottom <= top) continue;
			const mark = document.createElement('span');
			mark.className = 'rapier-find-current-mark';
			mark.style.left = (left - frame.originX).toFixed(2) + 'px';
			mark.style.top = top.toFixed(2) + 'px';
			mark.style.width = (right - left).toFixed(2) + 'px';
			mark.style.height = (bottom - top).toFixed(2) + 'px';
			next.appendChild(mark);
			painted = true;
		}

		if (!painted) {
			const node = range.startContainer.nodeType === Node.ELEMENT_NODE
				? range.startContainer : range.startContainer.parentElement;
			fallback = node?.closest?.('.block-wrapper');
		}
	}
	_findClearFallbackMarkers(fallback);
	fallback?.classList.toggle('rapier-find-current-fallback', true);
	const current = [...root.childNodes];
	if (current.length !== next.childNodes.length || current.some((node, index) => !node.isEqualNode(next.childNodes[index]))) root.replaceChildren(next);
}

function _findScheduleOverlay() {
	if (_rapierFindRuntime.overlayFrame) return;
	_rapierFindRuntime.overlayFrame = requestAnimationFrame(_findPaintCurrentOverlay);
}

function _findRefreshOverlayGeometry() {
	_findScheduleOverlay();
	_findNudgeStableReveal();
}

function _findBindOverlayGeometry() {
	if (_rapierFindRuntime.overlayBound) return;
	_rapierFindRuntime.overlayBound = true;
	const editor = document.getElementById('editor-blocks');
	editor?.addEventListener('scroll', _findScheduleOverlay, { capture: true, passive: true });
	editor?.addEventListener('pointerdown', _findCancelStableReveal, { passive: true });
	editor?.addEventListener('wheel', _findCancelStableReveal, { passive: true });
	window.addEventListener('resize', _findRefreshOverlayGeometry, { passive: true });
	window.visualViewport?.addEventListener('resize', _findRefreshOverlayGeometry, { passive: true });
	window.visualViewport?.addEventListener('scroll', _findRefreshOverlayGeometry, { passive: true });
}

const _rapierFindRuntime = Object.seal({
	overlayFrame: 0, overlayBound: false,
	revealEpoch: 0, revealDeadline: 0, revealFrame: 0, revealTimers: [],
	documentGuard: null, textRecords: [], textOverflow: false, job: null,
	createWorker: () => _rapierCreateSourceWorker('rapier-source'),

});

function _rapierFindOwnsCurrentDocument() {
	const guard = _rapierFindRuntime.documentGuard;
	return !!guard && _rapierMutationStampIsCurrent(guard) &&
		guard.mode === String(rapier.view.mode || '') &&
		guard.docKind === String(rapier.document.docKind || '');
}

function _findCancelStableReveal() {
	_rapierFindRuntime.revealEpoch++;
	_rapierFindRuntime.revealDeadline = 0;
	if (_rapierFindRuntime.revealFrame) cancelAnimationFrame(_rapierFindRuntime.revealFrame);
	_rapierFindRuntime.revealFrame = 0;
	_rapierFindRuntime.revealTimers.forEach(clearTimeout);
	_rapierFindRuntime.revealTimers = [];
}

function _findRevealCurrent(epoch) {
	if (epoch !== _rapierFindRuntime.revealEpoch || !_rapierFindOwnsCurrentDocument() ||
			!rapier.find.ranges.length) return;
	const match = rapier.find.ranges[rapier.find.current];
	if (match && match.surface === 'source') {
		_rapierFlatSelectAndReveal(match.start, match.end, true);
		return;
	}
	if (match?.surface === 'picture') {
		const range = _rapierPictureFind.range(match, true);
		if (range) {
			_findRevealRange(range, _rapierPictureFind.geometry(match));
			_rapierPictureFind.reveal(match);
		}
		_rapierEmbeddedImages.schedule();
		return;
	}
	const range = _findCurrentRange();
	if (range) { _findRevealRange(range); return; }

	if (match && match.blockId != null) {
		_rapierRevealSectionForWrapper(
			_rapierWysiwygLedger.entries.get(String(match.blockId))?.wrapper);
	}
}

function _findStartStableReveal() {
	_findCancelStableReveal();
	const epoch = _rapierFindRuntime.revealEpoch;

	_rapierFindRuntime.revealDeadline = _rapierNow() + 1400;
	_findRevealCurrent(epoch);
	queueMicrotask(() => _findRevealCurrent(epoch));
	_rapierFindRuntime.revealFrame = requestAnimationFrame(() => {
		_rapierFindRuntime.revealFrame = requestAnimationFrame(() => {
			_rapierFindRuntime.revealFrame = 0;
			_findRevealCurrent(epoch);
		});
	});
	[60, 140, 280, 500, 800, 1150, 1380].forEach(delay => {
		_rapierFindRuntime.revealTimers.push(setTimeout(() => _findRevealCurrent(epoch), delay));
	});
}

function _findNudgeStableReveal() {
	if (!_rapierFindRuntime.revealDeadline || _rapierNow() > _rapierFindRuntime.revealDeadline || !rapier.find.ranges.length) return;
	const epoch = _rapierFindRuntime.revealEpoch;
	if (_rapierFindRuntime.revealFrame) return;
	_rapierFindRuntime.revealFrame = requestAnimationFrame(() => {
		_rapierFindRuntime.revealFrame = 0;
		_findRevealCurrent(epoch);
	});
}

function _findRevealRange(range, pictureRect = null) {
	const editor = document.getElementById('editor-blocks');
	if (!editor || !range) return;
	const node = range.startContainer.nodeType === Node.ELEMENT_NODE
		? range.startContainer : range.startContainer.parentElement;

	let concealedDetails = node?.closest?.('details:not([open])') || null;
	while (concealedDetails && editor.contains(concealedDetails)) {
		concealedDetails.open = true;
		concealedDetails = concealedDetails.parentElement?.closest?.('details:not([open])') || null;
	}
	const wrapper = node?.closest?.('.block-wrapper');
	_rapierRevealSectionForWrapper(wrapper);
	const editorRect = editor.getBoundingClientRect();
	const rect = pictureRect?.width && pictureRect?.height ? pictureRect : range.getBoundingClientRect();
	const targetRect = rect.width || rect.height ? rect : wrapper?.getBoundingClientRect();
	if (targetRect && (targetRect.width || targetRect.height)) {
		const height = editor.clientHeight;
		const target = editor.scrollTop + targetRect.top - editorRect.top -
			Math.max(0, (height - Math.min(targetRect.height, height)) / 2);
		editor.scrollTop = Math.max(0, target);
	} else if (wrapper) {
		wrapper.scrollIntoView({ block: 'center', behavior: 'auto' });
	}
	_findScheduleOverlay();
	requestAnimationFrame(_findScheduleOverlay);
}

function _rapierFindBlockProjection(blockId, prior = null) {
	const wrapper = _rapierWysiwygLedger.entries.get(String(blockId))?.wrapper;
	if (!wrapper?.isConnected || wrapper._rapierUnrendered) return null;
	const el = wrapper.querySelector('.block-edit') || wrapper.querySelector('.block-read');
	if (!el) return null;
	const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
		acceptNode(node) {
			const parent = node.parentElement;
			return parent?.closest?.('.table-edit-controls,.block-edit-button,.table-tools')
				? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
		}
	});
	if (prior && prior.root === el) {
		let index = 0, same = true, current;
		while ((current = walker.nextNode())) {
			if (!current.data.length) continue;
			const kept = prior.nodes[index++];
			if (!kept || kept.node !== current || kept.text !== current.data) { same = false; break; }
		}
		if (same && index === prior.nodes.length) return prior;
		walker.currentNode = el;
	}
	const nodes = [];
	const parts = [];
	let cursor = 0;
	let node;
	while ((node = walker.nextNode())) {
		const length = node.textContent.length;
		if (!length) continue;
		nodes.push({ node, start: cursor, end: cursor + length, text: node.textContent });
		parts.push(node.textContent);
		cursor += length;
	}
	return nodes.length ? { text: parts.join(''), nodes, root: el } : null;
}

function _rapierFindProjectionRange(projection, start, end) {
	const locate = offset => {
		let lo = 0, hi = projection.nodes.length - 1;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			const entry = projection.nodes[mid];
			if (offset < entry.start) hi = mid - 1;
			else if (offset >= entry.end) lo = mid + 1;
			else return { node: entry.node, local: offset - entry.start };
		}
		const last = projection.nodes[projection.nodes.length - 1];
		return last ? { node: last.node, local: last.node.textContent.length } : null;
	};
	const from = locate(start);
	const to = locate(end - 1);
	if (!from || !to) return null;
	try {
		const range = new Range();
		range.setStart(from.node, from.local);
		range.setEnd(to.node, Math.min(to.local + 1, to.node.textContent.length));
		return range;
	} catch (_) { return null; }
}

function _rapierFindIndexHits(source, query, surface = 'rendered', memo = null, prepared = null) {
	const visible = prepared ? prepared.visible : surface === 'source' ? null : _rapierVisibleSourceProjection(source, md, memo?.visible);
	if (memo && memo.visible !== visible) {
		memo.visible = visible;
		memo.spans = null;
		memo.blocks = new Map();
	}
	const hidden = visible?.hidden || null;
	const read = prepared ? null : visible?.read || null;
	const result = prepared || (read ? _rapierFindFlexibleSeparatorHits(read.text, query, _RAPIER_FIND_MATCH_LIMIT, read.hidden)
		: _rapierFindFlexibleSeparatorHits(source, query, _RAPIER_FIND_MATCH_LIMIT, hidden));
	const found = prepared ? prepared.hits : read ? result.hits.map(read.hit) : result.hits;

	if (surface === 'source') {
		return {
			records: found.map(hit => ({
				start: hit.start, end: hit.end, blockId: null, surface: 'source', range: null,
			})),
			overflow: result.overflow,
			flexible: !!result.flexible,
		};
	}
	const spans = memo?.spans || _rapierCurrentBodyBlockSpans();
	if (memo) memo.spans = spans;
	const ordinals = prepared?.maps.ordinals || new Map();
	const records = found.map(hit => {
		const bodyStart = _rapierBodyOffsetOfCanonical(hit.start);
		const bodyEnd = _rapierBodyOffsetOfCanonical(hit.end);
		let index = -1;
		if (bodyStart >= 0 && spans.length) {
			let lo = 0, hi = spans.length - 1;
			while (lo <= hi) {
				const mid = (lo + hi) >> 1;
				if (bodyEnd <= spans[mid].start) hi = mid - 1;
				else if (bodyStart >= spans[mid].end) lo = mid + 1;
				else { index = mid; break; }
			}
			if (index >= 0 && (bodyStart < spans[index].start || bodyEnd > spans[index].end)) index = -1;
		}
		const blockId = index >= 0 ? spans[index].id : null;
		const record = { start: hit.start, end: hit.end, blockId, surface: 'rendered', range: null };
		if (blockId == null) return record;
		const literal = hit.shown ?? source.slice(hit.start, hit.end);
		const key = blockId + '\u0000' + literal;
		const ordinal = ordinals.get(key) || 0;
		ordinals.set(key, ordinal + 1);
		record.shown = literal;
		record.ordinal = ordinal;
		return record;
	});
	return { records, overflow: result.overflow, flexible: !!result.flexible };
}

function rapierFindRun() {
	const input = document.getElementById('find-input');
	const query = input.value;
	const warm = input._rapierFindWarm;
	const projection = _rapierFindOwnsCurrentDocument() ? _rapierFindRuntime.documentGuard.projection
		: warm && rapier.view.mode !== 'source' && rapier.document.docKind === 'markdown'
			? { visible: warm, spans: null, blocks: new Map() } : {};
	rapierFindClear(query ? projection : null);
	_setFindCount(0, 0);
	if (!query) return;
	rapier.find.query = query;
	const guard = _rapierFindRuntime.documentGuard = Object.freeze({
		..._rapierMutationStamp(),
		mode: String(rapier.view.mode || ''),
		docKind: String(rapier.document.docKind || ''),
		projection,
	});
	const surface = rapier.view.mode === 'source' || rapier.document.docKind !== 'markdown' ? 'source' : 'rendered';
	if (surface === 'source' && !document.getElementById('source-textarea')) return;
	const source = surface === 'source' ? _rapierSourceText() : _rapierGetCanonicalText();
	const current = () => _rapierFindRuntime.documentGuard === guard && _rapierFindOwnsCurrentDocument() &&
		document.getElementById('find-input')?.value === query;
	const publish = indexed => {
		if (!current()) return false;
		let combined = indexed;
		if (surface === 'rendered') {
			_rapierFindRuntime.textRecords = indexed.records;
			_rapierFindRuntime.textOverflow = indexed.overflow;
			combined = _rapierPictureFind.merge(indexed.records, query, indexed.overflow);
		}
		rapier.find.overflow = combined.overflow;
		rapier.find.flexible = indexed.flexible;
		rapier.find.ranges = combined.records;
		rapier.find.current = 0;
		if (combined.records.length) {
			if (surface === 'source') _findStartStableReveal();
			else {
				const first = combined.records[0];
				if (first.blockId != null) _rapierWysiwygWake(_rapierWysiwygLedger.entries.get(String(first.blockId))?.wrapper);
				for (const id of new Set(combined.records.filter(record => record.surface !== 'picture' && record.blockId != null)
					.map(record => record.blockId))) {
					_rapierRefreshFindBlockProjection(_rapierWysiwygLedger.entries.get(String(id))?.wrapper, false);
				}
				_rapierSyncFindHighlights();
				_findHighlightCurrent(true);
			}
		}
		_setFindCount(combined.records.length ? 1 : 0, _rapierFindTotalLabel());
		if (surface === 'rendered') {
			_rapierPictureFind.schedule();
			_findBindOverlayGeometry();
			_findScheduleOverlay();
		}
		_rapierScheduleRestoreCursor(320);
		return true;
	};
	if (source.length < 262144) return publish(_rapierFindIndexHits(source, query, surface, projection));
	const task = _rapierProgressTask({label: 'Finding', current});
	_rapierFindRuntime.job = task;
	return (async () => {
		try {
			await task.yield(0);
			const prepared = await globalThis.RapierSourceWorker.sourceFindIndex(source, query, surface, projection, task,
				{parser: md, limit: _RAPIER_FIND_MATCH_LIMIT, createWorker: _rapierFindRuntime.createWorker, now: _rapierNow});
			await task.yield(.75);
			const records = [];
			let started = _rapierNow();
			for (let at = 0; at < prepared.hits.length; at++) {
				const indexed = _rapierFindIndexHits(source, query, surface, projection,
					{...prepared, hits: [prepared.hits[at]]});
				records.push(...indexed.records);
				if (_rapierNow() - started >= 8) {
					await task.yield(.75 + .24 * (at + 1) / prepared.hits.length);
					started = _rapierNow();
				}
			}
			await task.yield(1);
			return publish({...prepared, records});
		} catch (error) {
			if (error?.name !== 'AbortError') {
				console.warn('[rapier] Find failed', error);
				showToast('Could not finish finding', 'error');
			}
			return false;
		} finally {
			if (_rapierFindRuntime.job === task) _rapierFindRuntime.job = null;
			task.end();
		}
	})();
}

function rapierFindStep(dir) {
	if (!_rapierFindOwnsCurrentDocument()) { rapierFindRun(); return; }
	if (!rapier.find.ranges.length) return;
	const next = (rapier.find.current + dir + rapier.find.ranges.length) % rapier.find.ranges.length;
	const match = rapier.find.ranges[next];
	rapier.find.current = next;
	if (match && match.surface === 'source') {
		const srcTA = document.getElementById('source-textarea');
		if (srcTA) {
			srcTA.focus();
			_rapierFlatSelectAndReveal(match.start, match.end, true);
		}
		_setFindCount(rapier.find.current + 1, _rapierFindTotalLabel());
		_rapierScheduleRestoreCursor(260);
		return;
	}
	if (match && match.blockId != null) _rapierWysiwygWake(_rapierWysiwygLedger.entries.get(String(match.blockId))?.wrapper);
	if (_findCurrentRange() || match?.surface === 'picture') _findHighlightCurrent(false);
	else _findRevealCurrent(_rapierFindRuntime.revealEpoch);
	_setFindCount(rapier.find.current + 1, _rapierFindTotalLabel());
	_rapierScheduleRestoreCursor(260);
}

function _findHighlightCurrent(stabilize) {
	const match = rapier.find.ranges[rapier.find.current];
	if (match?.surface === 'picture') {
		if (CSS.highlights) CSS.highlights.delete('rapier-find-current');
		_findBindOverlayGeometry();
		if (stabilize) _findStartStableReveal();
		else { _findCancelStableReveal(); _findRevealCurrent(_rapierFindRuntime.revealEpoch); }
		_findScheduleOverlay();
		return;
	}
	const range = _findCurrentRange();
	if (!range) return;
	if (CSS.highlights) CSS.highlights.set('rapier-find-current', new Highlight(range));
	_findBindOverlayGeometry();
	if (stabilize) _findStartStableReveal();
	else {
		_findCancelStableReveal();
		_findRevealRange(range);
	}
}

function rapierFindClear(keepProjection = null) {
	const projection = _rapierFindRuntime.documentGuard?.projection;
	if (projection !== keepProjection) projection?.worker?.dispose();
	_rapierFindRuntime.job?.cancel();
	_rapierFindRuntime.job = null;
	_findCancelStableReveal();
	_rapierFindRuntime.documentGuard = null;
	_rapierFindRuntime.textRecords = [];
	_rapierFindRuntime.textOverflow = false;
	rapier.find.ranges = [];
	rapier.find.current = 0;
	rapier.find.overflow = false;
	rapier.find.flexible = false;
	rapier.find.query = '';
	if (CSS.highlights) {
		CSS.highlights.delete('rapier-find-all');
		CSS.highlights.delete('rapier-find-current');
	}
	_findClearVisualOverlay(false);
	_rapierScheduleRestoreCursor(320);
}

function _rapierReplaceAllOccurrences(text, query, replacement, markdown = true, projection = null) {
	const source = String(text);
	const visible = markdown ? _rapierVisibleSourceProjection(source, md, projection) : null;
	const hidden = visible?.hidden || null;
	const read = visible?.read || null;
	const matches = read ? _rapierFindFlexibleSeparatorHits(read.text, query, Number.MAX_SAFE_INTEGER, read.hidden).hits.map(read.hit)
		: _rapierFindFlexibleSeparatorHits(source, query, Number.MAX_SAFE_INTEGER, hidden).hits;
	const plan = _rapierPlanVisibleReplacement(source, matches, replacement, markdown, md, visible);
	let value = '', cursor = 0;
	for (const splice of plan.splices) {
		value += source.slice(cursor, splice.pos) + splice.inserted;
		cursor = splice.pos + splice.removed.length;
	}
	return { value: value + source.slice(cursor), count: plan.splices.length, ...plan };
}

async function _rapierReplaceCanonicalText(beforeText, afterText, guard) {
	if (rapier.view.mode !== 'source') _leaveAllEditingBlocks();
	if (!_rapierMutationStampIsCurrent(guard) || guard.mode !== String(rapier.view.mode || '')) return false;
	const live = _rapierSourceText();
	if (live !== String(beforeText || '')) return false;
	const diff = _rapierPrefixSuffixDiff(String(beforeText || ''), String(afterText || ''));
	if (!diff.removed.length && !diff.inserted.length) return false;
	return !!await _rapierApplyCanonicalSplices([diff], {
		operation: 'document.replace-source-range',
		keepSourceMode: rapier.view.mode === 'source',
		selectionBefore: { start: diff.pos, end: diff.pos + diff.removed.length },
		selectionAfter: {
			start: diff.pos + diff.inserted.length,
			end: diff.pos + diff.inserted.length,
		},
	});
}

async function rapierReplaceAll(currentOnly = false) {
	if (_rapierUserMutationBlocked()) return;
	const findInput = document.getElementById('find-input');
	const replaceInput = document.getElementById('replace-input');
	const query = findInput ? findInput.value : '';
	const replacement = replaceInput ? replaceInput.value : '';
	if (!query) {
		showToast('enter text to find first', 'error');
		return;
	}

	if (!_rapierCommitPendingHistory()) return;

	const before = _rapierSourceText();
	const projection = _rapierFindOwnsCurrentDocument() ? _rapierFindRuntime.documentGuard.projection?.visible : null;

	let result;
	if (currentOnly) {
		if (!_rapierFindOwnsCurrentDocument()) { rapierFindRun(); return; }
		const match = rapier.find.ranges[rapier.find.current];
		const plan = _rapierPlanVisibleReplacement(before, match && match.surface !== 'picture' ? [match] : [], replacement, rapier.document.docKind === 'markdown', md, projection);
		const splice = plan.splices[0];
		result = { ...plan, count: plan.splices.length, value: splice ? before.slice(0, splice.pos) +
			splice.inserted + before.slice(splice.pos + splice.removed.length) : before };
	} else result = _rapierReplaceAllOccurrences(before, query, replacement, rapier.document.docKind === 'markdown', projection);
	if (!result.count || result.value === before) {
		showToast('no replacements', 'error');
		return;
	}

	const guard = Object.freeze({
		..._rapierMutationStamp(),
		mode: String(rapier.view.mode || ''),
	});

	if (rapier.document.docKind === 'markdown') {
		let replacement;
		try {
			replacement = await _rapierWithCompoundTransaction(
				{ operation: currentOnly ? 'document.replace-one' : 'document.replace-all' },
				async () => _rapierReplaceCanonicalText(before, result.value, guard),
			);
		} catch (error) {
			try { console.warn('[rapier] Replace All transaction failed', error); } catch (_) {}
			showToast('Replace all could not be applied safely', 'error');
			return;
		}
		if (!replacement.result) {
			showToast('Document changed; replace all was canceled', 'error');
			return;
		}
	} else {
		_rapierHeavyWindowReplaceAll(result.value);
	}

	rapierFindRun();
	showToast(result.count + (result.count === 1 ? ' replacement' : ' replacements'), 'success');
}

function rapierReplaceOne() { return rapierReplaceAll(true); }

function renderFindBar() {
	const refs = _rapierUi.refs;
	if (!refs) return;
	const locked = !!rapier.access.readOnly;
	const findUp = rapier.find.open && !rapier.compare.active;
	refs.findBar.hidden = !findUp;
	refs.replaceBar.hidden = !(findUp && _rapierUi.replaceOpen && !locked);
	refs.replaceToggle.hidden = locked;
	refs.replaceToggle.setAttribute('aria-expanded', _rapierUi.replaceOpen ? 'true' : 'false');
	refs.find.setAttribute('aria-expanded', rapier.find.open ? 'true' : 'false');
	if (rapier.find.open) refs.find.dataset.active = 'true'; else delete refs.find.dataset.active;
}

function renderFindQuery(query) {
	const refs = _rapierUi.refs;
	refs.findInput.value = query;
	if (!query) refs.replaceInput.value = '';
}

function _rapierUiSetFindOpen(open) {
	if (open && !_rapierEmbedFeatureAllowed('find')) return;
	const refs = _rapierUi.refs;
	const next = !!open;
	if (next === rapier.find.open) return;
	rapierSetFindOpen(next);
	if (next) {
		renderFindBar();
		refs.findInput.focus();
		return;
	}
	const focusWasInside = refs.findBar.contains(document.activeElement) ||
		refs.replaceBar.contains(document.activeElement);
	_rapierUi.replaceOpen = false;
	renderFindQuery('');
	renderFindBar();
	rapierFindClear();
	if (!focusWasInside || !refs.find.isConnected) return;
	try { refs.find.focus({ preventScroll: true }); } catch (_) { refs.find.focus(); }
}

function _rapierUiOpenReplace() {
	const refs = _rapierUi.refs, shown = rapier.find.open && _rapierUi.replaceOpen && !refs.replaceBar.hidden;
	_rapierUiSetFindOpen(true);
	_rapierUi.replaceOpen = true;
	renderFindBar();
	_findScheduleOverlay();
	(shown ? refs.replaceInput : refs.findInput).focus();
}

function _rapierUiRestoreFind(record) {
	const query = String(record && record.query || '');
	if (!query) return false;
	const targetIndex = Math.max(0, Number(record && record.current) || 0);
	_rapierUiSetFindOpen(true);
	renderFindQuery(query);
	const completed = rapierFindRun();
	if (targetIndex > 0) {
		const restore = () => { if (rapier.find.query === query && _rapierFindOwnsCurrentDocument()) rapierFindStep(targetIndex); };
		if (completed && typeof completed.then === 'function') completed.then(ok => { if (ok) restore(); });
		else restore();
	}
	return true;
}
