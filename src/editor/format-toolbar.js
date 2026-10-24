const _rapierFormatToolbarMedia = typeof matchMedia === 'function' ? {
	wide: matchMedia('(min-width: 900px)'),
	anyHover: matchMedia('(any-hover: hover)'),
	anyFine: matchMedia('(any-pointer: fine)'),
} : null;
const _RAPIER_FORMAT_TOOLBAR_EDGE_FADE_DISTANCE = 46;
function _rapierFormatToolbarEdgeAlphas(scrollLeft, maximum, edge = _RAPIER_FORMAT_TOOLBAR_EDGE_FADE_DISTANCE) {
	const max = Math.max(0, Number(maximum) || 0);
	if (max <= 1) return { left: 1, right: 1 };
	const distance = Math.max(1, Number(edge) || _RAPIER_FORMAT_TOOLBAR_EDGE_FADE_DISTANCE);
	const left = Math.max(0, Math.min(max, Number(scrollLeft) || 0));
	const clamp = value => Math.max(0, Math.min(1, value));
	return {
		left: 1 - clamp(left / distance),
		right: 1 - clamp((max - left) / distance),
	};
}
function _rapierSyncFormatToolbarEdgeFade(surface = FT.surface()) {
	if (!surface || !FT.get()?.classList.contains('visible')) return;
	const scrolls = /auto|scroll/.test(getComputedStyle(surface).overflowX);
	const maximum = scrolls ? Math.max(0, surface.scrollWidth - surface.clientWidth) : 0;
	const alpha = _rapierFormatToolbarEdgeAlphas(surface.scrollLeft, maximum);
	const left = alpha.left.toFixed(3), right = alpha.right.toFixed(3);
	if (surface.style.getPropertyValue('--format-toolbar-left-edge-alpha') !== left) surface.style.setProperty('--format-toolbar-left-edge-alpha', left);
	if (surface.style.getPropertyValue('--format-toolbar-right-edge-alpha') !== right) surface.style.setProperty('--format-toolbar-right-edge-alpha', right);
}
const _rapierFormatToolbarFadeSurface = FT.surface();
_rapierFormatToolbarFadeSurface?.addEventListener('scroll', () => {
	_rapierSyncFormatToolbarEdgeFade(_rapierFormatToolbarFadeSurface);
}, { passive: true });
const _RAPIER_FORMAT_TOOLBAR_PAN_SLOP = 4;
const _rapierFormatToolbarPan = Object.seal({ pointerId: -1, startX: 0, startY: 0, startLeft: 0, startTop: 0, moved: false, lastX: 0, lastT: 0, velocity: 0, fling: 0, panel: false, scroller: null });
function _rapierFormatToolbarStopFling() {
	if (_rapierFormatToolbarPan.fling) cancelAnimationFrame(_rapierFormatToolbarPan.fling);
	_rapierFormatToolbarPan.fling = 0;
}
_rapierFormatToolbarFadeSurface?.addEventListener('pointerdown', event => {
	if (event.button != null && event.button !== 0) return;
	const surface = _rapierFormatToolbarFadeSurface, pan = _rapierFormatToolbarPan;
	_rapierFormatToolbarStopFling();
	if (surface.scrollWidth - surface.clientWidth <= 0) return;
	pan.pointerId = event.pointerId;
	pan.panel = false;
	pan.scroller = null;
	pan.startX = pan.lastX = event.clientX;
	pan.startLeft = surface.scrollLeft;
	pan.lastT = event.timeStamp;
	pan.velocity = 0;
	pan.moved = false;
});
_rapierFormatToolbarFadeSurface?.addEventListener('pointermove', event => {
	const pan = _rapierFormatToolbarPan;
	if (pan.panel || event.pointerId !== pan.pointerId) return;
	const surface = _rapierFormatToolbarFadeSurface;
	const dx = event.clientX - pan.startX;
	if (!pan.moved) {
		if (Math.abs(dx) < _RAPIER_FORMAT_TOOLBAR_PAN_SLOP) return;
		pan.moved = true;
		try { surface.setPointerCapture(event.pointerId); } catch (_) {}
	}
	const dt = Math.max(1, event.timeStamp - pan.lastT);
	pan.velocity = 0.6 * pan.velocity + 0.4 * ((event.clientX - pan.lastX) / dt);
	pan.lastX = event.clientX;
	pan.lastT = event.timeStamp;
	surface.scrollLeft = pan.startLeft - dx;
	event.preventDefault();
});
function _rapierFormatToolbarPanEnd(event) {
	const pan = _rapierFormatToolbarPan, surface = _rapierFormatToolbarFadeSurface;
	if (pan.panel || event.pointerId !== pan.pointerId) return;
	try { surface.releasePointerCapture(event.pointerId); } catch (_) {}
	pan.pointerId = -1;
	if (!pan.moved) return;
	pan.moved = false;
	const swallow = click => { click.stopPropagation(); click.preventDefault(); };
	surface.addEventListener('click', swallow, { capture: true, once: true });
	setTimeout(() => surface.removeEventListener('click', swallow, { capture: true }), 0);
	if (matchMedia('(prefers-reduced-motion: reduce)').matches || event.type !== 'pointerup' || event.timeStamp - pan.lastT > 80 || Math.abs(pan.velocity) < 0.05) return;
	let velocity = -pan.velocity, last = performance.now();
	const step = now => {
		const dt = Math.min(48, Math.max(0, now - last));
		last = now;
		const maximum = Math.max(0, surface.scrollWidth - surface.clientWidth);
		surface.scrollLeft = Math.max(0, Math.min(maximum, surface.scrollLeft + velocity * dt));
		velocity *= Math.exp(-dt / 320);
		const atEdge = velocity > 0 ? surface.scrollLeft >= maximum - 0.5 : surface.scrollLeft <= 0.5;
		if (atEdge || Math.abs(velocity) < 0.02) { pan.fling = 0; return; }
		pan.fling = requestAnimationFrame(step);
	};
	pan.fling = requestAnimationFrame(step);
}
_rapierFormatToolbarFadeSurface?.addEventListener('wheel', event => {
	const surface = _rapierFormatToolbarFadeSurface;
	const maximum = surface.scrollWidth - surface.clientWidth;
	if (maximum <= 0) return;
	const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
	if (!delta) return;
	const next = Math.max(0, Math.min(maximum, surface.scrollLeft + delta));
	if (next === surface.scrollLeft) return;
	surface.scrollLeft = next;
	event.preventDefault();
});
function _rapierFormatPanelScroller(target) {
	if (!target?.closest || target.closest('.format-toolbar__scroll, input[type="range"]')) return null;
	const panel = target.closest('.color-picker,.highlight-picker,.heading-picker,.hr-style-picker,.font-picker,.ink-strip,.math-strip');
	if (!panel || !panel.classList.contains('visible')) return null;
	const preview = target.closest('.math-strip__preview');
	if (preview && panel.contains(preview) &&
			(preview.scrollWidth > preview.clientWidth + 1 || preview.scrollHeight > preview.clientHeight + 1)) return preview;
	return panel;
}
function _rapierFormatPanelPointerDown(event) {
	if (event.button != null && event.button !== 0) return;
	const scroller = _rapierFormatPanelScroller(event.target);
	if (!scroller) return;
	const pan = _rapierFormatToolbarPan;
	pan.pointerId = event.pointerId;
	pan.panel = true;
	pan.startX = event.clientX;
	pan.startY = event.clientY;
	pan.startLeft = scroller.scrollLeft || 0;
	pan.startTop = scroller.scrollTop || 0;
	pan.moved = false;
	pan.scroller = scroller;
}
function _rapierFormatPanelPointerMove(event) {
	const pan = _rapierFormatToolbarPan;
	if (!pan.panel || event.pointerId !== pan.pointerId || !pan.scroller) return;
	if (event.cancelable) event.preventDefault();
	const dy = event.clientY - pan.startY;
	const dx = event.clientX - pan.startX;
	if (!pan.moved) {
		if (Math.abs(dy) < _RAPIER_FORMAT_TOOLBAR_PAN_SLOP && Math.abs(dx) < _RAPIER_FORMAT_TOOLBAR_PAN_SLOP) return;
		pan.moved = true;
		try { pan.scroller.setPointerCapture(event.pointerId); } catch (_) {}
	}
	const scroller = pan.scroller;
	const maxX = Math.max(0, (scroller.scrollWidth || 0) - (scroller.clientWidth || 0));
	const maxY = Math.max(0, (scroller.scrollHeight || 0) - (scroller.clientHeight || 0));
	if (maxX > 0) scroller.scrollLeft = Math.max(0, Math.min(maxX, pan.startLeft - dx));
	if (maxY > 0) scroller.scrollTop = Math.max(0, Math.min(maxY, pan.startTop - dy));
}
function _rapierFormatPanelPointerEnd(event) {
	const pan = _rapierFormatToolbarPan;
	if (!pan.panel || event.pointerId !== pan.pointerId) return;
	const stack = FT.stack();
	try { pan.scroller?.releasePointerCapture(event.pointerId); } catch (_) {}
	try { stack?.releasePointerCapture(event.pointerId); } catch (_) {}
	pan.pointerId = -1;
	pan.panel = false;
	pan.scroller = null;
	if (!pan.moved) return;
	pan.moved = false;
	const swallow = click => { click.stopPropagation(); click.preventDefault(); };
	stack?.addEventListener('click', swallow, { capture: true, once: true });
	setTimeout(() => stack?.removeEventListener('click', swallow, { capture: true }), 0);
}
function _rapierFormatToolbarListen() {
	const end = () => {
		const pan = _rapierFormatToolbarPan;
		if (pan.panel) _rapierFormatPanelPointerEnd({pointerId: pan.pointerId});
	};
	_rapierFormatToolbarFadeSurface?.addEventListener('pointerup', _rapierFormatToolbarPanEnd);
	_rapierFormatToolbarFadeSurface?.addEventListener('pointercancel', _rapierFormatToolbarPanEnd);
	FT.stack()?.addEventListener('pointerdown', _rapierFormatPanelPointerDown);
	FT.stack()?.addEventListener('pointermove', _rapierFormatPanelPointerMove);
	window.addEventListener('pointerup', _rapierFormatPanelPointerEnd, true);
	window.addEventListener('pointercancel', _rapierFormatPanelPointerEnd, true);
	document.addEventListener('touchend', event => { if (!event.touches?.length) end(); }, true);
	document.addEventListener('touchcancel', end, true);
	document.addEventListener('touchmove', event => {
		if (_rapierFormatToolbarPan.panel && event.cancelable) event.preventDefault();
	}, {passive: false, capture: true});
	window.addEventListener('scroll', _rapierScheduleFormatToolbarPosition, { passive: true });
}
_rapierFormatToolbarListen();
function _rapierPreferredFormatToolbarRect(range, selection) {
	if (!range) return null;
	try {
		const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 || rect.height > 0);
		if (rects.length) return _rapierSelectionIsBackward(selection) ? rects[0] : rects[rects.length - 1];
		const bounds = range.getBoundingClientRect();
		return bounds && (bounds.width > 0 || bounds.height > 0) ? bounds : null;
	} catch (_) { return null; }
}
function _rapierFormatToolbarAnchorBottom(geometry) {
	const layoutBottom = Math.max(0, Number(geometry.layoutBottom) || 0);
	const inset = Math.max(0, Number(geometry.nativeBottomInset) || 0);
	const offsetTop = Math.max(0, Number(geometry.offsetTop) || 0);
	const scale = geometry.scale > 0 ? Number(geometry.scale) : 1;
	const visualKnown = geometry.visualHeight != null && geometry.visualHeight !== undefined;
	const visualBottom = visualKnown ? offsetTop + Math.max(0, Number(geometry.visualHeight) || 0) : layoutBottom;
	const ime = Math.max(0, Number(geometry.imeBottom) || 0);
	const imeEdge = _rapierImeVisibleBottom(layoutBottom, ime, geometry.windowHeight);
	const imeCovers = ime > 0 && imeEdge < layoutBottom - 0.5;
	const windowHeight = Math.max(0, Number(geometry.windowHeight) || 0);
	const layoutAlreadyShort = windowHeight > 0 && layoutBottom + inset < windowHeight - 1;
	const edges = [visualBottom];
	if (!layoutAlreadyShort) edges.push(Math.max(0, layoutBottom - inset));
	if (imeCovers) edges.push(offsetTop + imeEdge / scale);
	return Math.max(0, Math.min(...edges));
}
function _rapierFormatToolbarAnchorGeometry() {
	const vv = window.visualViewport;
	return {
		layoutBottom: _rapierLayoutClientBottom(),
		nativeBottomInset: _rapierNativeBottomInset(),
		offsetTop: vv ? vv.offsetTop : 0,
		scale: vv && vv.scale > 0 ? vv.scale : 1,
		visualHeight: vv ? vv.height : null,
		imeBottom: _rapierCssPx('--native-ime-bottom'),
		windowHeight: _rapierCssPx('--native-window-height'),
	};
}
function _rapierPositionTouchFormatToolbar(stack, toolbar) {
	if (!stack || !toolbar) return;
	const geometry = _rapierFormatToolbarAnchorGeometry();
	const anchor = _rapierFormatToolbarAnchorBottom(geometry);
	const bottom = (Math.round(geometry.layoutBottom - anchor) - 1) + 'px';
	const moved = stack.style.bottom !== bottom || (stack.style.top && stack.style.top !== 'auto');
	if (stack.style.top && stack.style.top !== 'auto') stack.style.top = 'auto';
	if (stack.style.bottom !== bottom) stack.style.bottom = bottom;
	const visible = Math.max(0, anchor - Math.max(0, geometry.offsetTop || 0));
	const toolbarRow = toolbar.offsetHeight || 0;
	const topBar = document.querySelector('.top-bar')?.getBoundingClientRect().height || 0;
	const room = Math.max(48, Math.round(visible - topBar - toolbarRow - 44));
	const roomValue = room + 'px';
	if (stack.style.getPropertyValue('--rapier-format-panel-max') !== roomValue) stack.style.setProperty('--rapier-format-panel-max', roomValue);
	const open = stack.querySelector('.heading-picker.visible,.color-picker.visible,.highlight-picker.visible,.hr-style-picker.visible,.font-picker.visible,.ink-strip.visible,.math-strip.visible');
	let panelScroll = false;
	if (open) {
		for (const panel of stack.querySelectorAll('.heading-picker.visible,.color-picker.visible,.highlight-picker.visible,.hr-style-picker.visible,.font-picker.visible,.ink-strip.visible,.math-strip.visible')) {
			if (panel.scrollHeight > room + 1) { panelScroll = true; break; }
		}
	}
	const flag = panelScroll ? 'true' : 'false';
	if (stack.dataset.panelScroll !== flag) stack.dataset.panelScroll = flag;
	renderFormatToolbarVisibility(toolbar, true, toolbar.dataset.excerptOnly === 'true');
	if (moved) _rapierScheduleToastLift();
}
function _rapierPositionFormatToolbar() {
	_rapierToolbarRuntime.positionFrame = 0;
	const stack = FT.stack();
	const toolbar = FT.get();
	if (!stack || !toolbar || !toolbar.classList.contains('visible')) return;
	_rapierPositionTouchFormatToolbar(stack, toolbar);
}
function _rapierScheduleFormatToolbarPosition() {
	if (_rapierToolbarRuntime.positionFrame) return;
	_rapierToolbarRuntime.positionFrame = requestAnimationFrame(_rapierPositionFormatToolbar);
}
function _rapierFormatToolbarButtonAvailable(button) {
	return !!button && !button.hidden && getComputedStyle(button).display !== 'none';
}
function _rapierHandleFormatToolbarKeydown(event) {
	if (!event || event.defaultPrevented || !event.target?.closest?.('.fmt-btn')) return;
	const key = event.key;
	if (!/^(?:ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End)$/.test(key)) return;
	const picker = event.target.closest('.heading-picker,.highlight-picker,.hr-style-picker,.color-picker,.ink-strip');
	const scope = picker || FT.get();
	if (!scope) return;
	const buttons = Array.from(scope.querySelectorAll('.fmt-btn:not([disabled])'))
		.map(button => button.matches('label') ? button.querySelector('input:not([disabled])') : button)
		.filter(button => button && !button.closest('[hidden],[inert]') && button.getClientRects().length);
	if (!buttons.length) return;
	const current = Math.max(0, buttons.indexOf(event.target.closest('input,.fmt-btn')));
	let next = current;
	if (key === 'Home') next = 0;
	else if (key === 'End') next = buttons.length - 1;
	else if (key === 'ArrowLeft' || key === 'ArrowUp') next = (current - 1 + buttons.length) % buttons.length;
	else next = (current + 1) % buttons.length;
	event.preventDefault();
	buttons.forEach(button => { button.tabIndex = button === buttons[next] ? 0 : -1; });
	buttons[next].focus({ preventScroll: true });
	buttons[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
const _rapierFormatToolbarStack = FT.stack();
_rapierFormatToolbarStack?.addEventListener('keydown', _rapierHandleFormatToolbarKeydown);
_rapierFormatToolbarStack?.addEventListener('focusin', event => {
	const button = event.target?.closest?.('#format-toolbar .fmt-btn');
	if (button) _rapierSyncFormatToolbarRoving(button);
});
function _rapierFormatToolbarHeight() {
	const stack = FT.stack();
	const toolbar = FT.get();
	if (!stack || !toolbar || !toolbar.classList.contains('visible')) return 0;
	return Math.max(0, stack.getBoundingClientRect().height || stack.offsetHeight || 0);
}
function _rapierBarStandsFor(context) {
	return _rapierSelectionActionableForFormat(context, true) && (context.wrappers.length < 2 || _rapierWrappersCanTakeMark(context.wrappers));
}
function _rapierCollapsedCaretSupportsFormatToolbar(context) {
	const edit = context?.editDiv;
	const wrapper = edit?.closest('.block-wrapper');
	return !!(edit && edit.isContentEditable && wrapper && !wrapper.classList.contains('block-wrapper--source-edit'));
}
function _rapierShowFormatToolbar(toolbar, excerptCandidate, excerptOnly) {
	if (!toolbar) return;
	const button = document.getElementById('fmt-complete-excerpt');
	const controlsChanged = !!button && button.hidden !== !excerptCandidate;
	if (controlsChanged) button.hidden = !excerptCandidate;
	const surface = FT.surface();
	const wasVisible = toolbar.classList.contains('visible');
	const visibilityChanged = renderFormatToolbarVisibility(toolbar, true, excerptOnly);
	if (!visibilityChanged && !controlsChanged) return;
	if (!wasVisible && surface) surface.scrollLeft = 0;
	rapierRepositionFormatToolbar();
}
function updateFormatToolbarActiveStates(selection, boundary) {
	const stack = FT.stack();
	if (!stack) return;
	stack.querySelectorAll('.fmt-btn[data-active]').forEach(button => button.removeAttribute('data-active'));
	stack.querySelectorAll('.fmt-btn[aria-pressed]:not([aria-pressed="false"])').forEach(button => button.setAttribute('aria-pressed', 'false'));
	stack.querySelectorAll('.fmt-btn[role="menuitemradio"]:not([aria-checked="false"])').forEach(button => button.setAttribute('aria-checked', 'false'));

	_rapierPaintColorLetter(null);
	_rapierUpdateAlignmentButton(selection);
	if (!selection || !selection.rangeCount) return;
	let node = selection.anchorNode;
	if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement;

	while (node && node !== boundary && node !== document.body) {
		const tag = node.tagName?.toLowerCase() || '';
		const typing = _rapierTypingStyle(node);
		if (typing.bold || tag === 'strong' || tag === 'b') _setActive('bold');
		if (typing.italic || tag === 'em' || tag === 'i') _setActive('italic');
		if (typing.strikethrough || tag === 's' || tag === 'del' || tag === 'strike') _setActive('strikethrough');
		if (typing.underline || tag === 'u' || tag === 'ins') _setActive('underline');
		if (tag === 'code') _setActive('code');
		if (tag === 'a') _setActive('link');
		if (tag === 'mark' || typing.highlight) {
			const color = typing.highlight || _rapierHighlightColor(node.getAttribute('data-rapier-highlight')) || 'default';
			_setActive('highlight-picker');
			_setActive('highlight-' + color);
		}
		if (typing.color || tag === 'span' && node.hasAttribute('data-md-color')) {
			const hex = typing.color || String(node.getAttribute('data-md-color') || '').toLowerCase();
			if (/^#[0-9a-f]{6}$/.test(hex)) {
				_setActive('color-picker');
				const swatch = document.getElementById('color-picker')?.querySelector('[data-value="' + hex + '"]');
				if (swatch) {
					swatch.setAttribute('data-active', '');
					if (swatch.getAttribute('role') === 'menuitemradio') swatch.setAttribute('aria-checked', 'true');
				}
				const custom = document.getElementById('color-picker-custom-input');
				if (custom) custom.value = hex;
				_rapierPaintColorLetter(hex);
			}
		}
		if (/^h[1-6]$/.test(tag)) {
			_setActive(`h${tag[1]}`);
			_setActive('text-style');
		}
		node = node.parentElement;
	}
	const pending = boundary && boundary._rapierTypingMarks;
	if (pending && selection.isCollapsed && selection.rangeCount &&
			pending.root.contains(selection.getRangeAt(0).startContainer) &&
			_rapierStableLiveOffset(pending.root, selection.getRangeAt(0).startContainer, selection.getRangeAt(0).startOffset) === pending.caret) {
		for (const [mark, on] of Object.entries(pending.marks)) {
			if (mark === 'highlight' || mark === 'color') {
				if (on !== 'none') { _setActive(mark + '-picker'); if (mark === 'highlight') _setActive('highlight-' + on); }
				continue;
			}
			const button = stack.querySelector(`.fmt-btn[data-cmd="${mark}"]`);
			if (on) _setActive(mark);
			else if (button) { button.removeAttribute('data-active'); button.setAttribute('aria-pressed', 'false'); }
		}
	}
}
function _rapierPaintColorLetter(hex) {
	const letter = document.getElementById('fmt-btn-color')?.querySelector('.fmt-color-letter');
	if (letter && letter.style.stroke !== (hex || '')) letter.style.stroke = hex || '';
}
function _rapierClearDesktopFormatToolbarPlacement() {
	const stack = FT.stack();
	if (!stack) return;
	stack.style.removeProperty('left');
	stack.style.removeProperty('top');
	stack.style.removeProperty('bottom');
	stack.style.removeProperty('width');
	stack.style.removeProperty('height');
	stack.style.removeProperty('min-height');
	stack.style.removeProperty('max-width');
	stack.style.removeProperty('max-height');
	stack.style.removeProperty('overflow-y');
	stack.style.removeProperty('visibility');
	delete stack.dataset.placement;
	delete stack.dataset.overlap;
}
function _rapierFormatToolbarModalityChanged() {
	_rapierClearDesktopFormatToolbarPlacement();
	refreshFormatToolbar();
	_rapierSyncFormatToolbarEdgeFade();
	_rapierScheduleFormatToolbarPosition();
	_rapierScheduleKeyboardAccommodation();
}
if (_rapierFormatToolbarMedia) {
	const capabilityChanged = () => {
		if (!_rapierFormatToolbarMedia.anyHover.matches && !_rapierFormatToolbarMedia.anyFine.matches &&
				_rapierInteractionRuntime.recentPointerModality === 'fine') {
			_rapierInteractionRuntime.recentPointerModality = '';
		}
		_rapierFormatToolbarModalityChanged();
	};
	Object.values(_rapierFormatToolbarMedia).forEach(query => {
		if (typeof query.addEventListener === 'function') query.addEventListener('change', capabilityChanged);
		else if (typeof query.addListener === 'function') query.addListener(capabilityChanged);
	});
}
function _rapierRememberToolbarSelection(selection, editDiv) {
	if (!selection || !selection.rangeCount) return;
	try {
		const range = selection.getRangeAt(0);
		if (!_rangeIntersectsEditor(range)) return;
		_rapierToolbarRuntime.range = range.cloneRange();
		_rapierToolbarRuntime.editDiv = editDiv && editDiv.isConnected ? editDiv : null;
		_rapierToolbarRuntime.selectionBackward = _rapierSelectionIsBackward(selection);

		_rapierToolbarRuntime.editLength = _rapierToolbarRuntime.editDiv ? (_rapierToolbarRuntime.editDiv.textContent || '').length : null;
	} catch (_) {}
}
