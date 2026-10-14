
const _rapierSheetGesture = Object.seal({
	host: null,
	mode: '', input: '', touchId: null, pointerId: null,
	startX: 0, startY: 0, startTime: 0, axis: null,
	overlay: null, panel: null, plane: 'x', anchor: 'edge',
	offset: 0, width: 360, active: false, settling: false,
	timer: 0, suppressClickUntil: 0,
});

function _rapierSheetGesturePanel() {
	return _rapierSheetGesture.panel || _rapierSheetGesture.host.settings().panel;
}

function _rapierSheetGestureOverlay() {
	return _rapierSheetGesture.overlay || _rapierSheetGesture.host.settings().overlay;
}

function _rapierSheetExtent() {
	const panel = _rapierSheetGesturePanel();
	if (_rapierSheetGesture.plane !== 'y') return Math.max(1, panel.offsetWidth || Math.min(360, window.innerWidth || 360));
	if (_rapierSheetGesture.anchor === 'center') {
		const top = panel.getBoundingClientRect().top;
		return Math.max(1, (window.innerHeight || document.documentElement.clientHeight || 560) - top);
	}
	return Math.max(1, panel.offsetHeight || Math.min(560, window.innerHeight || 560));
}

function _rapierSheetAtScrollStart(target, panel) {
	let node = target instanceof Element ? target : null;
	while (node) {
		if (node.scrollHeight - node.clientHeight > 1 && node.scrollTop > 0) return false;
		if (node === panel) break;
		node = node.parentElement;
	}
	return true;
}

function _rapierSheetTargetLocked(target) {
	if (!(target instanceof Element)) return false;
	if (target.closest('input[type="range"],.range-wrap,[data-range-owner]')) return true;
	return !!target.closest(
		'.link-dialog input:not([type="checkbox"]):not([type="radio"]),.link-dialog select,.link-dialog textarea'
	);
}

function renderSheetDrag(offset, transitionMs) {
	const panel = _rapierSheetGesturePanel();
	const overlay = _rapierSheetGestureOverlay();
	if (offset === null) {
		panel.style.removeProperty('transform');
		panel.style.removeProperty('transition');

		if (!panel.classList.contains('command-palette')) panel.style.removeProperty('animation');
		panel.classList.remove('rapier-settings-gesture-active');
		overlay.style.removeProperty('opacity');
		overlay.style.removeProperty('transition');
		_rapierSheetGesture.offset = 0;
		return;
	}
	const extent = Math.max(1, _rapierSheetGesture.width || _rapierSheetExtent());
	const value = Math.min(extent, Math.max(0, Number(offset) || 0));
	const duration = Math.max(0, Number(transitionMs) || 0);

	panel.style.animation = 'none';
	panel.style.transition = duration > 0 ? 'transform ' + duration + 'ms var(--ease-out)' : 'none';
	panel.style.transform = _rapierSheetGesture.plane === 'y'
		? 'translate3d(0,' + value.toFixed(1) + 'px,0)'
		: 'translate3d(' + value.toFixed(1) + 'px,0,0)';
	panel.classList.toggle('rapier-settings-gesture-active', _rapierSheetGesture.axis === 'along');
	overlay.style.transition = duration > 0 ? 'opacity ' + duration + 'ms var(--ease-out)' : 'none';
	overlay.style.opacity = String(Math.max(0, 1 - value / extent).toFixed(3));
	_rapierSheetGesture.offset = value;
}

function _rapierSheetGestureReset() {
	_rapierSheetGesture.mode = '';
	_rapierSheetGesture.input = '';
	_rapierSheetGesture.touchId = null;
	_rapierSheetGesture.pointerId = null;
	_rapierSheetGesture.axis = null;
	_rapierSheetGesture.active = false;
	_rapierSheetGesture.overlay = null;
	_rapierSheetGesture.panel = null;
	_rapierSheetGesture.plane = 'x';
	_rapierSheetGesture.anchor = 'edge';
}

