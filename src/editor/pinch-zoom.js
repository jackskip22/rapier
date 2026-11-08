// SPDX-License-Identifier: AGPL-3.0-only

const RAPIER_PINCH_BEGIN = { share: 0.08, pixels: 24 };
const RAPIER_VIEW_ZOOM = { least: 1, most: 4, band: 0.25 };
const RAPIER_PINCH_WHEEL_REST_MS = 150;
const RAPIER_PINCH_OWNERS = '.rapier-image-grip, .rapier-image-move, .rapier-image-tools, img[data-rapier-image-selected], [data-rapier-diagram-edit], .section-fold-btn, .section-move-btn, .scroll-fab, input, textarea, select';

const _rapierPinch = { phase: 'idle', host: null, wheel: 0, swallowUntil: 0, restore: null };
const RAPIER_PINCH_LIFT_MS = 350;

function _rapierPinchHost() { return document.getElementById('editor-blocks'); }

function _rapierViewZoomNow(host = _rapierPinchHost()) { return Number(host?.dataset.viewZoom) || 1; }

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
	if (event.touches.length !== 2) { if (state.phase === 'armed') _rapierPinchDisarm(); return; }
	if (!_rapierPinchMayStart(event, host)) return;
	const fingers = _rapierPinchFingers(event.touches);
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
	_rapierPinchTrack(fingers.span / state.span0, fingers.x - state.mid0.x, fingers.y - state.mid0.y);
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
	_rapierPinchHold(host, fingers);
	Object.assign(state, { span0: fingers.span, mid0: fingers, was });
}

function _rapierPinchHold(host, fingers) {
	const state = _rapierPinch, box = host.getBoundingClientRect();
	Object.assign(state, {
		host, phase: 'zooming', anchor: _rapierPinchAnchor(host, fingers.x, fingers.y), at: { x: fingers.x, y: fingers.y }, z0: _rapierViewZoomNow(host),
		scale: 1, target: 1, dx: 0, dy: 0, bx: box.left, by: box.top, ox: fingers.x - box.left, oy: fingers.y - box.top, shown: { scale: 1, dx: 0, dy: 0 },
	});
	host.style.transformOrigin = state.ox + 'px ' + state.oy + 'px';
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
		if (box && Math.abs(box.top + box.height / 2 - y) < 40) at = { range, drop: y - box.top, side: x - box.left };
	}
	if (at) return at;
	const wrapper = document.elementFromPoint(x, y)?.closest(':is(#editor-blocks, #editor-blocks > .block-sleep-group) > .block-wrapper');
	if (!wrapper) return null;
	const box = wrapper.getBoundingClientRect();
	return { wrapper, share: Math.min(1, Math.max(0, (y - box.top) / Math.max(1, box.height))), across: Math.min(1, Math.max(0, (x - box.left) / Math.max(1, box.width))) };
}

function _rapierPinchDraw(raw, band = true) {
	const z0 = _rapierPinch.z0 || 1, least = RAPIER_VIEW_ZOOM.least / z0, most = RAPIER_VIEW_ZOOM.most / z0;
	if (!band) return Math.min(most, Math.max(least, raw));
	if (raw > most) return most * (1 + RAPIER_VIEW_ZOOM.band * Math.log(raw / most));
	if (raw < least) return least / (1 + RAPIER_VIEW_ZOOM.band * Math.log(least / raw));
	return raw;
}

function _rapierPinchTrack(raw, dx, dy) {
	const state = _rapierPinch;
	state.target = _rapierPinchDraw(raw); state.rawTarget = raw;
	state.dx = dx; state.dy = dy;
	if (!state.frame) state.frame = requestAnimationFrame(() => { state.frame = 0; if (state.phase === 'zooming') { state.scale = state.target; _rapierPinchPaint(); } });
}

function _rapierPinchPaint() {
	const state = _rapierPinch, host = state.host;
	state.shown = { scale: state.scale, dx: state.dx, dy: state.dy };
	host.style.transform = 'translate(' + state.dx + 'px,' + state.dy + 'px) scale(' + state.scale + ')';
}

function _rapierPinchEnd(event) {
	const state = _rapierPinch;
	if (event.touches && event.touches.length >= 2) return;
	_rapierPinchListen(false);
	if (state.phase === 'armed') { state.phase = 'idle'; return; }
	if (state.phase !== 'zooming') return;
	if (event.cancelable) event.preventDefault();
	state.swallowUntil = performance.now() + RAPIER_PINCH_LIFT_MS;
	_rapierPinchRelease();
}

function _rapierPinchRelease() {
	const state = _rapierPinch, host = state.host;
	cancelAnimationFrame(state.frame); state.frame = 0;
	state.scale = state.target; _rapierPinchPaint();
	const shown = state.shown, factor = _rapierPinchDraw(state.target, false), zoom = (state.z0 || 1) * factor;
	const drawn = { x: state.bx + state.ox + shown.scale * (state.at.x - state.bx - state.ox) + shown.dx, y: state.by + state.oy + shown.scale * (state.at.y - state.by - state.oy) + shown.dy };
	host.style.transform = ''; host.style.transformOrigin = ''; host.style.willChange = '';
	if (state.was) host.style.overflowY = state.was.overflowY;
	_rapierViewZoomSet(host, zoom);
	const anchor = state.anchor;
	let now = null;
	if (anchor?.range) { const box = anchor.range.getClientRects()[0]; if (box) now = { x: box.left + anchor.side * zoom / (state.z0 || 1), y: box.top + anchor.drop * zoom / (state.z0 || 1) }; }
	else if (anchor?.wrapper?.isConnected) { const box = anchor.wrapper.getBoundingClientRect(); now = { x: box.left + anchor.across * box.width, y: box.top + anchor.share * box.height }; }
	if (now) {
		if (typeof _rapierNoteViewportWrite === 'function') _rapierNoteViewportWrite();
		host.scrollLeft += now.x - drawn.x; host.scrollTop += now.y - drawn.y;
	}
	state.phase = 'idle'; state.anchor = null;
}

