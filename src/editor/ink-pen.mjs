// SPDX-License-Identifier: AGPL-3.0-only
// The pen (docs/briefs/ink.md §4): with the pen down, or with a stylus, a drag over the page is a stroke; at the lift the
// stroke's kind is read once, its words are found, its path is stored, and the words take the pair through the engine's
// own exact-source door (_rapierApplyInk), so Undo takes it back in one step. A tap is a tap: it places the caret as
// ever. With the pen down two fingers scroll the page. The strip (#ink-strip) holds the colour, the eraser and done;
// Esc lifts the pen. Spliced into editor/engine.js at /* RAPIER_INK_PEN_MODULE */. Everything it needs comes in through
// _rapierInkPenInstall; its state lives on the host.

const _RAPIER_INK_PEN_SELECTOR = '[data-action="ink-pen"]';
const _RAPIER_INK_STRIP_ID = 'ink-strip';
const _RAPIER_INK_PEN_NOTICE = 'draw on the words. the marks stay with them. tap the pen again to stop.';
const _RAPIER_INK_ERASER_NOTICE = 'tap a mark to remove it.';

function _rapierInkPenState(host) {
	return host._rapierInkPen || (host._rapierInkPen = { installed: false, down: false, tool: 'pen', hex: '#b32034', stroke: null, live: null, pending: false, scroll: null, swallowClick: false, doors: null });
}

// doors: {spec, ink, draw, apply, erase, liveOf, dark, say, stylus}: the grammar, the geometry, the drawing module, the
// engine's apply and erase (over the selection), the live element of a block wrapper, the dark-page colour, the one-line
// notice, and whether a stylus inks with no button (a switch; on when absent).
function _rapierInkPenInstall(doors) {
	const host = _rapierInkHost();
	if (!host || !doors || !doors.spec || !doors.ink || !doors.draw || typeof doors.apply !== 'function') return;
	const state = _rapierInkPenState(host);
	state.doors = doors;
	if (state.installed) return;
	state.installed = true;
	host.addEventListener('pointerdown', _rapierInkPenDown, { capture: true });
	host.addEventListener('pointermove', _rapierInkPenMove, { capture: true });
	host.addEventListener('pointerup', _rapierInkPenUp, { capture: true });
	host.addEventListener('pointercancel', _rapierInkPenCancel, { capture: true });
	host.addEventListener('click', _rapierInkPenClick, { capture: true });
	// A stroke must not scroll the page: the first touch move under a stroke is kept (a tap never moves, so its click
	// still reaches the engine).
	host.addEventListener('touchmove', _rapierInkPenTouch, { capture: true, passive: false });
	document.addEventListener('keydown', _rapierInkPenKey, { capture: true });
	for (const button of document.querySelectorAll(_RAPIER_INK_PEN_SELECTOR)) button.addEventListener('click', _rapierInkPenToggle);
	const strip = document.getElementById(_RAPIER_INK_STRIP_ID);
	if (strip) strip.addEventListener('click', _rapierInkPenStrip);
}

function _rapierInkPenToggle() {
	const host = _rapierInkHost();
	if (host) _rapierInkPenSet(host, !_rapierInkPenState(host).down);
}

function _rapierInkPenSet(host, down) {
	const state = _rapierInkPenState(host);
	if (state.stroke) _rapierInkPenClear(host);
	state.down = !!down;
	if (!state.down) state.tool = 'pen';
	host.style.touchAction = state.down ? 'none' : '';
	if (state.down) host.setAttribute('data-rapier-pen', 'down'); else host.removeAttribute('data-rapier-pen');
	for (const button of document.querySelectorAll(_RAPIER_INK_PEN_SELECTOR)) button.setAttribute('aria-pressed', state.down ? 'true' : 'false');
	const strip = document.getElementById(_RAPIER_INK_STRIP_ID);
	if (strip) {
		strip.classList.toggle('visible', state.down);
		strip.setAttribute('aria-hidden', state.down ? 'false' : 'true');
		_rapierInkPenPaintStrip(strip, state);
	}
	if (state.down && state.doors && typeof state.doors.say === 'function') state.doors.say(_RAPIER_INK_PEN_NOTICE);
}