function _rapierSheetGestureBegin(mode, x, y, id, input, target, sheet) {
	const host = _rapierSheetGesture.host;
	if (_rapierSheetGesture.settling || _rapierSheetGesture.active) return false;
	if (mode === 'opening' && _rapierUiDialogIsOpen(host.settings().overlay)) return false;
	if (mode === 'closing') {
		if (!sheet || !host.dismissable(sheet.overlay)) return false;

		if (sheet.panel.matches('.command-palette,.info-action-sheet') &&
				(!target?.closest?.('.command-palette__header,.track-action-head') || target.closest('button'))) return false;
		if (sheet.plane === 'y' && !_rapierSheetAtScrollStart(target, sheet.panel)) return false;
	}
	if (_rapierSheetTargetLocked(target)) return false;
	clearTimeout(_rapierSheetGesture.timer);
	const settings = host.settings();
	_rapierSheetGesture.overlay = sheet ? sheet.overlay : settings.overlay;
	_rapierSheetGesture.panel = sheet ? sheet.panel : settings.panel;
	_rapierSheetGesture.plane = sheet ? sheet.plane : 'x';
	_rapierSheetGesture.anchor = sheet ? (sheet.anchor || 'edge') : 'edge';
	_rapierSheetGesture.mode = mode;
	_rapierSheetGesture.input = input;
	_rapierSheetGesture.touchId = input === 'touch' ? id : null;
	_rapierSheetGesture.pointerId = input === 'pointer' ? id : null;
	_rapierSheetGesture.startX = x;
	_rapierSheetGesture.startY = y;
	_rapierSheetGesture.startTime = _rapierNow();
	_rapierSheetGesture.axis = null;
	_rapierSheetGesture.width = _rapierSheetExtent();
	_rapierSheetGesture.active = true;
	if (mode === 'opening') {

		renderSheetDrag(_rapierSheetGesture.width, 0);
		host.prepareOpen();
		_rapierUiRaise(settings.overlay);
		renderEdgeSwipe();
	}
	return true;
}

function _rapierSheetGestureMove(x, y, event) {
	if (!_rapierSheetGesture.active) return;
	const dx = x - _rapierSheetGesture.startX;
	const dy = y - _rapierSheetGesture.startY;
	const along = _rapierSheetGesture.plane === 'y' ? dy : dx;
	const across = _rapierSheetGesture.plane === 'y' ? dx : dy;
	const direction = _rapierSheetGesture.mode === 'closing' ? along : -along;
	if (!_rapierSheetGesture.axis) {
		const absAlong = Math.abs(along), absAcross = Math.abs(across);
		if (Math.max(absAlong, absAcross) < 7) return;
		if (absAcross >= absAlong * 1.12) { _rapierSheetGesture.axis = 'across'; _rapierSheetGestureAbandon(); return; }
		if (absAlong < absAcross * .82) return;
		if (direction <= 0) { _rapierSheetGesture.axis = 'wrong-way'; _rapierSheetGestureAbandon(); return; }
		_rapierSheetGesture.axis = 'along';
		_rapierSheetGesture.suppressClickUntil = _rapierNow() + 420;
	}
	if (_rapierSheetGesture.axis !== 'along') return;
	if (event && event.cancelable) event.preventDefault();
	const travelled = Math.min(_rapierSheetGesture.width, Math.max(0, direction));
	renderSheetDrag(_rapierSheetGesture.mode === 'closing'
		? travelled : _rapierSheetGesture.width - travelled, 0);
}

