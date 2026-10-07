// SPDX-License-Identifier: AGPL-3.0-only
// The pen: with the pen down, or with a stylus, a drag over the page is a stroke; at the lift the stroke's kind is read
// once, its words are found, its path is stored, and the words take the pair through the engine's own exact-source door
// (_rapierApplyInk), so Undo takes it back in one step. An explicit drawing tap makes a dot; a stylus tap outside
// annotation mode places the caret. Two fingers or the Scroll tool move the page; Esc lifts the pen. Spliced into
// editor/engine.js at /* RAPIER_INK_PEN_MODULE */. Everything it needs comes in through _rapierInkPenInstall; its state
// lives on the host.

const _RAPIER_INK_PEN_SELECTOR = '[data-action="ink-pen"]';
const _RAPIER_INK_STRIP_ID = 'ink-strip';

function _rapierInkPenState(host) {
	return host._rapierInkPen || (host._rapierInkPen = { installed: false, down: false, tool: 'pen', hex: '#b32034', width: 9, widthRow: false, stroke: null, live: null, pending: false, scroll: null, swallowClick: false, refused: null, doors: null, frame: 0, cursor: null, colours: false });
}

// The engine supplies grammar, geometry, source transactions, mutation admission and the stylus preference.
function _rapierInkPenInstall(doors) {
	const host = _rapierInkHost();
	if (!host || !doors || !doors.spec || !doors.ink || !doors.draw || typeof doors.apply !== 'function') return;
	const state = _rapierInkPenState(host);
	state.doors = doors;
	_rapierInkPenReadPreferences();
	if (state.installed) return;
	state.installed = true;
	host.addEventListener('pointerdown', _rapierInkPenDown, { capture: true });
	host.addEventListener('pointermove', _rapierInkPenMove, { capture: true });
	host.addEventListener('pointerup', _rapierInkPenUp, { capture: true });
	host.addEventListener('pointercancel', _rapierInkPenCancel, { capture: true });
	host.addEventListener('lostpointercapture', _rapierInkPenCancel);
	// A finger held still on words is a long press to the browser (a selection, its handles, a menu) unless the touch is
	// the pen's: its start is refused here, before the browser reads the hold, and the menu a hold would raise is refused.
	host.addEventListener('touchstart', _rapierInkPenTouchStart, { capture: true, passive: false });
	host.addEventListener('contextmenu', event => { if (state.down && state.tool !== 'scroll') event.preventDefault(); }, { capture: true });
	host.addEventListener('pointerleave', () => { if (!state.stroke) _rapierInkPenClear(host); });
	host.addEventListener('scroll', () => { if (state.stroke) _rapierInkPenClear(host); }, { passive: true });
	window.addEventListener('blur', () => { _rapierInkPenClear(host); state.scroll = null; });
	// A resize (the keyboard folding away as the pen goes down, the address bar) does not end a stroke the finger is still drawing.
	window.addEventListener('resize', () => { if (!state.stroke) _rapierInkPenClear(host); });
	host.addEventListener('click', _rapierInkPenClick, { capture: true });
	// The gesture's first touch belongs to ink; a second finger changes it to scrolling without saving a mark.
	host.addEventListener('touchmove', _rapierInkPenTouch, { capture: true, passive: false });
	document.addEventListener('keydown', _rapierInkPenKey, { capture: true });
	for (const button of document.querySelectorAll(_RAPIER_INK_PEN_SELECTOR)) button.addEventListener('click', _rapierInkPenToggle);
	const strip = document.getElementById(_RAPIER_INK_STRIP_ID);
	if (strip) {
		strip.addEventListener('click', _rapierInkPenStrip);
		strip.addEventListener('input', event => {
			if (event.target.matches('[data-ink-width-input]')) {
				state.width = Math.max(2, Math.min(24, Math.round(Number(event.target.value)) || 9));
				state.doors.setWidth?.(state.width);
				_rapierInkPenPaintStrip(strip, state);
				return;
			}
			if (!event.target.matches('[data-ink-colour-input]')) return;
			state.hex = event.target.value; state.tool = 'pen';
			state.doors.setColour?.(state.hex);
			_rapierInkPenPaintStrip(strip, state);
			_rapierInkPenMode(host);
		});
	}
}