function _rapierInkPenPaintStrip(strip, state) {
	for (const button of strip.querySelectorAll('[data-action="ink-colour"]')) button.setAttribute('aria-pressed', state.tool === 'pen' && button.getAttribute('data-value') === state.hex ? 'true' : 'false');
	for (const button of strip.querySelectorAll('[data-action="ink-eraser"]')) button.setAttribute('aria-pressed', state.tool === 'eraser' ? 'true' : 'false');
	for (const button of strip.querySelectorAll('[data-action="ink-stylus"]')) button.setAttribute('aria-pressed', _rapierInkPenStylusOn(state) ? 'true' : 'false');
}

// The switch (docs/briefs/ink.md §4): a stylus inks with no button, unless the person who uses a stylus as a finger says so.
function _rapierInkPenStylusOn(state) {
	const doors = state && state.doors;
	return doors && typeof doors.stylus === 'function' ? doors.stylus() !== false : true;
}

function _rapierInkPenStrip(event) {
	const host = _rapierInkHost();
	const button = event.target && event.target.closest ? event.target.closest('[data-action]') : null;
	if (!host || !button) return;
	const state = _rapierInkPenState(host), action = button.getAttribute('data-action');
	if (action === 'ink-colour') {
		const value = String(button.getAttribute('data-value') || '').toLowerCase();
		if (/^#[0-9a-f]{6}$/.test(value)) state.hex = value;
		state.tool = 'pen';
	} else if (action === 'ink-eraser') {
		state.tool = state.tool === 'eraser' ? 'pen' : 'eraser';
		if (state.tool === 'eraser' && state.doors && typeof state.doors.say === 'function') state.doors.say(_RAPIER_INK_ERASER_NOTICE);
	} else if (action === 'ink-stylus') {
		if (state.doors && typeof state.doors.setStylus === 'function') state.doors.setStylus(!_rapierInkPenStylusOn(state));
	} else if (action === 'ink-done') {
		_rapierInkPenSet(host, false);
		return;
	} else return;
	event.preventDefault();
	_rapierInkPenPaintStrip(button.closest('#' + _RAPIER_INK_STRIP_ID) || document.getElementById(_RAPIER_INK_STRIP_ID), state);
}

function _rapierInkPenKey(event) {
	if (event.key !== 'Escape') return;
	const host = _rapierInkHost();
	const state = host && host._rapierInkPen;
	if (!state || !state.down) return;
	event.preventDefault();
	event.stopPropagation();
	_rapierInkPenSet(host, false);
}

// A stylus inks with no button, unless the switch says a stylus is a finger.
function _rapierInkPenInks(state, event) {
	if (state.down) return true;
	if (event.pointerType !== 'pen') return false;
	return _rapierInkPenStylusOn(state);
}

function _rapierInkPenDown(event) {
	const host = _rapierInkHost();
	if (!host || !host._rapierInkPen || !host._rapierInkPen.doors) return;
	const state = host._rapierInkPen;
	// A second finger while a stroke is live: the stroke is dropped and the two fingers scroll the page.
	if (state.stroke && !event.isPrimary && event.pointerType === 'touch') {
		const first = state.stroke.id, last = state.stroke.points[state.stroke.points.length - 1];
		_rapierInkPenClear(host);
		state.scroll = { ys: new Map([[first, last.y], [event.pointerId, event.clientY]]) };
		event.preventDefault();
		event.stopPropagation();
		return;
	}
	if (state.scroll) { if (event.pointerType === 'touch') state.scroll.ys.set(event.pointerId, event.clientY); return; }
	if (!_rapierInkPenInks(state, event) || !event.isPrimary || event.button !== 0 || state.stroke) return;
	const target = event.target;
	if (target && target.closest && target.closest('button, input, textarea, select, a[href], .rapier-image-tools, .rapier-ink-layer')) return;
	state.stroke = { id: event.pointerId, type: event.pointerType, points: [{ x: event.clientX, y: event.clientY }], target, moved: false };
	state.pending = true;
	try { host.setPointerCapture(event.pointerId); } catch (_) {}
	// No selection starts under a stroke; a tap still places the caret (the click after the lift is left to the engine).
	event.preventDefault();
	if (state.tool === 'eraser') return;
	const layer = _rapierInkLayerOf(host);
	if (!layer) return;
	const live = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	live.setAttribute('data-ink-live', '1');
	live.setAttribute('class', 'rapier-ink-piece');
	// One pixel, not zero: a zero-sized svg root paints nothing at all (SVG's "zero disables rendering"), so the stroke
	// showed only at the lift; the layer's overflow is visible, so the path paints wherever the finger goes.
	live.style.left = '0'; live.style.top = '0'; live.style.width = '1px'; live.style.height = '1px';
	live.style.setProperty('--md-ink', state.hex);
	live.style.setProperty('--md-ink-dark', state.doors.dark ? state.doors.dark(state.hex) : state.hex);
	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.style.strokeWidth = '2px';
	live.appendChild(path);
	layer.appendChild(live);
	state.live = live;
	_rapierInkPenTrace(host);
}

function _rapierInkPenTouch(event) {
	const host = _rapierInkHost();
	const state = host && host._rapierInkPen;
	if (state && (state.pending || state.scroll) && event.cancelable) event.preventDefault();
}

function _rapierInkPenMove(event) {
	const host = _rapierInkHost();
	const state = host && host._rapierInkPen;
	if (!state) return;
	if (state.scroll) {
		if (!state.scroll.ys.has(event.pointerId)) return;
		const before = _rapierInkPenMean(state.scroll.ys);
		state.scroll.ys.set(event.pointerId, event.clientY);
		host.scrollTop -= _rapierInkPenMean(state.scroll.ys) - before;
		event.preventDefault();
		event.stopPropagation();
		return;
	}
	if (!state.stroke || event.pointerId !== state.stroke.id) return;
	const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
	for (const e of events.length ? events : [event]) state.stroke.points.push({ x: e.clientX, y: e.clientY });
	const em = _rapierInkPenEm(state.stroke.target);
	if (!state.stroke.moved && state.doors.ink.strokeLength(state.stroke.points) >= state.doors.ink.INK_EM.dot * em) state.stroke.moved = true;
	event.preventDefault();
	event.stopPropagation();
	_rapierInkPenTrace(host);
}

function _rapierInkPenMean(ys) {
	let sum = 0, n = 0;
	for (const y of ys.values()) { sum += y; n++; }
	return n ? sum / n : 0;
}

function _rapierInkPenEm(target) {
	const element = target && target.nodeType === 1 ? target : (target && target.parentElement);
	return (element && parseFloat(getComputedStyle(element).fontSize)) || 16;
}

function _rapierInkPenTrace(host) {
	const state = host._rapierInkPen;
	if (!state.live || !state.stroke) return;
	const origin = state.live.getBoundingClientRect();
	state.live.firstChild.setAttribute('d', state.stroke.points.map((p, i) => (i ? 'L' : 'M') + (p.x - origin.left).toFixed(2) + ' ' + (p.y - origin.top).toFixed(2)).join(''));
}

function _rapierInkPenCancel(event) {
	const host = _rapierInkHost();
	const state = host && host._rapierInkPen;
	if (!state) return;
	if (state.scroll) { state.scroll.ys.delete(event.pointerId); if (state.scroll.ys.size < 2) state.scroll = null; return; }
	if (!state.stroke || event.pointerId !== state.stroke.id) return;
	_rapierInkPenClear(host);
}

function _rapierInkPenClear(host) {
	const state = host._rapierInkPen;
	if (state.live && state.live.parentNode) state.live.parentNode.removeChild(state.live);
	state.live = null; state.stroke = null; state.pending = false;
	try { host.style.touchAction = state.down ? 'none' : ''; } catch (_) {}
}

// The click that follows a stroke is not a tap: it is swallowed once. A tap's click goes on to the engine.
function _rapierInkPenClick(event) {
	const host = _rapierInkHost();
	const state = host && host._rapierInkPen;
	if (!state || !state.swallowClick) return;
	state.swallowClick = false;
	event.preventDefault();
	event.stopPropagation();
}

// The line boxes and the words of a block, as the browser laid them: one box per line, one word per run of non-space
// characters in the block's own text, each with the text node and offsets a Range can be made from.
function _rapierInkPenWords(live) {
	const lines = [], words = [];
	const merge = (list, r) => {
		const middle = r.top + r.height / 2;
		const line = list.find(l => middle > l.y && middle < l.y + l.height);
		if (!line) { list.push({ x: r.left, y: r.top, width: r.width, height: r.height }); return; }
		const right = Math.max(line.x + line.width, r.right), bottom = Math.max(line.y + line.height, r.bottom);
		line.x = Math.min(line.x, r.left); line.y = Math.min(line.y, r.top); line.width = right - line.x; line.height = bottom - line.y;
	};
	const walker = document.createTreeWalker(live, NodeFilter.SHOW_TEXT);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const parent = node.parentElement;
		if (!parent || parent.closest('.rapier-ink-layer, script, style')) continue;
		const text = node.nodeValue;
		const pattern = /\S+/g;
		let match;
		while ((match = pattern.exec(text))) {
			const range = document.createRange();
			range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
			const rects = Array.from(range.getClientRects()).filter(r => r.width > 0 || r.height > 0);
			if (!rects.length) continue;
			for (const r of rects) merge(lines, r);
			const r = rects[0];
			const box = rects.length === 1 ? { x: r.left, y: r.top, width: r.width, height: r.height }
				: { x: Math.min(...rects.map(q => q.left)), y: Math.min(...rects.map(q => q.top)), width: Math.max(...rects.map(q => q.right)) - Math.min(...rects.map(q => q.left)), height: Math.max(...rects.map(q => q.bottom)) - Math.min(...rects.map(q => q.top)) };
			words.push({ box, start: words.length, end: words.length + 1, node, offset: match.index, length: match[0].length });
		}
	}
	return { lines: lines.sort((a, b) => a.y - b.y || a.x - b.x), words };
}

