// SPDX-License-Identifier: AGPL-3.0-only

const RAPIER_PINCH_ORDER = ['sm', 'md', 'lg', 'xl'];
const RAPIER_PINCH_BEGIN = { share: 0.08, pixels: 24 };
const RAPIER_PINCH_CARRY = 0.1, RAPIER_PINCH_BAND = 0.35, RAPIER_PINCH_LOOK_MS = 100, RAPIER_PINCH_EASE_MS = 300;
const RAPIER_PINCH_PILL_MS = 600, RAPIER_PINCH_WHEEL_REST_MS = 150;
const RAPIER_PINCH_OWNERS = '.rapier-image-grip, .rapier-image-move, .rapier-image-tools, img[data-rapier-image-selected], [data-rapier-diagram-edit], .section-fold-btn, .section-move-btn, .scroll-fab, input, textarea, select';

const _rapierPinch = { phase: 'idle', host: null, wheel: 0, swallowUntil: 0, indicator: null };

function _rapierPinchHost() { return document.getElementById('editor-blocks'); }

function _rapierPinchSizes() {
	return RAPIER_PINCH_ORDER.map(name => parseFloat(FONT_SIZES[name]));
}
function _rapierPinchNow() { return RAPIER_PINCH_ORDER.indexOf(RapierPreferences.read('fontSize')); }