function _rapierSheetGestureEnd(x, y, event, cancelled) {
	if (!_rapierSheetGesture.active) return;
	const mode = _rapierSheetGesture.mode;
	const dx = x - _rapierSheetGesture.startX;
	const dy = y - _rapierSheetGesture.startY;
	const along = _rapierSheetGesture.plane === 'y' ? dy : dx;
	const across = _rapierSheetGesture.plane === 'y' ? dx : dy;
	const travelling = _rapierSheetGesture.axis === 'along' && Math.abs(along) >= Math.abs(across) * 1.04;

	if (!travelling) {
		if (mode === 'opening') _rapierSheetGesture.host.setSettingsOpen(false, 'dismiss');
		renderSheetDrag(null);
		_rapierSheetGestureReset();
		renderEdgeSwipe();
		return;
	}
	const distance = Math.max(0, mode === 'closing' ? along : -along);
	const elapsed = Math.max(1, _rapierNow() - _rapierSheetGesture.startTime);
	const velocity = distance / elapsed;
	const cancellationCommit = cancelled && distance >= Math.max(48, _rapierSheetGesture.width * .14);
	const committed = cancellationCommit || (!cancelled &&
		(distance >= Math.max(72, _rapierSheetGesture.width * .22) || (distance >= 30 && velocity >= .48)));
	if (event && event.cancelable) event.preventDefault();
	_rapierSheetGesture.suppressClickUntil = _rapierNow() + 420;
	_rapierSheetGestureSettle(mode === 'closing' ? !committed : committed);
}

function _rapierSheetGestureSettle(targetOpen) {
	const host = _rapierSheetGesture.host;
	const extent = Math.max(1, _rapierSheetGesture.width || _rapierSheetExtent());
	const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
	const duration = reduced ? 0 : 180;
	const overlay = _rapierSheetGestureOverlay();
	const settings = overlay === host.settings().overlay;
	_rapierSheetGesture.active = false;
	_rapierSheetGesture.settling = true;
	renderSheetDrag(targetOpen ? 0 : extent, duration);
	clearTimeout(_rapierSheetGesture.timer);
	_rapierSheetGesture.timer = setTimeout(() => {
		renderSheetDrag(null);
		if (settings) host.setSettingsOpen(!!targetOpen, targetOpen ? '' : 'dismiss');
		else if (!targetOpen) host.dismiss(overlay);
		_rapierSheetGesture.settling = false;
		_rapierSheetGestureReset();
		renderEdgeSwipe();
	}, duration ? duration + 24 : 0);
}

function _rapierSheetGestureAbandon() {
	if (!_rapierSheetGesture.active) return;
	if (_rapierSheetGesture.mode === 'opening') _rapierSheetGesture.host.setSettingsOpen(false, 'dismiss');
	_rapierSheetGesture.active = false;
	renderSheetDrag(null);
	_rapierSheetGestureReset();
	renderEdgeSwipe();
}

function _rapierSheetGestureFinishWithoutPoint(cancelled) {
	if (!_rapierSheetGesture.active) return;
	if (_rapierSheetGesture.axis !== 'along') {
		if (_rapierSheetGesture.mode === 'opening') _rapierSheetGesture.host.setSettingsOpen(false, 'dismiss');
		renderSheetDrag(null);
		_rapierSheetGestureReset();
		renderEdgeSwipe();
		return;
	}
	const mode = _rapierSheetGesture.mode;
	const distance = mode === 'closing'
		? _rapierSheetGesture.offset
		: Math.max(0, _rapierSheetGesture.width - _rapierSheetGesture.offset);
	const threshold = cancelled
		? Math.max(48, _rapierSheetGesture.width * .14)
		: Math.max(72, _rapierSheetGesture.width * .22);
	_rapierSheetGestureSettle(mode === 'closing' ? distance < threshold : distance >= threshold);
}

function renderEdgeSwipe() {
	const host = _rapierSheetGesture.host;
	if (!host) return;
	host.edge.classList.toggle('active',
		!_rapierUiDialogIsOpen(host.settings().overlay) && !_rapierSheetGesture.settling);
}