function _rapierInkPenSelect(range) {
	const selection = window.getSelection();
	selection.removeAllRanges();
	selection.addRange(range);
	return selection;
}

function _rapierInkPenArrow(host, points, doors, em, hex) {
	if (typeof doors.applyArrow !== 'function') return null;
	const stroke = doors.ink.bounds(points), words = [];
	for (const wrapper of host.querySelectorAll('.block-wrapper')) {
		const live = doors.liveOf ? doors.liveOf(wrapper) : wrapper;
		if (!live) continue;
		const box = live.getBoundingClientRect();
		if (box.right < stroke.x || box.left > stroke.x + stroke.width || box.bottom < stroke.y || box.top > stroke.y + stroke.height) continue;
		words.push(..._rapierInkPenWords(live).words);
	}
	const arrow = doors.ink.arrowStroke(points, words, em);
	if (!arrow) return null;
	const rangeOf = word => {
		const range = document.createRange();
		range.setStart(word.node, word.offset); range.setEnd(word.node, word.offset + word.length);
		return range;
	};
	const frame = doors.ink.bounds(arrow.points), encoded = doors.ink.encodeStroke(arrow.points, arrow.points[0], frame, em);
	return { tail: rangeOf(arrow.tail), head: rangeOf(arrow.head), mark: { hex, ...encoded } };
}