// Preference writes change the next stroke's authored metadata, including after installation.
function _rapierInkPenReadPreferences() {
	const state = _rapierInkHost()?._rapierInkPen;
	if (!state?.doors) return;
	const remembered = state.doors.colour?.();
	if (/^#[0-9a-f]{6}$/i.test(remembered || '')) state.hex = remembered.toLowerCase();
	const rememberedWidth = Number(state.doors.width?.());
	if (Number.isInteger(rememberedWidth) && rememberedWidth >= 2 && rememberedWidth <= 24) state.width = rememberedWidth;
	_rapierInkPenPaintStrip(document.getElementById(_RAPIER_INK_STRIP_ID), state);
}

function _rapierInkPenToggle() {
	const host = _rapierInkHost();
	if (host) _rapierInkPenSet(host, !_rapierInkPenState(host).down);
}

function _rapierInkPenMode(host) {
	const state = host._rapierInkPen;
	host.style.touchAction = state.down && state.tool !== 'scroll' ? 'none' : '';
	if (state.down) host.setAttribute('data-rapier-pen', state.tool); else host.removeAttribute('data-rapier-pen');
}

function _rapierInkPenSet(host, down) {
	const state = _rapierInkPenState(host);
	_rapierInkPenClear(host);
	_rapierInkPenDropRefused(host);
	state.scroll = null;
	state.swallowClick = false;
	state.down = !!down;
	if (state.down && host.contains(document.activeElement)) document.activeElement.blur();
	if (!state.down) { state.tool = 'pen'; state.colours = false; state.widthRow = false; }
	_rapierInkPenMode(host);
	for (const button of document.querySelectorAll(_RAPIER_INK_PEN_SELECTOR)) button.setAttribute('aria-pressed', String(state.down));
	const strip = document.getElementById(_RAPIER_INK_STRIP_ID);
	if (strip) {
		strip.classList.toggle('visible', state.down);
		strip.setAttribute('aria-hidden', String(!state.down));
		strip.inert = !state.down;
		_rapierInkPenPaintStrip(strip, state);
	}
}

function _rapierInkPenPaintStrip(strip, state) {
	if (!strip) return;
	for (const button of strip.querySelectorAll('[data-action="ink-colour"]')) button.setAttribute('aria-pressed', String(button.getAttribute('data-value') === state.hex));
	for (const [action, tool] of [['ink-draw', 'pen'], ['ink-eraser', 'eraser'], ['ink-scroll', 'scroll']]) {
		for (const button of strip.querySelectorAll('[data-action="' + action + '"]')) button.setAttribute('aria-pressed', String(state.tool === tool));
	}
	for (const button of strip.querySelectorAll('[data-action="ink-stylus"]')) button.setAttribute('aria-pressed', String(_rapierInkPenStylusOn(state)));
	const colours = strip.querySelector('.ink-strip__colours'), toggle = strip.querySelector('[data-action="ink-palette"]');
	const widthRow = strip.querySelector('.ink-strip__width'), widthToggle = strip.querySelector('[data-action="ink-width"]');
	if (widthRow) {
		widthRow.hidden = !state.widthRow;
		const input = widthRow.querySelector('input'), word = widthRow.querySelector('output');
		if (input) {
			input.value = String(state.width);
			const min = Number(input.min) || 2, max = Number(input.max) || 24;
			input.parentElement.style.setProperty('--seek-frac', String(Math.max(0, Math.min(1, (state.width - min) / (max - min)))));
		}
		if (word) word.textContent = String(state.width);
	}
	if (widthToggle) widthToggle.setAttribute('aria-expanded', String(state.widthRow));
	if (colours) colours.hidden = !state.colours;
	if (toggle) { toggle.setAttribute('aria-expanded', String(state.colours)); toggle.style.setProperty('--ink-colour', state.hex); }
	const custom = strip.querySelector('[data-ink-colour-input]');
	if (custom) custom.value = state.hex;
}

// The switch: a stylus inks with no button, unless the person who uses a stylus as a finger says so.
function _rapierInkPenStylusOn(state) {
	const doors = state && state.doors;
	return doors && typeof doors.stylus === 'function' ? doors.stylus() !== false : true;
}

function _rapierInkPenStrip(event) {
	const host = _rapierInkHost();
	const button = event.target && event.target.closest ? event.target.closest('[data-action]') : null;
	if (!host || !button) return;
	const state = _rapierInkPenState(host), action = button.getAttribute('data-action');
	_rapierInkPenClear(host);
	if (action === 'ink-colour') {
		const value = String(button.getAttribute('data-value') || '').toLowerCase();
		if (/^#[0-9a-f]{6}$/.test(value)) { state.hex = value; state.doors.setColour?.(value); }
		state.tool = 'pen';
	} else if (action === 'ink-draw') {
		state.tool = 'pen';
	} else if (action === 'ink-scroll') {
		state.tool = 'scroll';
	} else if (action === 'ink-palette') {
		state.colours = !state.colours;
		if (state.colours) state.widthRow = false;
	} else if (action === 'ink-width') {
		state.widthRow = !state.widthRow;
		if (state.widthRow) state.colours = false;
	} else if (action === 'ink-eraser') {
		state.tool = state.tool === 'eraser' ? 'pen' : 'eraser';
	} else if (action === 'ink-stylus') {
		if (state.doors && typeof state.doors.setStylus === 'function') state.doors.setStylus(!_rapierInkPenStylusOn(state));
	} else if (action === 'ink-done') {
		_rapierInkPenSet(host, false);
		return;
	} else return;
	event.preventDefault();
	_rapierInkPenMode(host);
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
	if (state.down) return state.tool !== 'scroll';
	if (event.pointerType !== 'pen') return false;
	return _rapierInkPenStylusOn(state);
}

function _rapierInkPenDown(event) {
	const host = _rapierInkHost();
	if (!host || !host._rapierInkPen || !host._rapierInkPen.doors) return;
	const state = host._rapierInkPen;
	// A primary press means every earlier touch has ended: a stroke or a two-finger scroll still held is a lift the page never
	// heard (a finger that left over the bar, a cancelled touch), and it would swallow every press after it.
	if (event.isPrimary && (state.scroll || (state.stroke && state.stroke.id !== event.pointerId))) { _rapierInkPenClear(host); state.scroll = null; }
	// A second finger while a stroke is live: the stroke is dropped and the two fingers scroll the page.
	if (state.stroke && state.stroke.type === 'touch' && !event.isPrimary && event.pointerType === 'touch') {
		const first = state.stroke.id, last = state.stroke.points[state.stroke.points.length - 1];
		_rapierInkPenClear(host);
		state.scroll = { ys: new Map([[first, last.y], [event.pointerId, event.clientY]]) };
		state.swallowClick = true;
		try { host.setPointerCapture(first); host.setPointerCapture(event.pointerId); } catch (_) {}
		event.preventDefault();
		event.stopPropagation();
		return;
	}
	if (state.scroll) { if (event.pointerType === 'touch') state.scroll.ys.set(event.pointerId, event.clientY); return; }
	if (state.down && state.tool === 'scroll' && event.pointerType !== 'touch' && event.button === 0) {
		state.scroll = { ys: new Map([[event.pointerId, event.clientY]]) };
		state.swallowClick = true;
		try { host.setPointerCapture(event.pointerId); } catch (_) {}
		event.preventDefault(); event.stopPropagation(); return;
	}
	if (!_rapierInkPenInks(state, event) || !event.isPrimary || (event.button !== 0 && !(event.pointerType === 'pen' && event.button === 5)) || state.stroke) return;
	const target = event.target;
	// With the pen down the document is a drawing surface: a link, a box, a summary or a button under it is words to mark, and
	// nothing under it acts (its press is the pen's, and the click that follows is swallowed). A stylus with the pen up leaves a control its tap.
	const refused = state.down ? '.rapier-ink-layer' : 'button, input, textarea, select, a[href], .rapier-image-tools, .rapier-ink-layer';
	if (target && target.closest && target.closest(refused)) return;
	_rapierInkPenClear(host);
	_rapierInkPenDropRefused(host);
	state.stroke = { id: event.pointerId, type: event.pointerType, points: [{ x: event.clientX, y: event.clientY }], target, moved: false, erase: _rapierInkPenErases(state, event) };
	state.pending = true;
	try { host.setPointerCapture(event.pointerId); } catch (_) {}
	// Text selection and the software keyboard must not start beneath an annotation gesture.
	event.preventDefault();
	event.stopPropagation();
	if (state.stroke.erase) { state.cursor = { x: event.clientX, y: event.clientY }; _rapierInkPenTrace(host); return; }
	_rapierInkPenTrace(host);
}

// A stylus's barrel button held, or its eraser end, erases for that stroke whatever the strip's tool; let go
// and the pen inks again.
function _rapierInkPenErases(state, event) {
	return state.tool === 'eraser' || (event.pointerType === 'pen' && ((event.buttons & 34) !== 0 || event.button === 5));
}

// A nonzero SVG viewport is essential: an overflow-visible zero-sized SVG does not paint in Chromium.
function _rapierInkPenLive(host) {
	const state = host._rapierInkPen, layer = _rapierInkLayerOf(host);
	if (!layer) return null;
	if (!state.live) {
		state.live = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		state.live.setAttribute('data-ink-live', '1');
		state.live.setAttribute('class', 'rapier-ink-piece');
		layer.appendChild(state.live);
	}
	// The editor draws the page again while a stroke is down (a block settling after the last commit) and may take the layer
	// with it: the live stroke stands in whichever layer the page has now.
	if (state.live.parentNode !== layer) layer.appendChild(state.live);
	const rect = host.getBoundingClientRect(), origin = layer.getBoundingClientRect();
	state.live.style.left = (rect.left - origin.left) + 'px';
	state.live.style.top = (rect.top - origin.top) + 'px';
	state.live.style.width = Math.max(1, host.clientWidth) + 'px';
	state.live.style.height = Math.max(1, host.clientHeight) + 'px';
	state.live.style.setProperty('--md-ink', state.hex);
	state.live.style.setProperty('--md-ink-dark', state.doors.dark ? state.doors.dark(state.hex) : state.hex);
	return { svg: state.live, rect };
}

function _rapierInkPenTouchStart(event) {
	const host = _rapierInkHost();
	const state = host && host._rapierInkPen;
	if (!state || !state.down || state.tool === 'scroll' || !event.cancelable) return;
	event.preventDefault();
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
	if (!state.stroke || event.pointerId !== state.stroke.id) {
		// A pen held above the glass shows where it will land: the nib in the ink's colour, or the eraser's ring.
		const hovering = event.pointerType === 'pen' && !state.stroke && (event.buttons & 1) === 0 && _rapierInkPenInks(state, event);
		if (hovering || (state.down && state.tool === 'eraser' && event.pointerType !== 'touch')) {
			state.cursor = { x: event.clientX, y: event.clientY, erase: _rapierInkPenErases(state, event), target: event.target }; _rapierInkPenTrace(host);
		}
		return;
	}
	const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
	for (const e of events.length ? events : [event]) state.stroke.points.push({ x: e.clientX, y: e.clientY });
	state.cursor = { x: event.clientX, y: event.clientY };
	const em = state.stroke.em || (state.stroke.em = _rapierInkPenEm(state.stroke.target));
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

// The em of the words a gesture stands on: the first text of the block under it, since a block's own box can stand at another
// size than its words (a heading), then the touched element.
function _rapierInkPenEm(target) {
	const element = target && target.nodeType === 1 ? target : (target && target.parentElement);
	const wrapper = element && element.closest ? element.closest('.block-wrapper') : null;
	let text = null;
	if (wrapper) {
		const walker = document.createTreeWalker(wrapper, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			if (node.nodeValue.trim() && node.parentElement && !node.parentElement.closest('.rapier-ink-layer, button, script, style')) { text = node; break; }
		}
	}
	const source = text ? text.parentElement : element;
	return (source && parseFloat(getComputedStyle(source).fontSize)) || 16;
}

function _rapierInkPenTrace(host) {
	const state = host._rapierInkPen;
	if (state.frame) return;
	state.frame = requestAnimationFrame(() => {
		state.frame = 0;
		if (!state.stroke && !state.cursor) return;
		const live = _rapierInkPenLive(host);
		if (!live) return;
		const { svg, rect } = live, ns = 'http://www.w3.org/2000/svg';
		svg.replaceChildren();
		if (state.stroke ? state.stroke.erase : state.cursor.erase) {
			const point = state.cursor || state.stroke.points.at(-1), radius = 8;
			const ranges = _rapierInkPenEraseRanges(host, state.stroke?.points || [point], state.doors, radius);
			for (const piece of _rapierInkLayerOf(host).children) {
				if (piece._rapierInkSpan) piece.toggleAttribute('data-ink-erasing', ranges.marks.includes(piece._rapierInkSpan) || ranges.marks.includes(piece._rapierInkEndSpan));
			}
			for (const range of ranges) for (const box of range.getClientRects()) {
				const preview = document.createElementNS(ns, 'rect');
				preview.setAttribute('x', box.left - rect.left); preview.setAttribute('y', box.top - rect.top);
				preview.setAttribute('width', box.width); preview.setAttribute('height', box.height);
				preview.setAttribute('class', 'ink-erase-preview'); svg.appendChild(preview);
			}
			const cursor = document.createElementNS(ns, 'circle');
			cursor.setAttribute('cx', point.x - rect.left); cursor.setAttribute('cy', point.y - rect.top);
			cursor.setAttribute('r', radius); cursor.setAttribute('class', 'ink-erase-cursor'); svg.appendChild(cursor);
		} else if (!state.stroke) {
			const nib = document.createElementNS(ns, 'circle');
			nib.setAttribute('cx', state.cursor.x - rect.left); nib.setAttribute('cy', state.cursor.y - rect.top);
			nib.setAttribute('r', Math.max(1.5, .055 * _rapierInkPenEm(state.cursor.target))); nib.setAttribute('class', 'ink-hover-nib'); svg.appendChild(nib);
		} else {
			const path = document.createElementNS(ns, 'path');
			path.setAttribute('d', state.doors.draw.inkPath(state.stroke.points.map(p => ({ x: p.x - rect.left, y: p.y - rect.top })), .11 * (state.stroke.em || _rapierInkPenEm(state.stroke.target)) * state.width / 9, false));
			svg.appendChild(path);
		}
	});
}

function _rapierInkPenCancel(event) {
	const host = _rapierInkHost();
	const state = host && host._rapierInkPen;
	if (!state) return;
	if (state.scroll) { state.scroll.ys.delete(event.pointerId); if (!state.scroll.ys.size) state.scroll = null; return; }
	if (!state.stroke || event.pointerId !== state.stroke.id) return;
	_rapierInkPenClear(host);
}

function _rapierInkPenClear(host) {
	const state = host._rapierInkPen;
	if (state.frame) cancelAnimationFrame(state.frame);
	state.frame = 0; state.cursor = null;
	const id = state.stroke?.id;
	for (const piece of _rapierInkLayerOf(host)?.querySelectorAll('[data-ink-erasing]') || []) piece.removeAttribute('data-ink-erasing');
	if (state.live && state.live.parentNode) state.live.parentNode.removeChild(state.live);
	state.live = null; state.stroke = null; state.pending = false;
	if (id != null) { try { host.releasePointerCapture(id); } catch (_) {} }
	_rapierInkPenMode(host);
}

// Suppress the compatibility click after drawing, erasing or panning; it must not open the keyboard.
function _rapierInkPenClick(event) {
	const host = _rapierInkHost();
	const state = host && host._rapierInkPen;
	if (!state || !state.swallowClick) return;
	state.swallowClick = false;
	event.preventDefault();
	event.stopPropagation();
}

// Whether a block can hold a span at all (a picture, a fence, a rule, an expanding section cannot; a table takes one in a cell).
function _rapierInkPenCarries(wrapper) {
	return typeof _rapierWrappersCanTakeMark !== 'function' || _rapierWrappersCanTakeMark([wrapper]);
}

// The line boxes and the words of a block, as the browser laid them: one box per line, one word per run of non-space
// characters in the block's own text, each with the text node and offsets a Range can be made from. Words of code, a button,
// a summary, a footnote's number or a callout's label are not words a span can hold and are left out.
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
		if (!parent || parent.closest('.rapier-ink-layer, script, style, pre, code, button, summary, .callout__label, .footnote-ref, .footnote-backref, .section-fold-btn')) continue;
		const group = parent.closest('td, th');
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
			words.push({ box, start: words.length, end: words.length + 1, node, offset: match.index, length: match[0].length, group });
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

function _rapierInkPenArrow(host, points, doors, em, hex, width) {
	if (typeof doors.applyArrow !== 'function') return null;
	const stroke = doors.ink.bounds(points), words = [];
	for (const wrapper of host.querySelectorAll('.block-wrapper')) {
		const live = doors.liveOf ? doors.liveOf(wrapper) : wrapper;
		if (!live || !_rapierInkPenCarries(wrapper)) continue;
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
	return { tail: rangeOf(arrow.tail), head: rangeOf(arrow.head), mark: { hex, width, ...encoded } };
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

// Hit the painted path, not its bounding box: the empty middle of a loop is not ink.
function _rapierInkPenHitsPiece(points, piece, slack) {
	const rect = piece.getBoundingClientRect();
	if (!_rapierInkPenPathHitsRect(points, rect, slack)) return false;
	const line = piece._rapierInkPoints, origin = piece._rapierInkOrigin;
	if (!line?.length || !origin) return false;
	const dx = rect.left - origin.x, dy = rect.top - origin.y, reach = slack + (piece._rapierInkWidth || 0) / 2;
	const distance = (p, a, b) => {
		const vx = b.x - a.x, vy = b.y - a.y, length = vx * vx + vy * vy;
		const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / length)) : 0;
		return Math.hypot(p.x - a.x - t * vx, p.y - a.y - t * vy);
	};
	const cross = (a, b, p) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
	for (let i = 0; i < points.length; i++) {
		const a = points[Math.max(0, i - 1)], b = points[i];
		for (let j = 0; j < line.length; j++) {
			const c = { x: line[Math.max(0, j - 1)].x + dx, y: line[Math.max(0, j - 1)].y + dy };
			const d = { x: line[j].x + dx, y: line[j].y + dy };
			if (Math.max(a.x, b.x) + reach < Math.min(c.x, d.x) || Math.min(a.x, b.x) - reach > Math.max(c.x, d.x) ||
				Math.max(a.y, b.y) + reach < Math.min(c.y, d.y) || Math.min(a.y, b.y) - reach > Math.max(c.y, d.y)) continue;
			if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0 ||
				Math.min(distance(a, c, d), distance(b, c, d), distance(c, a, b), distance(d, a, b)) <= reach) return true;
		}
	}
	return false;
}

function _rapierInkPenEraseRanges(host, points, doors, slack) {
	const ranges = [], pieces = Array.from(_rapierInkLayerOf(host)?.children || []);
	ranges.marks = [];
	for (const span of host.querySelectorAll(doors.draw.SPAN_SELECTOR)) {
		const wrapper = span.closest('.block-wrapper'), live = wrapper && (doors.liveOf ? doors.liveOf(wrapper) : wrapper);
		if (!live || !live.contains(span)) continue;
		const mark = doors.spec.parseInkBody(span.getAttribute('data-rapier-ink'));
		if (!mark) continue;
		const words = _rapierInkPenEraseWords(span);
		if (!words.length) continue;
		const hits = words.filter(word => word.rects.some(rect => _rapierInkPenPathHitsRect(points, rect, slack)));
		const pieceHit = () => pieces.some(piece => piece._rapierInkSpan === span && _rapierInkPenHitsPiece(points, piece, slack));
		if (mark.kind === 'free' || mark.kind === 'arrow' || mark.kind === 'end') {
			if (mark.kind === 'free' ? !pieceHit() : !hits.length && !pieceHit()) continue;
			ranges.marks.push(span);
			const range = words[0].range.cloneRange(), end = words[words.length - 1].range;
			range.setEnd(end.endContainer, end.endOffset); ranges.push(range);
		} else if (hits.length) {
			ranges.marks.push(span);
			for (const word of hits) ranges.push(word.range);
		} else if (pieceHit()) {
			// A ring or bracket can be touched outside its words. The nearest marked word owns that part of the mark.
			let nearest = null, distance = Infinity;
			for (const word of words) for (const rect of word.rects) for (const point of points) {
				const dx = Math.max(rect.left - point.x, 0, point.x - rect.right), dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
				if (dx * dx + dy * dy < distance) { nearest = word; distance = dx * dx + dy * dy; }
			}
			if (nearest) { ranges.push(nearest.range); ranges.marks.push(span); }
		}
	}
	// Show both ends of an arrow: erasing either removes the paired annotation in the same Undo.
	for (const span of ranges.marks.slice()) {
		const mark = doors.spec.parseInkBody(span.getAttribute('data-rapier-ink'));
		if (mark?.id == null) continue;
		for (const other of host.querySelectorAll(doors.draw.SPAN_SELECTOR)) {
			if (ranges.marks.includes(other)) continue;
			if (doors.spec.parseInkBody(other.getAttribute('data-rapier-ink'))?.id !== mark.id) continue;
			const range = document.createRange(); range.selectNodeContents(other);
			ranges.push(range); ranges.marks.push(other);
		}
	}
	return ranges;
}

// The stroke on one block's words (the pen's lift, after the kind is read): the anchor words, the opener, and the document's own
// door; words that cross an earlier stroke's edge keep the longest run that can take a pair.
function _rapierInkPenLand(host, state, stroke, doors, set, kind, tailOnly, em) {
	const { spec, ink } = doors, points = stroke.points, b = ink.bounds(points), { words } = set;
	// A ring that encloses no word, or an underline beyond every word's reach, is likewise a free mark on the nearest words.
	let anchor = ink.anchorStroke(tailOnly ? [points[0]] : points, kind, words, em);
	if (!anchor && kind !== 'free') { kind = 'free'; anchor = ink.anchorStroke(points, kind, words, em); }
	if (!anchor) return false;
	const unit = em / 100;
	// The opener and the words' range for the words from `from` to `to`; the frame and the offset follow the words chosen. A pair
	// stays inside one table cell.
	const attempt = (from, to, quiet) => {
		const chosen = words.slice(from, to);
		if (!chosen.length || chosen.some(w => w.group !== chosen[0].group)) return false;
		const frame = from === anchor.start && to === anchor.end ? anchor.frame : ink.unionBox(chosen.map(w => w.box));
		const at = kind === 'bracket' || kind === 'free' ? [Math.round((b.x - frame.x) * 100 / em), Math.round((b.y - frame.y) * 100 / em)] : null;
		let origin, size;
		if (kind === 'free') { origin = { x: frame.x + at[0] * unit, y: frame.y + at[1] * unit }; size = { width: b.width, height: b.height }; }
		else if (kind === 'bracket') { origin = { x: frame.x + at[0] * unit, y: frame.y + at[1] * unit }; size = frame; }
		else { origin = { x: frame.x, y: frame.y }; size = frame; }
		const encoded = ink.encodeStroke(points, origin, size, em);
		let opener;
		try { opener = spec.formatInkOpen({ kind, hex: state.hex, width: state.width, box: encoded.box, at, path: encoded.path }); }
		catch (_) { return false; }
		const range = document.createRange();
		range.setStart(words[from].node, words[from].offset);
		range.setEnd(words[to - 1].node, words[to - 1].offset + words[to - 1].length);
		const selection = _rapierInkPenSelect(range);
		let applied = false;
		try { applied = doors.apply(opener, quiet); } catch (_) { applied = false; }
		try { selection.removeAllRanges(); } catch (_) {}
		return applied;
	};
	let applied = attempt(anchor.start, anchor.end, true);
	for (let k = 1; !applied && k < anchor.end - anchor.start && k <= 20; k++) {
		applied = attempt(anchor.start, anchor.end - k, true) || attempt(anchor.start + k, anchor.end, true);
	}
	return applied || attempt(anchor.start, anchor.end, false);
}

// Every door refused (it should not happen): the stroke stays drawn where it was drawn, and the notice says it is not kept.
function _rapierInkPenRefuse(host, state, stroke, doors) {
	const live = _rapierInkPenLive(host);
	if (live) {
		const em = stroke.em || _rapierInkPenEm(stroke.target);
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', doors.draw.inkPath(stroke.points.map(p => ({ x: p.x - live.rect.left, y: p.y - live.rect.top })), .11 * em * state.width / 9, true));
		live.svg.replaceChildren(path);
		live.svg.setAttribute('data-ink-refused', '1');
		state.refused = live.svg; state.live = null;
	}
	if (typeof doors.say === 'function') doors.say('this stroke could not be saved, so it only stays on the screen');
	return false;
}

function _rapierInkPenDropRefused(host) {
	const state = host._rapierInkPen;
	if (state.refused && state.refused.parentNode) state.refused.parentNode.removeChild(state.refused);
	state.refused = null;
}

function _rapierInkPenUp(event) {
	const host = _rapierInkHost();
	const state = host && host._rapierInkPen;
	if (!state) return;
	if (state.scroll) { state.scroll.ys.delete(event.pointerId); if (!state.scroll.ys.size) state.scroll = null; event.preventDefault(); event.stopPropagation(); return; }
	if (!state.stroke || event.pointerId !== state.stroke.id) return;
	const stroke = state.stroke, doors = state.doors;
	_rapierInkPenClear(host);
	try { host.releasePointerCapture(event.pointerId); } catch (_) {}
	const { spec, ink, draw } = doors;
	const points = stroke.points;
	if (event.clientX !== points.at(-1).x || event.clientY !== points.at(-1).y) points.push({ x: event.clientX, y: event.clientY });
	const b = ink.bounds(points);
	if (stroke.erase) {
		// All words visited by this stroke leave their ink in one source edit; doodles and paired arrows leave whole.
		event.preventDefault();
		event.stopPropagation();
		state.swallowClick = true;
		if (typeof doors.erase !== 'function') return false;
		const visited = points.concat({ x: event.clientX, y: event.clientY });
		const ranges = _rapierInkPenEraseRanges(host, visited, doors, 8);
		if (!ranges.length) return false;
		try { return Promise.resolve(doors.erase(ranges, ranges.marks)).catch(() => false); } catch (_) { return false; }
	}
	// Outside explicit annotation mode, a stylus tap places the caret. Pointerdown kept selection
	// back until the gesture could be distinguished from a stroke; the engine's click now goes on.
	if (!stroke.moved && !state.down) {
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
	setTimeout(() => { state.swallowClick = false; }, 700);
	// A press while the document is finishing an edit (an undo, a paste, a composition) still draws; its pair waits for the
	// document to take a mark and is then committed, instead of the press being refused unseen.
	const commit = async () => {
		// The block under the stroke: the one its first point landed on, or the one at its middle, else the nearest to it; a block
		// with no words a span can hold (a picture, a fence, a drawing, the gap between blocks) hands the stroke to the nearest
		// blocks that have some, nearest first: the words a stroke lands on are the nearest markable ones.
		const candidates = [];
		const at = stroke.target && stroke.target.closest ? stroke.target.closest('.block-wrapper') : null;
		if (at) candidates.push(at);
		const middle = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
		const under = middle && middle.closest ? middle.closest('.block-wrapper') : null;
		if (under && !candidates.includes(under)) candidates.push(under);
		const near = [];
		for (const block of host.querySelectorAll('.block-wrapper')) {
			if (candidates.includes(block)) continue;
			const box = block.getBoundingClientRect();
			if (!box.height) continue;
			near.push({ block, d: Math.hypot(Math.max(box.left - b.x, 0, b.x - box.right), Math.max(box.top - b.y, 0, b.y - box.bottom)) });
		}
		near.sort((x, y) => x.d - y.d);
		for (const item of near) candidates.push(item.block);
		const sets = [];
		for (const candidate of candidates) {
			if (sets.length >= 6) break;
			const holder = doors.liveOf ? doors.liveOf(candidate) : candidate;
			if (!holder || !_rapierInkPenCarries(candidate)) continue;
			const found = _rapierInkPenWords(holder);
			if (found.words.length) sets.push(found);
		}
		if (!sets.length) return _rapierInkPenRefuse(host, state, stroke, doors);
		// The em is the words' own: a heading's block stands at the page's size and its words at twice that, and a mark stored in
		// the block's ems would be drawn in the words' (far from where the finger was) at the next layout.
		const em = parseFloat(getComputedStyle(sets[0].words[0].node.parentElement || host).fontSize) || 16;
		if (!state.down && ink.strokeLength(points) < ink.INK_EM.dot * em) return;
		let kind = ink.classifyStroke(points, sets[0].lines, em);
		// A straight stroke through a line of words is a strikethrough, not an unasked arrowhead.
		const arrow = kind === 'strike' || kind === 'under' || kind === 'ring' ? null : _rapierInkPenArrow(host, points, doors, em, state.hex, state.width);
		// An arrow the document refuses (both ends on the same words, or on an existing mark) is still a stroke the person drew:
		// it falls through to a free mark beside the nearest words to its tail instead of vanishing at the lift.
		let tailOnly = false;
		if (arrow) {
			let applied = false;
			try { applied = await doors.applyArrow(arrow.tail, arrow.head, arrow.mark); } catch (_) { applied = false; }
			if (applied) return applied;
			kind = 'free'; tailOnly = true;
		}
		for (const set of sets) {
			let applied = false;
			try { applied = await _rapierInkPenLand(host, state, stroke, doors, set, kind, tailOnly, em); } catch (_) { applied = false; }
			if (applied) return applied;
			kind = 'free'; tailOnly = false;
		}
		return _rapierInkPenRefuse(host, state, stroke, doors);
	};
	if (doors.allowed && !doors.allowed() && typeof doors.settled === 'function') return doors.settled().then(open => open ? commit() : false, () => false);
	return commit();
}