function _rapierSheetGestureInstall(host) {
	_rapierSheetGesture.host = host;
	const point = (event, changed) => {
		const list = changed ? event.changedTouches : event.touches;
		if (!list) return null;
		for (let index = 0; index < list.length; index += 1) {
			if (_rapierSheetGesture.touchId == null ||
					list[index].identifier === _rapierSheetGesture.touchId) return list[index];
		}
		return null;
	};
	document.addEventListener('touchstart', event => {
		if (!event || event.touches?.length !== 1 || _rapierSheetGesture.active ||
				_rapierSheetGesture.settling) return;
		const touch = event.changedTouches?.[0] || event.touches[0];
		if (!touch) return;
		const target = event.target instanceof Element ? event.target : null;
		const sheet = host.sheetFor(target);
		if (sheet) {
			_rapierSheetGestureBegin('closing', touch.clientX, touch.clientY, touch.identifier, 'touch',
				target, sheet);
			return;
		}

		if (document.querySelector('.settings-overlay.open') || host.edgeBlocked?.()) return;
		if (!host.edge.classList.contains('active')) return;
		const rect = host.edge.getBoundingClientRect();

		if (touch.clientX < rect.left || touch.clientX > rect.right || touch.clientY > rect.bottom) return;
		if (target && target.closest('.scroll-fab,.rapier-image-grip,.rapier-image-move,[data-rapier-diagram-edit],img[data-rapier-image-selected]')) return;
		_rapierSheetGestureBegin('opening', touch.clientX, touch.clientY, touch.identifier, 'touch',
			target || host.edge);
	}, { capture: true, passive: true });
	document.addEventListener('scroll', event => {
		const node = event.target;
		if (!(node instanceof Element) || !node.closest('.restore-modal-overlay .settings-panel,.pro-sheet,.link-dialog')) return;
		node.toggleAttribute('data-rapier-scrolled', node.scrollTop > 0);
	}, { capture: true, passive: true });
	document.addEventListener('touchmove', event => {
		if (!_rapierSheetGesture.active || _rapierSheetGesture.input !== 'touch') return;
		const touch = point(event, false);
		if (touch) _rapierSheetGestureMove(touch.clientX, touch.clientY, event);
	}, { capture: true, passive: false });
	for (const [name, cancelled] of [['touchend', false], ['touchcancel', true]]) {
		document.addEventListener(name, event => {
			if (!_rapierSheetGesture.active || _rapierSheetGesture.input !== 'touch') return;
			const touch = point(event, true);
			if (!touch) { _rapierSheetGestureFinishWithoutPoint(cancelled); return; }
			_rapierSheetGestureEnd(touch.clientX, touch.clientY, event, cancelled);
		}, { capture: true, passive: false });
	}

	const owns = () => _rapierSheetGesture.active && _rapierSheetGesture.input === 'pointer';
	document.addEventListener('pointerdown', event => {
		if (!event || event.pointerType === 'touch' || event.isPrimary === false ||
				(event.button != null && event.button !== 0)) return;
		const sheet = host.sheetFor(event.target);
		if (sheet) _rapierSheetGestureBegin('closing', event.clientX, event.clientY, event.pointerId, 'pointer',
			event.target, sheet);
	}, { capture: true });
	const step = (name, handler) => document.addEventListener(name, event => {
		if (!owns() || event.pointerId !== _rapierSheetGesture.pointerId) return;
		handler(event);
	}, { capture: true });
	step('pointermove', event => _rapierSheetGestureMove(event.clientX, event.clientY, event));
	step('pointerup', event => _rapierSheetGestureEnd(event.clientX, event.clientY, event, false));
	step('pointercancel', event => _rapierSheetGestureEnd(event.clientX, event.clientY, event, true));

	document.addEventListener('click', event => {
		if (_rapierNow() >= _rapierSheetGesture.suppressClickUntil) return;
		event.preventDefault();
		event.stopImmediatePropagation();
	}, true);
	renderEdgeSwipe();
}