// Both anchors of an arrow and every word an eraser visits are resolved against one exact source snapshot before
// either act commits. A fresh editing block may still be dirty for projection; source equality proves its local copy.
function _rapierInkSourceRanges(ranges) {
	if (!Array.isArray(ranges) || !ranges.length) return null;
	const locations = [], wrappers = new Set();
	for (const range of ranges) {
		if (!range || range.collapsed) return null;
		const wrapper = _blockWrapperOf(range.startContainer), live = wrapper && _liveBlockEl(wrapper);
		if (!live || !_nodeInside(live, range.startContainer) || !_nodeInside(live, range.endContainer)) return null;
		locations.push({ wrapper, start: _rapierStructuralOffsetForRangePoint(live, range.startContainer, range.startOffset),
			end: _rapierStructuralOffsetForRangePoint(live, range.endContainer, range.endOffset),
			first: { node: range.startContainer, offset: range.startOffset }, last: { node: range.endContainer, offset: range.endOffset } });
		wrappers.add(wrapper);
	}
	for (const wrapper of wrappers) {
		const live = _liveBlockEl(wrapper);
		if (wrapper.classList.contains('block-wrapper--editing') && live && live._rapierCheckpointFresh === false) _rapierCheckpointEdit(live);
	}
	if (!_rapierSettlePendingDocumentChange()) return null;
	const source = _rapierSourceText(), spans = _rapierExcerptCanonicalBlockSpans(), resolved = [];
	for (const location of locations) {
		const { wrapper } = location, block = _rapierBoundBlock(wrapper), live = _liveBlockEl(wrapper);
		const span = block && spans.get(Number(block.id));
		if (!span || !live || source.slice(span.start, span.end) !== String(block.raw || '') || _rapierLiveRawForWrapper(wrapper) !== block.raw) return null;
		const point = (held, offset, next) => held.node.nodeType === Node.TEXT_NODE && _nodeInside(live, held.node)
			? held : _rapierPointForTextOffset(live, offset, next);
		const first = point(location.first, location.start, true), last = point(location.last, location.end, false);
		if (!first || !last) return null;
		const exact = block.dirty ? Object.assign({}, block, { dirty: false }) : block;
		const start = _rapierRenderedBoundaryToCanonical(wrapper, exact, first.node, first.offset, span, true);
		const end = _rapierRenderedBoundaryToCanonical(wrapper, exact, last.node, last.offset, span, true);
		if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= end) return null;
		resolved.push({ start, end, block, wrapper, span });
	}
	return { source, ranges: resolved, spans };
}

