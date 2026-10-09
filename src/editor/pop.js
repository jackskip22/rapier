// One layout for every pop-up that asks, composed like a magazine page: the title at the top, the words, then the options
// in one column with one even gap. The first affirmative option, the thing the person opened the pop-up to do, stands
// first in the theme's highlight (black with white words in the light theme, white with black words in the dark theme);
// any further affirmative option is a plain box between; the destructive or negative option is last, a flat, slightly
// darkened red box with white text in both themes, set apart by one clear gap and no more.
//
// The owner is this file and one CSS block (`.rapier-pop`, editor/styles/rapier-source.css). A pop-up's markup is a
// `.settings-panel.rapier-pop` whose body holds the title, its words, and one `[data-pop-row]` of buttons, each
// carrying its role in `data-pop`: `affirm` (the thing the person came to do), `cancel`, or `destructive` (what
// discards or deletes). `_rapierPopArrange` puts the row in reading order and marks the one box that takes the bottom
// place:
//   - the destructive button, when the row has one (Cancel then stands among the affirmative options, a plain box);
//   - else Cancel.
// A row with neither (two ways forward) has no bottom box and no top box: equal ways forward are plain boxes. The marked
// box is last in the document order as well as on the screen, so focus and the reader reach it after every safe answer
// (the thumb rule); in a row that has one, the first shown affirmative box is marked as the top box. Dialogs whose
// buttons come and go (the embed failure) or whose roles depend on the request (the confirm) call it again after they
// change them.

const RAPIER_POP_RANK = Object.freeze({affirm: 0, cancel: 1, destructive: 2});

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

// The one progress popup, for every wait the person can see the end of (a picture's encode, an import, a download): words, a
// 2 px line that fills to the fraction the work reports or runs while it does not know, and a button where the work can be given up.
// It is a notice: it stands in the notice root with the toasts (`#toast-root`, `.rapier-progress` in editor/styles/rapier-app.css), in their
// surface, Geist Mono, caps and full width, so it is placed above the chrome and stacked with them as they are. It takes no focus and blocks
// nothing; its words are a status the reader announces. Keep the words short ("Finishing at full quality"). `after` keeps a short wait
// unannounced. One popup shows at a time, the newest.
//   const progress = _rapierProgressOpen({label: 'Finishing at full quality', after: 1500, cancel: () => controller.abort()});
//   progress.set(0.4);              // how far, 0 to 1; null runs the line
//   progress.set(0.4, 'New words'); // and new words with it
//   progress.end();                 // gone; safe to call again
const _rapierProgressOpen = (() => {
	const rows = new Set();
	let element = null;
	function paint() {
		const row = [...rows].at(-1);
		if (!row) { element?.remove(); element = null; return; }
		if (element && !element.isConnected) element = null; // a notice root put away took it
		if (!element) {
			element = document.createElement('div');
			element.className = 'rapier-progress';
			element.setAttribute('role', 'status');
			const line = document.createElement('div'), words = document.createElement('span'), bar = document.createElement('div');
			line.className = 'rapier-progress__row'; words.className = 'rapier-progress__label';
			bar.className = 'rapier-progress__bar'; bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100');
			line.append(words); element.append(line, bar);
			(document.getElementById('toast-root') || document.body).append(element);
		}
		const label = element.querySelector('.rapier-progress__label'), bar = element.querySelector('.rapier-progress__bar');
		if (label.textContent !== row.label) label.textContent = row.label;
		const button = element.querySelector('.rapier-progress__cancel');
		if (!row.cancel) button?.remove();
		else if (!button || button.__rapierRow !== row) {
			button?.remove();
			const next = document.createElement('button');
			next.type = 'button'; next.className = 'rapier-progress__cancel'; next.textContent = 'Cancel'; next.__rapierRow = row;
			next.addEventListener('click', () => { try { row.cancel(); } finally { row.end(); } });
			element.querySelector('.rapier-progress__row').append(next);
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
		row.set = (fraction = null, words) => {
			row.fraction = typeof fraction === 'number' && Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : null;
			if (words != null) row.label = String(words);
			if (rows.has(row)) paint();
		};
		return row;
	};
})();

// The popup over a modal dialog or sheet. Notices stand under the scrim, so while a popup is open over `overlay` the notice root
// stands in it (editor/engine.js _rapierApplyModalIsolation then leaves it live), and goes back when the last one ends or on
// `release()`, which the overlay's close calls. `open` takes `_rapierProgressOpen`'s options and returns `set` and `end`.
function _rapierProgressOver(overlay) {
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
			return {set: row.set, end() { if (!live) return; live = false; row.end(); if (!--count) place(false); }};
		},
		release() { count = 0; place(false); },
	};
}

// Work on a whole document holds the main thread, and a delayed popup cannot appear inside that hold. A document past
// RAPIER_PROGRESS_AHEAD characters (half a second at a phone's speed: a 10 MB file takes 12 s to open at CPU 4) shows the popup
// at once, and this resolves once it has painted; a smaller one opens it behind half a second. `options` are `_rapierProgressOpen`'s.
const RAPIER_PROGRESS_AHEAD = 524288;
async function _rapierProgressAhead(size, options) {
	if (!(size > RAPIER_PROGRESS_AHEAD)) return _rapierProgressOpen({after: 500, ...options});
	const row = _rapierProgressOpen({...options, after: 0});
	await _rapierProgressPainted();
	return row;
}
// Settles after the next painted frame: the notice placer runs in the first, the paint follows it.
function _rapierProgressPainted() { return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0)))); }

// A plug-in the person asked for: the popup follows its loader's status (`rapier:<key>plugin`, shell/plugin-loader.js) until it is
// ready or has failed, filling while it downloads where the loader counts it, running while it installs. Returns the end.
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