function _rapierPinchMayStart(event, host) {
	if (!host || host.hidden || event.touches.length !== 2 || document.body.classList.contains('rapier-draw-open')) return false;
	const a = event.touches[0], b = event.touches[1];
	const mid = document.elementFromPoint((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
	for (const node of [a.target, b.target, mid]) {
		if (!(node instanceof Element) || !host.contains(node) || node.closest(RAPIER_PINCH_OWNERS)) return false;
		if (node.closest('.table-scroll-wrap[data-rapier-wide]')) return false;
	}
	return true;
}

const _rapierPinchFingers = touches => {
	const a = touches[0], b = touches[1];
	return { span: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1, x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
};

function _rapierPinchStart(event) {
	const state = _rapierPinch, host = _rapierPinchHost();
	if (state.phase === 'swapping') { if (state.transition) state.transition.skipTransition(); state.finish(); }
	if (event.touches.length !== 2) { if (state.phase === 'armed') _rapierPinchDisarm(); return; }
	if (!_rapierPinchMayStart(event, host)) return;
	const fingers = _rapierPinchFingers(event.touches);
	if (state.phase === 'settling') {
		cancelAnimationFrame(state.frame); state.frame = 0;
		const { scale, dx, dy } = state.shown, box = host.getBoundingClientRect();
		const ox = 0, oy = fingers.y - box.top;
		const dx0 = dx + (1 - scale) * (state.ox - ox), dy0 = dy + (1 - scale) * (state.oy - oy);
		host.style.transformOrigin = ox + 'px ' + oy + 'px';
		Object.assign(state, { phase: 'zooming', ox, oy, dx0, dy0, dx: dx0, dy: dy0, span0: fingers.span, mid0: fingers, base: scale, samples: [], scale, target: scale });
		_rapierPinchListen(true);
		_rapierPinchPaint();
		return;
	}
	Object.assign(state, { phase: 'armed', host, span0: fingers.span, mid0: fingers });
	_rapierPinchListen(true);
}

function _rapierPinchListen(on) {
	const method = on ? 'addEventListener' : 'removeEventListener';
	document[method]('touchmove', _rapierPinchMove, { capture: true, passive: false });
	document[method]('touchend', _rapierPinchEnd, { capture: true, passive: false });
	document[method]('touchcancel', _rapierPinchEnd, { capture: true, passive: false });
}

function _rapierPinchDisarm() {
	_rapierPinch.phase = 'idle';
	_rapierPinchListen(false);
}

function _rapierPinchMove(event) {
	const state = _rapierPinch;
	if (event.touches.length < 2) return;
	const fingers = _rapierPinchFingers(event.touches);
	if (state.phase === 'armed') {
		const least = Math.max(RAPIER_PINCH_BEGIN.share * state.span0, RAPIER_PINCH_BEGIN.pixels);
		if (Math.abs(fingers.span - state.span0) <= least) return;
		_rapierPinchBegin(event, fingers);
	}
	if (state.phase !== 'zooming') return;
	if (event.cancelable) event.preventDefault();
	_rapierPinchTrack(fingers.span / state.span0 * state.base, fingers.x - state.mid0.x, fingers.y - state.mid0.y);
}

function _rapierPinchBegin(event, fingers) {
	const state = _rapierPinch, host = state.host;
	const was = { overflowY: host.style.overflowY };
	host.style.overflowY = 'hidden';
	host.style.willChange = 'transform';
	const pen = host._rapierInkPen;
	if (pen && pen.scroll) pen.scroll = null;
	host._rapierBlankPress = null; host._rapierGapPress = null;
	for (const touch of event.touches) { const wrapper = touch.target.closest && touch.target.closest('.block-wrapper'); if (wrapper) wrapper._rapierEditTap = null; }
	state.swallowUntil = performance.now() + 1500;
	const box = host.getBoundingClientRect();
	Object.assign(state, {
		phase: 'zooming', was, anchor: _rapierPinchAnchor(host, fingers.x, fingers.y), at: { x: fingers.x, y: fingers.y },
		span0: fingers.span, mid0: fingers, base: 1, scale: 1, target: 1, dx: 0, dy: 0, dx0: 0, dy0: 0, by: box.top, samples: [], ox: 0, oy: fingers.y - box.top,
		shown: { scale: 1, dx: 0, dy: 0 },
	});
	host.style.transformOrigin = state.ox + 'px ' + state.oy + 'px';
	_rapierPinchIndicate(true, _rapierPinchNow());
}

function _rapierPinchAnchor(host, x, y) {
	let at = null;
	const caret = document.caretPositionFromPoint ? document.caretPositionFromPoint(x, y) : null;
	let node = caret && caret.offsetNode, offset = caret ? caret.offset : 0;
	if (!node && document.caretRangeFromPoint) { const range = document.caretRangeFromPoint(x, y); node = range && range.startContainer; offset = range ? range.startOffset : 0; }
	if (node && node.nodeType === 3 && host.contains(node)) {
		const range = document.createRange();
		range.setStart(node, Math.min(offset, node.data.length)); range.collapse(true);
		const box = range.getClientRects()[0];
		if (box && Math.abs(box.top + box.height / 2 - y) < 40) at = { range, drop: y - box.top };
	}
	if (at) return at;
	const wrapper = document.elementFromPoint(x, y)?.closest(':is(#editor-blocks, #editor-blocks > .block-sleep-group) > .block-wrapper');
	if (!wrapper) return null;
	const box = wrapper.getBoundingClientRect();
	return { wrapper, share: Math.min(1, Math.max(0, (y - box.top) / Math.max(1, box.height))) };
}

function _rapierPinchDraw(raw) {
	const sizes = _rapierPinchSizes(), now = sizes[_rapierPinchNow()] || sizes[1];
	const least = sizes[0] / now, most = sizes[3] / now;
	if (raw > most) return most * (1 + RAPIER_PINCH_BAND * Math.log(raw / most));
	if (raw < least) return least / (1 + RAPIER_PINCH_BAND * Math.log(least / raw));
	return raw;
}

function _rapierPinchTrack(raw, dx, dy) {
	const state = _rapierPinch, now = performance.now();
	state.target = _rapierPinchDraw(raw);
	state.dx = 0; state.dy = state.dy0 + dy;
	state.samples.push({ at: now, ln: Math.log(state.target) });
	while (state.samples.length > 2 && now - state.samples[0].at > 90) state.samples.shift();
	state.rawTarget = raw;
	_rapierPinchIndicate(true, _rapierPinchLanding(state.target).index);
	if (!state.frame) state.frame = requestAnimationFrame(() => { state.frame = 0; if (state.phase === 'zooming') { state.scale = state.target; _rapierPinchPaint(); } });
}

function _rapierPinchPaint() {
	const state = _rapierPinch, host = state.host;
	state.shown = { scale: state.scale, dx: state.dx, dy: state.dy };
	host.style.transform = 'translate(' + state.dx + 'px,' + state.dy + 'px) scale(' + state.scale + ')';
}

function _rapierPinchLanding(scale) {
	const state = _rapierPinch, sizes = _rapierPinchSizes(), now = sizes[_rapierPinchNow()] || sizes[1];
	const stamp = performance.now(), recent = state.samples.filter(sample => stamp - sample.at < 90);
	const first = recent[0], last = recent[recent.length - 1];
	const rate = first && last && last.at > first.at ? (last.ln - first.ln) / (last.at - first.at) : 0;
	const aimed = Math.log(scale ?? state.scale) + Math.max(-RAPIER_PINCH_CARRY, Math.min(RAPIER_PINCH_CARRY, rate * RAPIER_PINCH_LOOK_MS));
	let best = 0, gap = Infinity;
	sizes.forEach((size, index) => { const away = Math.abs(Math.log(size / now) - aimed); if (away < gap) { gap = away; best = index; } });
	return { index: best, ratio: sizes[best] / now, speed: rate * state.scale };
}

function _rapierPinchEnd(event) {
	const state = _rapierPinch;
	if (event.touches && event.touches.length >= 2) return;
	_rapierPinchListen(false);
	if (state.phase === 'armed') { state.phase = 'idle'; return; }
	if (state.phase !== 'zooming') return;
	if (event.cancelable) event.preventDefault();
	_rapierPinchRelease();
}

function _rapierPinchRelease() {
	const state = _rapierPinch;
	cancelAnimationFrame(state.frame); state.frame = 0;
	state.scale = state.target;
	const landing = _rapierPinchLanding();
	state.phase = 'settling'; state.landing = landing;
	const omega = 5.8 / (RAPIER_PINCH_EASE_MS / 1000), from = state.scale, start = performance.now();
	const lead = from - landing.ratio, push = landing.speed * 1000 + omega * lead;
	_rapierPinchIndicate(true, landing.index);
	const tick = () => {
		state.frame = 0;
		if (state.phase !== 'settling') return;
		const seconds = (performance.now() - start) / 1000, decay = Math.exp(-omega * seconds);
		const scale = landing.ratio + (lead + push * seconds) * decay;
		const done = seconds > RAPIER_PINCH_EASE_MS * 2.2 / 1000 || (seconds > 0.1 && Math.abs(scale - landing.ratio) < 0.0015);
		state.scale = done ? landing.ratio : scale;
		_rapierPinchPaint();
		if (done) { _rapierPinchSwap(); return; }
		state.frame = requestAnimationFrame(tick);
	};
	state.frame = requestAnimationFrame(tick);
}

function _rapierPinchSwap() {
	const state = _rapierPinch, host = state.host, landing = state.landing, name = RAPIER_PINCH_ORDER[landing.index];
	const apply = () => {
		const changed = name !== RapierPreferences.read('fontSize');
		const shown = state.shown, anchor = state.anchor;
		if (changed) RapierPreferences.write('fontSize', name);
		host.style.transform = ''; host.style.transformOrigin = ''; host.style.willChange = '';
		host.style.overflowY = state.was.overflowY;
		if (changed && globalThis.RapierImageFlow) globalThis.RapierImageFlow.layoutNow();
		if (changed && anchor) {
			const drawn = state.by + state.oy + shown.scale * (state.at.y - state.by - state.oy) + shown.dy;
			let moved = 0;
			if (anchor.range) { const box = anchor.range.getClientRects()[0]; if (box) moved = box.top + anchor.drop - drawn; }
			else if (anchor.wrapper && anchor.wrapper.isConnected) { const box = anchor.wrapper.getBoundingClientRect(); moved = box.top + anchor.share * box.height - drawn; }
			if (Math.abs(moved) > 0.5) { if (typeof _rapierNoteViewportWrite === 'function') _rapierNoteViewportWrite(); host.scrollTop += moved; }
		}
	};
	const done = () => { state.phase = 'idle'; state.anchor = null; state.transition = null; _rapierPinchIndicate(false); };
	state.phase = 'swapping';
	state.finish = () => { document.documentElement.classList.remove('rapier-pinch-swap'); done(); };
	const quiet = typeof document.startViewTransition !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches || name === RapierPreferences.read('fontSize');
	if (quiet) { apply(); done(); return; }
	const root = document.documentElement;
	root.classList.add('rapier-pinch-swap');
	try {
		const transition = state.transition = document.startViewTransition(apply);
		const clean = () => { if (state.transition === transition) state.finish(); };
		transition.finished.then(clean, clean);
	} catch (_) { root.classList.remove('rapier-pinch-swap'); apply(); done(); }
}

function _rapierPinchWheel(event) {
	if (!event.ctrlKey) return;
	const state = _rapierPinch, host = _rapierPinchHost();
	if (!host || !(event.target instanceof Element) || !host.contains(event.target) || event.target.closest(RAPIER_PINCH_OWNERS)) return;
	event.preventDefault();
	if (state.phase === 'swapping' || state.phase === 'armed') return;
	if (state.phase === 'settling') {
		cancelAnimationFrame(state.frame); state.frame = 0;
		Object.assign(state, { phase: 'zooming', dx0: state.shown.dx, dy0: state.shown.dy, base: state.shown.scale, scale: state.shown.scale, samples: [], mid0: { x: 0, y: 0 }, raw: state.shown.scale, wheeled: true });
	} else if (state.phase === 'idle') {
		const box = host.getBoundingClientRect(), fingers = { x: event.clientX, y: event.clientY, span: 1 };
		const was = { overflowY: host.style.overflowY };
		host.style.overflowY = 'hidden'; host.style.willChange = 'transform';
		Object.assign(state, { host, phase: 'zooming', was, anchor: _rapierPinchAnchor(host, fingers.x, fingers.y), at: { x: fingers.x, y: fingers.y }, mid0: fingers, span0: 1, base: 1,
			scale: 1, target: 1, dx: 0, dy: 0, dx0: 0, dy0: 0, by: box.top, samples: [], ox: 0, oy: fingers.y - box.top, shown: { scale: 1, dx: 0, dy: 0 }, raw: 1, wheeled: true });
		host.style.transformOrigin = state.ox + 'px ' + state.oy + 'px';
	}
	const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
	state.raw *= Math.exp(-Math.max(-25, Math.min(25, event.deltaY * unit)) * 0.01);
	_rapierPinchTrack(state.raw, 0, 0);
	clearTimeout(state.wheel);
	state.wheel = setTimeout(() => { if (state.phase === 'zooming' && state.wheeled) { state.wheeled = false; _rapierPinchRelease(); } }, RAPIER_PINCH_WHEEL_REST_MS);
}

function _rapierPinchIndicate(on, index) {
	const state = _rapierPinch;
	clearTimeout(state.pillTimer);
	if (!on) {
		state.pillTimer = setTimeout(() => state.indicator?.classList.remove('rapier-pinch-pill--on'), RAPIER_PINCH_PILL_MS);
		return;
	}
	let pill = state.indicator;
	if (!pill) {
		pill = state.indicator = document.createElement('div');
		pill.className = 'rapier-pinch-pill';
		pill.setAttribute('aria-hidden', 'true');
		for (const word of ['S', 'M', 'L', 'XL']) { const part = document.createElement('span'); part.textContent = word; pill.appendChild(part); }
		document.body.appendChild(pill);
	}
	[...pill.children].forEach((part, at) => part.toggleAttribute('data-lit', at === index));
	pill.classList.add('rapier-pinch-pill--on');
}

const RAPIER_PAGE_ZOOM = { least: 1, most: 4, band: 0.25, ease: 220 };
const _rapierPageZoom = { phase: 'idle' };
function _rapierPageView() { return document.documentElement.dataset.layout === 'docx'; }
function _rapierPageDesk() { return document.getElementById('document-main'); }
function _rapierPageZoomNow(host) { return Number(host.style.getPropertyValue('--rapier-page-zoom')) || 1; }
function _rapierPageZoomMayStart(event, host) {
	const desk = _rapierPageDesk();
	if (!host || !desk || event.touches.length !== 2 || document.body.classList.contains('rapier-draw-open')) return false;
	for (const touch of event.touches) if (!(touch.target instanceof Element) || !desk.contains(touch.target) || touch.target.closest(RAPIER_PINCH_OWNERS)) return false;
	return true;
}
function _rapierPageZoomBegin(host, x, y, span) {
	const state = _rapierPageZoom, box = host.getBoundingClientRect(), shown = Number(getComputedStyle(host).zoom) || 1;
	const scale = Number(host.style.getPropertyValue('--docx-scale')) || shown;
	Object.assign(state, { phase: 'zooming', host, base: _rapierPageZoomNow(host), scale, u: (x - box.left) / scale, v: (y - box.top) / scale,
		x0: x, y0: y, x, y, span0: span, factor: 1, frame: 0 });
	host.style.transformOrigin = (x - box.left) / shown + 'px ' + (y - box.top) / shown + 'px';
	host.style.willChange = 'transform';
	_rapierPinch.swallowUntil = performance.now() + 1500;
}
function _rapierPageZoomClamp(raw, base, band = true) {
	const least = RAPIER_PAGE_ZOOM.least / base, most = RAPIER_PAGE_ZOOM.most / base;
	if (!band) return Math.min(most, Math.max(least, raw));
	if (raw > most) return most * (1 + RAPIER_PAGE_ZOOM.band * Math.log(raw / most));
	if (raw < least) return least / (1 + RAPIER_PAGE_ZOOM.band * Math.log(least / raw));
	return raw;
}
function _rapierPageZoomDraw() {
	const state = _rapierPageZoom, shown = Number(getComputedStyle(state.host).zoom) || 1;
	state.frame = 0;
	state.host.style.transform = 'translate(' + (state.x - state.x0) / shown + 'px,' + (state.y - state.y0) / shown + 'px) scale(' + state.factor + ')';
}
function _rapierPageZoomTrack(factor, x, y) {
	const state = _rapierPageZoom;
	state.factor = _rapierPageZoomClamp(factor, state.base); state.x = x; state.y = y;
	if (!state.frame) state.frame = requestAnimationFrame(_rapierPageZoomDraw);
}
function _rapierPageZoomSettle() {
	const state = _rapierPageZoom, host = state.host, desk = _rapierPageDesk();
	cancelAnimationFrame(state.frame); state.frame = 0;
	const factor = _rapierPageZoomClamp(state.factor, state.base, false), zoom = state.base * factor;
	host.style.transform = ''; host.style.transformOrigin = ''; host.style.willChange = '';
	if (Math.abs(zoom - 1) < 0.01) host.style.removeProperty('--rapier-page-zoom'); else host.style.setProperty('--rapier-page-zoom', String(zoom));
	const scale = state.scale * factor;
	host.style.setProperty('--docx-scale', String(scale));
	const box = host.getBoundingClientRect();
	if (desk) { desk.scrollLeft += box.left + state.u * scale - state.x; desk.scrollTop += box.top + state.v * scale - state.y; }
	state.phase = 'idle';
	if (typeof _rapierDocumentPart !== 'undefined' && _rapierDocumentPart?.sync) _rapierDocumentPart.sync();
}
function _rapierPageZoomStart(event) {
	const host = _rapierPinchHost(), state = _rapierPageZoom;
	if (state.phase === 'zooming' || !_rapierPageZoomMayStart(event, host)) return;
	const fingers = _rapierPinchFingers(event.touches);
	state.phase = 'armed'; state.host = host; state.armed = fingers;
	const move = moveEvent => {
		if (moveEvent.touches.length < 2) return;
		const now = _rapierPinchFingers(moveEvent.touches);
		if (state.phase === 'armed') {
			if (Math.abs(now.span - state.armed.span) <= Math.max(RAPIER_PINCH_BEGIN.share * state.armed.span, RAPIER_PINCH_BEGIN.pixels)) return;
			_rapierPageZoomBegin(host, state.armed.x, state.armed.y, state.armed.span);
		}
		if (moveEvent.cancelable) moveEvent.preventDefault();
		_rapierPageZoomTrack(now.span / state.span0, now.x, now.y);
	};
	const end = endEvent => {
		if (endEvent.touches && endEvent.touches.length >= 2) return;
		document.removeEventListener('touchmove', move, true); document.removeEventListener('touchend', end, true); document.removeEventListener('touchcancel', end, true);
		if (state.phase === 'armed') { state.phase = 'idle'; return; }
		if (endEvent.cancelable) endEvent.preventDefault();
		_rapierPageZoomSettle();
	};
	document.addEventListener('touchmove', move, { capture: true, passive: false });
	document.addEventListener('touchend', end, { capture: true, passive: false });
	document.addEventListener('touchcancel', end, { capture: true, passive: false });
}
function _rapierPageZoomWheel(event) {
	const state = _rapierPageZoom, host = _rapierPinchHost(), desk = _rapierPageDesk();
	if (!event.ctrlKey || !host || !desk || !(event.target instanceof Element) || !desk.contains(event.target) || event.target.closest(RAPIER_PINCH_OWNERS)) return;
	event.preventDefault();
	if (state.phase !== 'zooming') { _rapierPageZoomBegin(host, event.clientX, event.clientY, 1); state.raw = 1; }
	const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
	state.raw *= Math.exp(-Math.max(-25, Math.min(25, event.deltaY * unit)) * 0.01);
	_rapierPageZoomTrack(state.raw, state.x0, state.y0);
	clearTimeout(state.wheel);
	state.wheel = setTimeout(() => { if (state.phase === 'zooming') _rapierPageZoomSettle(); }, RAPIER_PINCH_WHEEL_REST_MS);
}

(function _rapierPinchInstall() {
	const host = _rapierPinchHost();
	if (!host) return;
	const desk = _rapierPageDesk();
	const start = event => _rapierPageView() ? _rapierPageZoomStart(event) : _rapierPinchStart(event);
	const wheel = event => _rapierPageView() ? _rapierPageZoomWheel(event) : _rapierPinchWheel(event);
	(desk || host).addEventListener('touchstart', start, { capture: true, passive: true });
	(desk || host).addEventListener('wheel', wheel, { capture: true, passive: false });
	for (const name of ['gesturestart', 'gesturechange']) (desk || host).addEventListener(name, event => event.preventDefault(), { capture: true, passive: false });
	host.addEventListener('click', event => {
		if (performance.now() > _rapierPinch.swallowUntil) return;
		event.preventDefault(); event.stopPropagation();
	}, true);
})();