// A word may cross bold, colour or another inline node. Its one Range covers the whole word; its actual fragments
// are tested separately, so wrapping never turns the empty space between lines into an eraser hit.
function _rapierInkPenEraseWords(span) {
	const nodes = [], words = [], walker = document.createTreeWalker(span, NodeFilter.SHOW_TEXT);
	let text = '';
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (node.parentElement?.closest('.rapier-ink-layer, script, style')) continue;
		nodes.push({ node, start: text.length, end: text.length + node.nodeValue.length });
		text += node.nodeValue.replace(/\u2060/g, '\n');
	}
	let first = 0, last = 0;
	for (const match of text.matchAll(/\S+/g)) {
		const end = match.index + match[0].length;
		while (first < nodes.length && nodes[first].end <= match.index) first++;
		last = Math.max(last, first);
		while (last + 1 < nodes.length && nodes[last].end < end) last++;
		if (!nodes[first] || !nodes[last]) continue;
		const range = document.createRange();
		range.setStart(nodes[first].node, match.index - nodes[first].start);
		range.setEnd(nodes[last].node, end - nodes[last].start);
		const rects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0);
		if (rects.length) words.push({ range, rects });
	}
	return words;
}

// Segment/rectangle clipping keeps all words crossed between coalesced pointer samples, including a sparse stroke.
function _rapierInkPenPathHitsRect(points, rect, slack) {
	const low = [rect.left - slack, rect.top - slack], high = [rect.right + slack, rect.bottom + slack];
	for (let i = 0; i < points.length; i++) {
		const a = points[Math.max(0, i - 1)], b = points[i];
		const from = [a.x, a.y], to = [b.x, b.y];
		let enter = 0, leave = 1;
		for (let axis = 0; axis < 2 && enter <= leave; axis++) {
			const delta = to[axis] - from[axis];
			if (!delta) { if (from[axis] < low[axis] || from[axis] > high[axis]) enter = 2; continue; }
			const p = (low[axis] - from[axis]) / delta, q = (high[axis] - from[axis]) / delta;
			enter = Math.max(enter, Math.min(p, q)); leave = Math.min(leave, Math.max(p, q));
		}
		if (enter <= leave) return true;
	}
	return false;
}

function _rapierInkPenEraseRanges(host, points, doors, slack) {
	const ranges = [], pieces = Array.from(_rapierInkLayerOf(host)?.children || []);
	for (const span of host.querySelectorAll(doors.draw.SPAN_SELECTOR)) {
		const wrapper = span.closest('.block-wrapper'), live = wrapper && (doors.liveOf ? doors.liveOf(wrapper) : wrapper);
		if (!live || !live.contains(span)) continue;
		const mark = doors.spec.parseInkBody(span.getAttribute('data-rapier-ink'));
		if (!mark) continue;
		const words = _rapierInkPenEraseWords(span);
		if (!words.length) continue;
		const hits = words.filter(word => word.rects.some(rect => _rapierInkPenPathHitsRect(points, rect, slack)));
		const pieceHit = () => pieces.some(piece => piece._rapierInkSpan === span && _rapierInkPenPathHitsRect(points, piece.getBoundingClientRect(), slack));
		if (mark.kind === 'free' || mark.kind === 'arrow' || mark.kind === 'end') {
			if (!hits.length && !pieceHit()) continue;
			const range = words[0].range.cloneRange(), end = words[words.length - 1].range;
			range.setEnd(end.endContainer, end.endOffset); ranges.push(range);
		} else if (hits.length) {
			for (const word of hits) ranges.push(word.range);
		} else if (pieceHit()) {
			// A ring or bracket can be touched outside its words. The nearest marked word owns that part of the mark.
			let nearest = null, distance = Infinity;
			for (const word of words) for (const rect of word.rects) for (const point of points) {
				const dx = Math.max(rect.left - point.x, 0, point.x - rect.right), dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
				if (dx * dx + dy * dy < distance) { nearest = word; distance = dx * dx + dy * dy; }
			}
			if (nearest) ranges.push(nearest.range);
		}
	}
	return ranges;
}

