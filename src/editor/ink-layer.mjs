// SPDX-License-Identifier: AGPL-3.0-only
// RAPIER_INK_LAYER_MODULE */ (tools/build.mjs satelliteSlots). The grammar, the geometry, the drawing

function _rapierInkHost() {
	return document.getElementById('editor-blocks');
}

function _rapierInkState(host) {
	return host._rapierInk || (host._rapierInk = { frame: 0, observer: null, resize: null, pieces: [], spec: null, ink: null, draw: null, dark: null });
}

function _rapierInkLayerOf(host) {
	const state = _rapierInkState(host);
	return state.draw ? state.draw.inkLayerOf(host, 'end') : null;
}

function _rapierInkDraw(host) {
	const state = _rapierInkState(host);
	state.frame = 0;
	if (!state.spec || !state.ink || !state.draw) return;
	const layer = host.querySelector(':scope > .' + state.draw.LAYER_CLASS);
	if (layer && !layer.firstElementChild && !host.querySelector(state.draw.SPAN_SELECTOR)) { state.pieces = []; return; }
	state.pieces = state.draw.drawInk(host, { spec: state.spec, ink: state.ink, dark: state.dark, place: 'end' });
}

function _rapierInkSchedule(host) {
	const state = _rapierInkState(host);
	if (state.frame) return;
	state.frame = requestAnimationFrame(() => _rapierInkDraw(host));
}

function _rapierInkOnResize() {
	const host = _rapierInkHost();
	if (host) _rapierInkSchedule(host);
}

function _rapierInkOnMutation(records) {
	const host = _rapierInkHost();
	if (!host) return;
	for (const record of records) {
		const target = record.target;
		const element = target.nodeType === 1 ? target : target.parentElement;
		if (element && element.closest && element.closest('.rapier-ink-layer')) continue;
		_rapierInkSchedule(host);
		return;
	}
}

function _rapierInkInstall(spec, ink, draw, dark) {
	const host = _rapierInkHost();
	if (!host || !spec || !ink || !draw) return;
	const state = _rapierInkState(host);
	state.spec = spec; state.ink = ink; state.draw = draw; state.dark = typeof dark === 'function' ? dark : null;
	if (state.observer) { _rapierInkSchedule(host); return; }
	state.observer = new MutationObserver(_rapierInkOnMutation);
	state.observer.observe(host, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'data-rapier-ink', 'hidden'] });
	if (typeof ResizeObserver === 'function') {
		state.resize = new ResizeObserver(_rapierInkOnResize);
		state.resize.observe(host);
	}
	window.addEventListener('resize', _rapierInkOnResize);
	if (document.fonts && typeof document.fonts.addEventListener === 'function') document.fonts.addEventListener('loadingdone', _rapierInkOnResize);
	_rapierInkSchedule(host);
}
