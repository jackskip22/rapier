
function _rapierPopArrange(row) {
	if (!row || typeof row.querySelectorAll !== 'function') return null;
	const boxes = Array.from(row.querySelectorAll(':scope > [data-pop]'));
	const shown = boxes.filter(box => !box.hidden);
	const destructive = shown.some(box => box.dataset.pop === 'destructive');
	const rank = box => box.dataset.pop === 'destructive' ? 2 : box.dataset.pop === 'cancel' ? (destructive ? 1 : 3) : 0;
	const ordered = boxes.map((box, at) => [box, at]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(pair => pair[0]);
	for (const box of boxes) { box.removeAttribute('data-pop-bottom'); box.removeAttribute('data-pop-top'); }
	if (ordered.some((box, at) => box !== boxes[at])) row.append(...ordered);
	const last = shown.length ? ordered.filter(box => !box.hidden).at(-1) : null;
	if (last && rank(last) >= 2) last.setAttribute('data-pop-bottom', '');
	const top = last?.hasAttribute('data-pop-bottom') ? ordered.find(box => !box.hidden && box.dataset.pop === 'affirm') : null;
	if (top && top !== last) top.setAttribute('data-pop-top', '');
	row.classList.add('rapier-pop__actions');
	return last && last.hasAttribute('data-pop-bottom') ? last : null;
}

function _rapierPopArrangeAll(root) {
	for (const row of (root || document).querySelectorAll('[data-pop-row]')) _rapierPopArrange(row);
}

_rapierPopArrangeAll(document);

const _rapierProgressOpen = (() => {
	const rows = new Set();
	let element = null, returnFocus = null;
	const restoreFocus = () => _rapierModalReturnFocus(returnFocus);
	function paint() {
		const row = [...rows].at(-1);
		if (!row) {
			const ownedFocus = element?.contains(document.activeElement);
			element?.remove(); element = null;
			if (ownedFocus) restoreFocus();
			return;
		}
		if (element && !element.isConnected) element = null;
		if (!element) {
			element = document.createElement('div');
			element.className = 'rapier-progress';
			element.addEventListener('focusin', event => {
				if (event.relatedTarget && !element.contains(event.relatedTarget)) returnFocus = event.relatedTarget;
			});
			const line = document.createElement('div'), words = document.createElement('span'), bar = document.createElement('div');
			line.className = 'rapier-progress__row'; words.className = 'rapier-progress__label';
			words.id = 'rapier-progress-label'; words.setAttribute('role', 'status'); words.setAttribute('aria-atomic', 'true');
			bar.setAttribute('aria-labelledby', words.id);
			bar.className = 'rapier-progress__bar'; bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100');
			line.append(words); element.append(line, bar);
			(document.getElementById('toast-root') || document.body).append(element);
		}
		const label = element.querySelector('.rapier-progress__label'), bar = element.querySelector('.rapier-progress__bar');
		if (label.textContent !== row.label) label.textContent = row.label;
		const button = element.querySelector('.rapier-progress__cancel');
		if (!row.cancel) {
			const ownedFocus = button === document.activeElement;
			button?.remove();
			if (ownedFocus) restoreFocus();
		}
		else if (!button || button.__rapierRow !== row) {
			const ownedFocus = button === document.activeElement;
			button?.remove();
			const next = document.createElement('button');
			next.type = 'button'; next.className = 'rapier-progress__cancel'; next.textContent = 'Cancel'; next.__rapierRow = row;
			next.addEventListener('click', () => { try { row.cancel(); } finally { row.end(); } });
			element.querySelector('.rapier-progress__row').append(next);
			if (ownedFocus) next.focus({preventScroll: true});
		}
		const known = typeof row.fraction === 'number';
		bar.toggleAttribute('data-running', !known);
		if (known) { bar.setAttribute('aria-valuenow', String(Math.round(row.fraction * 100))); bar.style.setProperty('--rapier-progress', String(row.fraction)); }
		else { bar.removeAttribute('aria-valuenow'); bar.style.removeProperty('--rapier-progress'); }
	}
	return function open({label = '', after = 0, cancel = null} = {}) {
		const row = {label: String(label), cancel: typeof cancel === 'function' ? cancel : null, fraction: null, timer: 0};
		const show = () => { row.timer = 0; rows.add(row); paint(); };
		if (after > 0) row.timer = setTimeout(show, after); else show();
		row.end = () => { clearTimeout(row.timer); row.timer = 0; if (rows.delete(row)) paint(); };
		row.now = () => { if (!row.timer) return false; clearTimeout(row.timer); show(); return true; };
		row.set = (fraction = null, words) => {
			row.fraction = typeof fraction === 'number' && Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : null;
			if (words != null) row.label = String(words);
			if (rows.has(row)) paint();
		};
		return row;
	};
})();

function _rapierProgressOver(overlay, untilClose = false) {
	let home = null, count = 0;
	const place = here => {
		const root = home?.root || document.getElementById('toast-root');
		if (!root) return;
		if (here && root.parentElement !== overlay) { home = {root, parent: root.parentElement, next: root.nextSibling}; overlay.append(root); }
		else if (!here && home) {
			const {parent, next} = home, into = parent?.isConnected ? parent : document.body;
			home = null;
			into.insertBefore(root, next?.parentNode === into ? next : null);
		}
		_rapierApplyModalIsolation();
		_rapierScheduleToastLift();
	};
	return {
		open(options) {
			if (!count++) place(true);
			const row = _rapierProgressOpen(options);
			let live = true;
			return {set: row.set, end() { if (!live) return; live = false; row.end(); if (!--count && !untilClose) place(false); }};
		},
		notice() { place(true); },
		release() { count = 0; place(false); },
	};
}

// RAPIER_PROGRESS_AHEAD characters (half a second at a phone's speed: a 10 MB file takes 12 s to open at CPU 4) shows the popup
const RAPIER_PROGRESS_AHEAD = 524288;
async function _rapierProgressAhead(size, options) {
	if (!(size > RAPIER_PROGRESS_AHEAD)) return _rapierProgressOpen({after: 500, ...options});
	const row = _rapierProgressOpen({...options, after: 0});
	await _rapierProgressPainted();
	return row;
}
function _rapierProgressPainted() { return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0)))); }