function _rapierInkPenUp(event) {
	const host = _rapierInkHost();
	const state = host && host._rapierInkPen;
	if (!state) return;
	if (state.scroll) { state.scroll.ys.delete(event.pointerId); if (state.scroll.ys.size < 2) state.scroll = null; event.preventDefault(); event.stopPropagation(); return; }
	if (!state.stroke || event.pointerId !== state.stroke.id) return;
	const stroke = state.stroke, doors = state.doors;
	_rapierInkPenClear(host);
	try { host.releasePointerCapture(event.pointerId); } catch (_) {}
	const { spec, ink, draw } = doors;
	const points = stroke.points;
	const b = ink.bounds(points);
	if (state.tool === 'eraser') {
		// All words visited by this stroke leave their ink in one source edit; doodles and paired arrows leave whole.
		event.preventDefault();
		event.stopPropagation();
		state.swallowClick = true;
		if (typeof doors.erase !== 'function') return false;
		const visited = points.concat({ x: event.clientX, y: event.clientY });
		const ranges = _rapierInkPenEraseRanges(host, visited, doors, 0.3 * _rapierInkPenEm(stroke.target));
		if (!ranges.length) return false;
		try { return Promise.resolve(doors.erase(ranges)).catch(() => false); } catch (_) { return false; }
	}
	// A tap is a tap: nothing is drawn, the caret goes where it landed (the pointerdown's own placing was kept back so no
	// selection could start under a stroke), and the engine's own tap goes on (the click after this lift).
	if (!stroke.moved) {
		try {
			const p = points[points.length - 1];
			const caret = document.caretPositionFromPoint ? document.caretPositionFromPoint(p.x, p.y) : null;
			const range = caret && caret.offsetNode ? document.createRange() : (document.caretRangeFromPoint ? document.caretRangeFromPoint(p.x, p.y) : null);
			if (caret && caret.offsetNode) { range.setStart(caret.offsetNode, caret.offset); range.collapse(true); }
			if (range) _rapierInkPenSelect(range);
		} catch (_) {}
		return;
	}
	event.preventDefault();
	event.stopPropagation();
	state.swallowClick = true;
	// The block under the stroke: the one its first point landed on, or the one at its middle.
	const at = stroke.target && stroke.target.closest ? stroke.target.closest('.block-wrapper') : null;
	const middle = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
	const wrapper = at || (middle && middle.closest ? middle.closest('.block-wrapper') : null);
	const live = wrapper ? (doors.liveOf ? doors.liveOf(wrapper) : wrapper) : null;
	if (!live) return;
	const em = parseFloat(getComputedStyle(live).fontSize) || 16;
	if (ink.strokeLength(points) < ink.INK_EM.dot * em) return;
	const arrow = _rapierInkPenArrow(host, points, doors, em, state.hex);
	if (arrow) {
		try { return doors.applyArrow(arrow.tail, arrow.head, arrow.mark); } catch (_) { return false; }
	}
	const { lines, words } = _rapierInkPenWords(live);
	if (!words.length) return;
	const kind = ink.classifyStroke(points, lines, em);
	const anchor = ink.anchorStroke(points, kind, words, em);
	if (!anchor) return;
	const unit = em / 100;
	let origin, size;
	if (kind === 'free') { origin = { x: anchor.frame.x + anchor.at[0] * unit, y: anchor.frame.y + anchor.at[1] * unit }; size = { width: b.width, height: b.height }; }
	else if (kind === 'bracket') { origin = { x: anchor.frame.x + anchor.at[0] * unit, y: anchor.frame.y + anchor.at[1] * unit }; size = anchor.frame; }
	else { origin = { x: anchor.frame.x, y: anchor.frame.y }; size = anchor.frame; }
	const encoded = ink.encodeStroke(points, origin, size, em);
	let opener;
	try { opener = spec.formatInkOpen({ kind, hex: state.hex, box: encoded.box, at: anchor.at, path: encoded.path }); }
	catch (_) { return; }
	const first = words[anchor.start], last = words[anchor.end - 1];
	const range = document.createRange();
	range.setStart(first.node, first.offset);
	range.setEnd(last.node, last.offset + last.length);
	const selection = _rapierInkPenSelect(range);
	let applied = false;
	try { applied = doors.apply(opener); } catch (_) { applied = false; }
	try { selection.removeAllRanges(); } catch (_) {}
	return applied;
}
