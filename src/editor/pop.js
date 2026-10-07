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