function _rapierViewZoomSet(host, zoom) {
	if (!host) return;
	if (!(zoom > 1.01)) {
		delete host.dataset.viewZoom;
		for (const name of ['--rapier-view-zoom', '--rapier-view-width', '--rapier-view-wrap', '--rapier-view-wrap-start']) host.style.removeProperty(name);
		_rapierViewZoomRestore(false);
		if (globalThis.RapierImageFlow) globalThis.RapierImageFlow.layoutNow();
		return;
	}
	if (!host.dataset.viewZoom) {
		const box = host.getBoundingClientRect(), style = getComputedStyle(host);
		const wrapper = host.querySelector(':scope > .block-wrapper, :scope > .block-sleep-group > .block-wrapper');
		const start = box.left + parseFloat(style.paddingLeft), width = host.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
		const wrap = wrapper ? wrapper.getBoundingClientRect() : { left: start, width };
		host.style.setProperty('--rapier-view-width', width + 'px');
		host.style.setProperty('--rapier-view-wrap', wrap.width + 'px');
		host.style.setProperty('--rapier-view-wrap-start', (wrap.left - start) + 'px');
	}
	host.style.setProperty('--rapier-view-zoom', String(Math.min(RAPIER_VIEW_ZOOM.most, zoom)));
	host.dataset.viewZoom = String(Math.min(RAPIER_VIEW_ZOOM.most, zoom));
	_rapierViewZoomRestore(true);
}

function _rapierViewZoomRestore(on) {
	const state = _rapierPinch;
	if (!on) { if (state.restore) state.restore.hidden = true; return; }
	let button = state.restore;
	if (!button) {
		button = state.restore = document.createElement('button');
		button.type = 'button'; button.className = 'icon-btn rapier-view-zoom-restore';
		button.setAttribute('aria-label', 'restore page zoom'); button.dataset.tip = 'restore zoom';
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		for (const [name, value] of [['width', '24'], ['height', '24'], ['viewBox', '0 0 24 24'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2'],
			['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['aria-hidden', 'true']]) svg.setAttribute(name, value);
		path.setAttribute('d', 'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3');
		svg.append(path); button.append(svg);
		button.addEventListener('click', () => _rapierViewZoomReset());
		document.body.appendChild(button);
	}
	const settings = document.getElementById('btn-overflow'), box = settings?.getBoundingClientRect();
	if (box && box.width) {
		button.style.setProperty('--rapier-view-zoom-left', box.left + 'px');
		button.style.setProperty('--rapier-view-zoom-top', box.bottom + 'px');
	}
	button.hidden = false;
}

function _rapierViewZoomReset() {
	const host = _rapierPinchHost();
	if (!host || !host.dataset.viewZoom) return;
	const zoom = _rapierViewZoomNow(host), box = host.getBoundingClientRect();
	const middle = (host.scrollTop + box.height / 2) / zoom;
	_rapierViewZoomSet(host, 1);
	host.scrollLeft = 0; host.scrollTop = Math.max(0, middle - box.height / 2);
}

function _rapierPinchWheel(event) {
	if (!event.ctrlKey) return;
	const state = _rapierPinch, host = _rapierPinchHost();
	if (!host || !(event.target instanceof Element) || !host.contains(event.target) || event.target.closest(RAPIER_PINCH_OWNERS)) return;
	event.preventDefault();
	if (state.phase === 'armed') return;
	if (state.phase === 'idle') {
		const was = { overflowY: host.style.overflowY };
		host.style.overflowY = 'hidden'; host.style.willChange = 'transform';
		_rapierPinchHold(host, { x: event.clientX, y: event.clientY });
		Object.assign(state, { was, raw: 1, wheeled: true });
	}
	const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
	state.raw *= Math.exp(-Math.max(-25, Math.min(25, event.deltaY * unit)) * 0.01);
	_rapierPinchTrack(state.raw, 0, 0);
	clearTimeout(state.wheel);
	state.wheel = setTimeout(() => { if (state.phase === 'zooming' && state.wheeled) { state.wheeled = false; _rapierPinchRelease(); } }, RAPIER_PINCH_WHEEL_REST_MS);
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
		_rapierPinch.swallowUntil = performance.now() + RAPIER_PINCH_LIFT_MS;
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

function _rapierPinchInstall() {
	const host = _rapierPinchHost();
	if (!host) return;
	const desk = _rapierPageDesk();
	const start = event => _rapierPageView() ? _rapierPageZoomStart(event) : _rapierPinchStart(event);
	const wheel = event => _rapierPageView() ? _rapierPageZoomWheel(event) : _rapierPinchWheel(event);
	(desk || host).addEventListener('touchstart', start, { capture: true, passive: true });
	(desk || host).addEventListener('wheel', wheel, { capture: true, passive: false });
	for (const name of ['gesturestart', 'gesturechange']) (desk || host).addEventListener(name, event => event.preventDefault(), { capture: true, passive: false });
	window.addEventListener('resize', () => { if (host.dataset.viewZoom) _rapierViewZoomSet(host, 1); });
	host.addEventListener('click', event => {
		if (performance.now() > _rapierPinch.swallowUntil) return;
		event.preventDefault(); event.stopPropagation();
	}, true);
}
_rapierPinchInstall();