function _rapierPluginProgress(key, noun) {
	const popup = _rapierProgressOpen({label: 'Downloading ' + noun, after: 500});
	const follow = event => {
		const {status, progress} = event.detail || {};
		if (status === 'downloading') popup.set(progress > 0 ? progress / 100 : null, 'Downloading ' + noun);
		else if (status === 'installing') popup.set(null, 'Installing ' + noun);
		else if (status !== 'checking') end();
	};
	const end = () => { window.removeEventListener('rapier:' + key + 'plugin', follow); popup.end(); };
	window.addEventListener('rapier:' + key + 'plugin', follow);
	return end;
}

function _rapierProgressTask({label = '', current = null, after = 500, size = 0, signal: callerSignal = null} = {}) {
	const controller = new AbortController();
	const signal = controller.signal;
	const cancel = () => controller.abort();
	const ahead = size > RAPIER_PROGRESS_AHEAD, opened = performance.now();
	const progress = _rapierProgressOpen({label, after: ahead ? 0 : after, cancel});
	if (callerSignal?.aborted) cancel();
	else callerSignal?.addEventListener('abort', cancel, {once: true});
	let ended = false, reported = null, needsPaint = ahead;
	const check = () => {
		if (!signal.aborted && current && !current()) cancel();
		if (signal.aborted) throw new DOMException('Canceled', 'AbortError');
	};
	const set = (fraction, words) => {
		if (ended) return;
		if (typeof fraction === 'number' && Number.isFinite(fraction)) reported = Math.max(reported ?? 0, fraction);
		else if (fraction === null) reported = null;
		progress.set(reported, words);
	};
	const end = () => { if (ended) return; ended = true; callerSignal?.removeEventListener('abort', cancel); progress.end(); };
	const yieldWork = async (fraction, words) => {
		check();
		if (fraction !== undefined || words !== undefined) set(fraction, words);
		if (performance.now() - opened >= after && progress.now()) needsPaint = true;
		if (needsPaint) { needsPaint = false; await _rapierProgressPainted(); }
		else await _rapierYieldUserVisibleWork();
		check();
	};
	return Object.freeze({signal, cancel, check, set, onProgress: set, yield: yieldWork, end});
}
