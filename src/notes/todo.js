// Notes to-do interface (rewrites in notes/todo.mjs). Attaches while a note is open, via rapierNotesFacts, rescanning on one
// MutationObserver over #editor-blocks's direct children. Every rewrite flushes (_rapierNotesFlush), rewrites through todo.mjs, then
// hands the text to _rapierNotesApplyText (undoable; autosave writes the file). Shared script scope; every cross-file call is
// typeof-guarded and toasts on failure.
// Invariant: file line order is DOM order (_toggleTaskCheckbox maps a box by position); ticked items gather by CSS order only. Group and
// hide state is session memory, never the sidecar. createElement/textContent only.

const _rapierTodo = {
	observer: null, scheduled: false, decorated: false,
	collapsed: new Map(), // file -> Set(key) of ticked-groups the PERSON opened (closed is the default)
	hidden: new Map(), // file -> Set(key) of lists whose boxes are currently hidden
	drag: null,
};

function _rapierTodoModel() { return globalThis.RapierNotesTodo; }

function _rapierTodoSvg(tag, attrs) {
	const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
	for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
	return el;
}
// Six dots, two columns of three -- a plain grip, no invented glyph.
function _rapierTodoHandleIcon() {
	const svg = _rapierTodoSvg('svg', {viewBox: '0 0 16 16', 'aria-hidden': 'true'});
	for (const [cx, cy] of [[5, 3], [11, 3], [5, 8], [11, 8], [5, 13], [11, 13]]) svg.appendChild(_rapierTodoSvg('circle', {cx: String(cx), cy: String(cy), r: '1.4'}));
	return svg;
}
// contenteditable="false" is load-bearing on the editing surface: the row chrome is an atom the caret cannot enter nor Enter split.
function _rapierTodoBuildHandle() {
	const handle = _rapierNotesEl('button', 'rapier-todo-handle');
	handle.type = 'button';
	handle.contentEditable = 'false';
	handle.setAttribute('aria-label', 'Drag to reorder; swipe right to indent, left to outdent');
	handle.appendChild(_rapierTodoHandleIcon());
	return handle;
}
// The editor's chevron via _rapierNotesGlyph; never a copy.
function _rapierTodoChevronIcon() { return _rapierNotesGlyph('chevron-down'); }

// ---- The open note ----
// Checks the editor's filename too, so a document switch never decorates the wrong document.
function _rapierTodoText() {
	try { return typeof _rapierSourceText === 'function' ? _rapierSourceText() : null; } catch (_) { return null; }
}
// The one write path: flush first, then the text to the editor as the card's checkbox tap does. Toasts if notes.js's surface is missing.
async function _rapierTodoPersist(file, next) {
	const before = _rapierTodoText();
	// A failed flush means the folder is behind and has said so: stop, the list unchanged.
	try { if (typeof _rapierNotesFlush === 'function') await _rapierNotesFlush(); } catch (_) { return false; }
	if (_rapierTodoText() !== before) { if (typeof showToast === 'function') showToast('The list changed. Try again.', 'info'); return false; }
	// The editor owns the open note's text (_rapierNotesApplyText); the file follows through autosave.
	if (typeof _rapierNotesApplyText === 'function' && typeof _rapierNotes !== 'undefined' && _rapierNotes.current === file) {
		return await _rapierNotesApplyText(next, 'notes.list', 'List', {settle: true});
	}
	if (typeof showToast === 'function') showToast('The list could not be saved: this note is not the open one', 'error');
	return false;
}

async function _rapierTodoBatch(action) {
	const file = _rapierNotesCurrentFile(), T = _rapierTodoModel();
	if (!file || !T || !['uncheck-all', 'delete-checked'].includes(action)) return false;
	if (typeof _leaveOtherEditingBlocks === 'function') _leaveOtherEditingBlocks(null);
	const text = _rapierTodoText(); if (text == null) return false;
	const next = action === 'uncheck-all' ? T.uncheckAll(text) : T.deleteChecked(text);
	return next !== text && await _rapierTodoPersist(file, next);
}
function _rapierTodoHasChecks() { const text = _rapierTodoText(); return text != null && !!_rapierTodoModel()?.hasChecks(text); }

// ---- A list block's line in the note's text ----
// _rapierBlockSourceStart turned into a 0-based line index over `text`, the seed listAt takes.
function _rapierTodoBlockLine(text, wrapper) {
	// The wrapper's data-block-id is a string; a block's id is a number (editor/engine.js reads the
	// attribute through Number() everywhere), so the two are compared as strings.
	const id = wrapper && wrapper.dataset && wrapper.dataset.blockId;
	if (!id || typeof rapier === 'undefined' || !rapier.document || !Array.isArray(rapier.document.blocks)) return null;
	const index = rapier.document.blocks.findIndex(b => String(b.id) === String(id));
	if (index < 0 || typeof _rapierBlockSourceStart !== 'function') return null;
	let offset;
	try { offset = _rapierBlockSourceStart(index); } catch (_) { return null; }
	if (typeof offset !== 'number' || !Number.isFinite(offset)) return null;
	return text.slice(0, Math.max(0, offset)).split('\n').length - 1;
}

// ---- The scan: runs after the note loads and after every re-render -------------------------------
function _rapierTodoScheduleScan() {
	if (_rapierTodo.scheduled) return;
	_rapierTodo.scheduled = true;
	const run = () => { _rapierTodo.scheduled = false; try { _rapierTodoScan(); } catch (_) {} };
	if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else setTimeout(run, 16);
}
function _rapierTodoStrip(wrapper) {
	if (!wrapper) return;
	// "+ List item" is a child of the wrapper, not the read surface.
	for (const row of wrapper.querySelectorAll(':scope > .rapier-todo-add-row')) row.remove();
	const read = wrapper.querySelector(':scope > .block-read');
	if (!read) return;
	const head = read.querySelector(':scope > .rapier-todo-head'); if (head) head.remove();
	const list = read.querySelector(':scope > ul, :scope > ol');
	if (list) {
		list.classList.remove('rapier-todo-list', 'rapier-todo-list--closed');
		const row = list.querySelector(':scope > li.rapier-todo-ticked-row'); if (row) row.remove();
		for (const nested of list.querySelectorAll('.rapier-todo-list')) nested.classList.remove('rapier-todo-list', 'rapier-todo-list--closed');
		for (const row of list.querySelectorAll('li.rapier-todo-ticked-row')) row.remove();
		for (const li of list.querySelectorAll('li.rapier-todo-item, li.rapier-todo-done')) {
			li.classList.remove('rapier-todo-item', 'rapier-todo-done', 'rapier-todo-branch-open');
			const h = li.querySelector(':scope > .rapier-todo-handle'); if (h) h.remove();
			_rapierTodoUnwrapLabel(li);
		}
	}
}
// ---- The item's label: a real text node, after the box ----
// The renderer drops an empty item's single space, leaving no text node: a tap lands as an element offset and typing goes before the box.
// So a span holding that space (white-space:pre-wrap) is added after the box, only where the row is empty. Rows with words are untouched.
function _rapierTodoLabelTextAfterBox(li, box) {
	if (!box) return null;
	const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		if (!node.data || node.parentElement?.closest('li') !== li) continue;
		if ((box.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) return node;
	}
	return null;
}
function _rapierTodoUnwrapLabel(li) {
	for (const span of li.querySelectorAll(':scope > .rapier-todo-label')) {
		// Never a removal: whatever is in there is the person's own words the moment they start
		// typing. The span goes, its contents stay exactly where they were.
		while (span.firstChild) span.parentNode.insertBefore(span.firstChild, span);
		span.remove();
	}
}
function _rapierTodoEnsureLabel(li) {
	const box = li.querySelector(':scope > input[type="checkbox"], :scope > .task-list-item-checkbox');
	if (!box) { _rapierTodoUnwrapLabel(li); return; }
	const existing = li.querySelector(':scope > .rapier-todo-label');
	// The renderer's label: a text node after the box carrying anything, a space included.
	const own = _rapierTodoLabelTextAfterBox(li, box);
	if (own && (!existing || !existing.contains(own))) { _rapierTodoUnwrapLabel(li); return; }
	if (existing) { if (existing.previousSibling !== box) box.after(existing); return; }
	const span = _rapierNotesEl('span', 'rapier-todo-label');
	// boxNote writes "- [ ] ": that trailing space is the label.
	span.appendChild(document.createTextNode(' '));
	box.after(span);
}
// The row belongs at the block's foot; moved only when not already last.
function _rapierTodoFootAddRow(wrapper) {
	const addRow = wrapper && wrapper.querySelector(':scope > .rapier-todo-add-row');
	if (addRow && wrapper.lastElementChild !== addRow) wrapper.appendChild(addRow);
}
// Decorating mutates #editor-blocks: pause the observer for the scan's own mutations or it rescans forever.
function _rapierTodoScan() {
	if (_rapierTodo.observer) _rapierTodo.observer.disconnect();
	try { _rapierTodoScanBody(); }
	finally {
		const host = document.getElementById('editor-blocks');
		if (_rapierTodo.observer && host) _rapierTodo.observer.observe(host, {childList: true, subtree: true});
	}
}
function _rapierTodoScanBody() {
	const file = _rapierNotesCurrentFile();
	const host = document.getElementById('editor-blocks');
	const T = _rapierTodoModel();
	if (!file || !host || !T) { if (host && _rapierTodo.decorated) { for (const w of host.querySelectorAll(':scope > .block-wrapper')) _rapierTodoStrip(w); _rapierTodo.decorated = false; } return; }
	const text = _rapierTodoText();
	if (text == null) return;
	let ordinal = 0;
	const seen = new Set();
	_rapierTodo.decorated = true;
	for (const wrapper of host.querySelectorAll(':scope > .block-wrapper')) {
		// A block being edited is decorated too (_rapierAdoptReadProjection moved its list); its "+ List item" is under the finger next.
		if (wrapper.classList.contains('block-wrapper--editing')) { _rapierTodoDecorateEditing(wrapper); continue; }
		const read = wrapper.querySelector(':scope > .block-read');
		const list = read && read.querySelector(':scope > ul, :scope > ol');
		if (!read || !list || !list.querySelector(':scope > li')) { _rapierTodoStrip(wrapper); continue; }
		const boxed = list.classList.contains('contains-task-list');
		const lineIndex = _rapierTodoBlockLine(text, wrapper);
		const range = lineIndex == null ? null : T.listAt(text, lineIndex);
		const key = file + ' ' + (ordinal++);
		if (boxed && range && range.boxed === true) { seen.add(key); _rapierTodoDecorateBoxed(file, key, read, list, range); continue; }
		if (!boxed && range && range.boxed === false && _rapierTodo.hidden.get(file) && _rapierTodo.hidden.get(file).has(key)) {
			seen.add(key); _rapierTodoDecoratePlain(key, read, list); continue;
		}
		_rapierTodoStrip(wrapper);
	}
	// Forget session keys not seen this scan.
	for (const map of [_rapierTodo.collapsed, _rapierTodo.hidden]) {
		const set = map.get(file);
		if (set) for (const k of [...set]) if (!seen.has(k) && ![...seen].some(parent => k.startsWith(parent + ':'))) set.delete(k);
	}
}

// ---- The block being typed in ----
// Chrome only: one handle per boxed row, so a row Enter makes has its handle at once. No model-driven parts: the committed text lags the DOM.
// A row with words has its label span unwrapped (a cloned empty span grows and pushes the words right); an empty row keeps exactly one.
function _rapierTodoDecorateEditing(wrapper) {
	_rapierTodoFootAddRow(wrapper);
	const edit = wrapper.querySelector(':scope > .block-edit');
	if (!edit) return;
	// The chevron row must never be inside editable text: adopted into contenteditable it would be written as a list item. Removed here, rebuilt in read mode.
	for (const row of edit.querySelectorAll('li.rapier-todo-ticked-row')) row.remove();
	for (const li of edit.querySelectorAll('li')) {
		const box = li.querySelector(':scope > input[type="checkbox"], :scope > .task-list-item-checkbox');
		const handle = li.querySelector(':scope > .rapier-todo-handle');
		if (!box) {
			if (handle) handle.remove();
			_rapierTodoUnwrapLabel(li);
			li.classList.remove('rapier-todo-item');
			continue;
		}
		li.classList.add('rapier-todo-item');
		if (!handle) li.insertBefore(_rapierTodoBuildHandle(), li.firstChild);
		if (li.textContent.trim()) { _rapierTodoUnwrapLabel(li); _rapierTodoDropTrailingBreaks(li); } // a row with WORDS owns its own text
		else _rapierTodoEmptyRowKeepsOneLabel(li, box);
	}
}
// A row's words never end in <br>: leaving would write two trailing spaces. Drop a <br> ending the last words; keep one that holds an empty line.
function _rapierTodoDropTrailingBreaks(li) {
	let node = li.lastChild;
	while (node && node.nodeType === Node.TEXT_NODE && !node.data) node = node.previousSibling;
	if (!node || node.nodeName !== 'BR') return;
	let before = node.previousSibling;
	while (before && before.nodeType === Node.TEXT_NODE && !before.data) before = before.previousSibling;
	if (before && before.nodeName !== 'BR' && before.textContent.trim()) node.remove();
}
// An empty row: one label span (pre-wrap, so the caret can sit after its space), every whitespace node gathered into it, caret read before
// moving and restored after the space; every <br> removed (else "- [ ] Jam " is written).
function _rapierTodoEmptyRowKeepsOneLabel(li, box) {
	const selection = window.getSelection && window.getSelection();
	const caretInRow = !!(selection && selection.rangeCount && selection.isCollapsed && li.contains(selection.anchorNode));
	for (const br of li.querySelectorAll(':scope > br')) br.remove();
	let span = li.querySelector(':scope > .rapier-todo-label');
	if (!span) { span = _rapierNotesEl('span', 'rapier-todo-label'); box.after(span); }
	else if (span.previousSibling !== box) box.after(span);
	for (let node = span.nextSibling; node;) { const next = node.nextSibling; if (node.nodeType === Node.TEXT_NODE) span.appendChild(node); node = next; }
	for (let node = span.previousSibling; node && node !== box;) { const prev = node.previousSibling; if (node.nodeType === Node.TEXT_NODE) span.insertBefore(node, span.firstChild); node = prev; }
	const texts = [...span.childNodes].filter(node => node.nodeType === Node.TEXT_NODE);
	if (!texts.length) { span.appendChild(document.createTextNode(' ')); texts.push(span.lastChild); }
	texts.forEach((node, i) => { const want = i === 0 ? ' ' : ''; if (node.data !== want) node.data = want; });
	if (!caretInRow || (selection.anchorNode === texts[0] && selection.anchorOffset === texts[0].data.length)) return;
	const range = document.createRange();
	range.setStart(texts[0], texts[0].data.length); range.collapse(true);
	selection.removeAllRanges(); selection.addRange(range);
}

// ---- Deleting across a row's edge ----
// Backspace at a row's start or Delete at its end joins the two rows' words; an empty row just goes. Only neighbours of one group. Where there
// is no row to join, or a nested list would move, nothing changes. The browser's deletion would strip boxes or loosen the list.
function _rapierTodoDeleteAcrossRows(evt) {
	const backward = evt.inputType === 'deleteContentBackward';
	if ((!backward && evt.inputType !== 'deleteContentForward') || !evt.cancelable || evt.defaultPrevented || evt.isComposing) return;
	const selection = window.getSelection && window.getSelection();
	if (!selection || !selection.rangeCount || !selection.isCollapsed) return;
	const caret = selection.getRangeAt(0);
	const holder = caret.startContainer.nodeType === Node.ELEMENT_NODE ? caret.startContainer : caret.startContainer.parentElement;
	const li = holder && holder.closest('li');
	const edit = li && li.closest('.block-edit');
	if (!edit || !edit.isContentEditable || !li.classList.contains('rapier-todo-item')) return;
	const empty = _rapierTodoRowIsEmpty(li);
	if (!empty && !_rapierTodoCaretAtRowEdge(li, caret, backward)) return;
	evt.preventDefault();
	const done = li.classList.contains('rapier-todo-done');
	const rows = [...li.parentElement.children].filter(el => el.matches('li.rapier-todo-item') && el.classList.contains('rapier-todo-done') === done && el.getClientRects().length);
	const at = rows.indexOf(li);
	if (at < 0) return;
	const upper = backward ? rows[at - 1] : li, lower = backward ? li : rows[at + 1];
	let place;
	if (!upper || !lower) {
		const below = rows[at + 1];
		if (!backward || !empty || !below || _rapierTodoRowNests(li)) return;
		li.remove();
		place = _rapierTodoRowStart(below);
	} else if (_rapierTodoRowIsEmpty(lower) && !_rapierTodoRowNests(lower)) {
		lower.remove();
		place = _rapierTodoRowEnd(_rapierTodoLastLine(upper));
	} else if (_rapierTodoRowIsEmpty(upper) && !_rapierTodoRowNests(upper)) {
		upper.remove();
		place = _rapierTodoRowStart(lower);
	} else if (_rapierTodoRowNests(upper) || _rapierTodoRowNests(lower)) {
		return;
	} else {
		_rapierTodoUnwrapLabel(lower);
		const words = _rapierTodoRowContent(lower);
		// The space between a box and its words is the list's own, not the person's: it goes.
		while (words.length && words[0].nodeType === Node.TEXT_NODE && !words[0].data.trim()) words.shift().remove();
		if (words.length && words[0].nodeType === Node.TEXT_NODE) words[0].data = words[0].data.replace(/^\s+/, '');
		// The upper row's words end where its last line does: a line break that ends the row draws
		// no line of its own, so the lower row's words take its place.
		const ending = _rapierTodoRowLast(upper);
		for (const node of words) upper.insertBefore(node, ending && ending.nodeName === 'BR' ? ending : null);
		if (ending && ending.nodeName === 'BR') ending.remove();
		lower.remove();
		place = document.createRange();
		if (words[0].nodeType === Node.TEXT_NODE) place.setStart(words[0], 0); else place.setStartBefore(words[0]);
		place.collapse(true);
	}
	selection.removeAllRanges(); selection.addRange(place);
	if (typeof _markEditDivDirty === 'function') _markEditDivDirty(edit);
	if (typeof _rapierScheduleEditCheckpoint === 'function') _rapierScheduleEditCheckpoint(edit, evt);
}
// A row's own content: everything in it but its handle, its box and a list nested in it.
function _rapierTodoRowContent(li) {
	return [...li.childNodes].filter(node => node.nodeType !== Node.ELEMENT_NODE || !node.matches('.rapier-todo-handle, input[type="checkbox"], ul, ol'));
}
function _rapierTodoRowNests(li) {
	return !!li.querySelector(':scope > ul, :scope > ol');
}
// The row whose line is the last a row draws: the row itself, or the last row shown of a list
// nested in it (and so on down).
function _rapierTodoLastLine(li) {
	let row = li;
	for (;;) {
		const nested = [...row.children].filter(el => el.tagName === 'UL' || el.tagName === 'OL').pop();
		const items = nested ? [...nested.children].filter(el => el.tagName === 'LI' && el.getClientRects().length) : [];
		if (!items.length) return row;
		row = items[items.length - 1];
	}
}
// The last of a row's own content that is anything at all (an empty text node is nothing).
function _rapierTodoRowLast(li) {
	const content = _rapierTodoRowContent(li);
	for (let i = content.length - 1; i >= 0; i--) if (content[i].nodeType !== Node.TEXT_NODE || content[i].data) return content[i];
	return null;
}
const RAPIER_TODO_SHOWN = 'img, svg, video, audio, iframe, canvas, math, input, .math-rendered';
// A row holding nothing a person put there: whitespace, line breaks and an empty label.
function _rapierTodoRowIsEmpty(li) {
	return _rapierTodoRowContent(li).every(node => node.nodeType !== Node.ELEMENT_NODE
		? !(node.nodeType === Node.TEXT_NODE && node.data.trim())
		: node.nodeName === 'BR' || (!node.matches(RAPIER_TODO_SHOWN) && !node.textContent.trim() && !node.querySelector(RAPIER_TODO_SHOWN)));
}
// Whether the caret is at the start (backward) or end of the row's own words, before any nested list.
function _rapierTodoCaretAtRowEdge(li, caret, backward) {
	const probe = document.createRange();
	try {
		if (backward) { probe.setStart(li, 0); probe.setEnd(caret.startContainer, caret.startOffset); }
		else {
			const nested = li.querySelector(':scope > ul, :scope > ol');
			probe.setStart(caret.startContainer, caret.startOffset);
			if (nested) probe.setEndBefore(nested); else probe.setEnd(li, li.childNodes.length);
		}
	} catch (_) { return false; }
	const part = document.createElement('div');
	part.appendChild(probe.cloneContents());
	for (const el of part.querySelectorAll('.rapier-todo-handle, input[type="checkbox"]')) el.remove();
	// Backward, a line break before the caret means it is on a later line of the row; forward, a
	// break after it ends a line the caret is not at the end of -- unless it is the row's last,
	// which draws no line of its own.
	const breaks = [...part.querySelectorAll('br')];
	if (!backward && breaks.length === 1 && _rapierTodoRowLast(li) && _rapierTodoRowLast(li).nodeName === 'BR') breaks.pop();
	return !part.textContent.trim() && !breaks.length && !part.querySelector('ul, ol, ' + RAPIER_TODO_SHOWN);
}
// Where the caret goes: after the last of a row's words (before a line break that ends the row),
// or before the first of them.
function _rapierTodoRowEnd(li) {
	const range = document.createRange();
	const last = _rapierTodoRowLast(li);
	if (!last) range.setStartAfter(li.querySelector(':scope > input[type="checkbox"]') || li.lastChild);
	else if (last.nodeName === 'BR') range.setStartBefore(last);
	else if (last.nodeType === Node.TEXT_NODE) range.setStart(last, last.data.length);
	else {
		const texts = _rapierTodoRowTexts(last);
		const text = texts[texts.length - 1];
		if (text) range.setStart(text, text.data.length); else range.setStartAfter(last);
	}
	range.collapse(true);
	return range;
}
function _rapierTodoRowStart(li) {
	const first = _rapierTodoRowContent(li).flatMap(node => node.nodeType === Node.TEXT_NODE ? [node] : node.nodeType === Node.ELEMENT_NODE ? _rapierTodoRowTexts(node) : []).find(node => node.data.trim());
	if (!first) return _rapierTodoRowEnd(li);
	const range = document.createRange();
	range.setStart(first, first.data.length - first.data.replace(/^\s+/, '').length);
	range.collapse(true);
	return range;
}
function _rapierTodoRowTexts(el) {
	const texts = [], walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
	for (let text = walker.nextNode(); text; text = walker.nextNode()) texts.push(text);
	return texts;
}

// ---- A boxed list ----
// The list's rows in file order: every <li> but the chevron row.
function _rapierTodoRows(list) {
	return [...list.children].filter(el => el.tagName === 'LI' && !el.classList.contains('rapier-todo-ticked-row'));
}
function _rapierTodoDecorateBoxed(file, key, read, list, range) {
	const T = _rapierTodoModel();
	const liElements = [...list.querySelectorAll('li')].filter(li => !li.classList.contains('rapier-todo-ticked-row'));
	if (liElements.length !== range.items.length) { _rapierTodoStrip(read.closest('.block-wrapper')); return; }
	list.classList.add('rapier-todo-list');
	liElements.forEach(li => {
		li.classList.add('rapier-todo-item');
		// No listener on the handle itself: one listener on the block host answers every handle,
		// whoever made it (_rapierTodoInit; _rapierTodoHandleDown says why).
		if (!li.querySelector(':scope > .rapier-todo-handle')) li.insertBefore(_rapierTodoBuildHandle(), li.firstChild);
		// The label: a real text node after the box, always. See _rapierTodoEnsureLabel.
		_rapierTodoEnsureLabel(li);
	});
	// No in-view hide/show control: the note's sheet owns the pair (_rapierTodoBoxesWord).
	read.querySelector(':scope > .rapier-todo-head')?.remove();

	// "+ List item" lives in the wrapper, never .block-read: that is adopted into contenteditable and turned into Markdown (the row would be written
	// into the note), and rewritten wholesale on leave (taking an open input and focus). Witness: notes-todo-first-list.mjs.
	const wrapper = read.closest('.block-wrapper');
	const stale = read.querySelector(':scope > .rapier-todo-add-row'); if (stale) stale.remove();
	let addRow = wrapper && wrapper.querySelector(':scope > .rapier-todo-add-row');
	if (wrapper && !addRow) { addRow = _rapierTodoBuildAddRow(); wrapper.appendChild(addRow); }
	if (wrapper) _rapierTodoFootAddRow(wrapper);
	if (addRow) _rapierTodoWireAddRow(addRow);

	// The items stay exactly where the renderer put them (the file's own order); a ticked one is
	// marked and gathered under the chevron by CSS order, never moved.
	liElements.forEach((li, i) => li.classList.toggle('rapier-todo-done', !!range.items[i].done));
	for (const group of [list, ...list.querySelectorAll('ul, ol')]) {
		group.classList.add('rapier-todo-list');
		const rows = _rapierTodoRows(group);
		for (const li of rows) li.classList.toggle('rapier-todo-branch-open', !!li.querySelector('li.rapier-todo-item:not(.rapier-todo-done)'));
		const groupKey = group === list ? key : key + ':' + liElements.indexOf(rows[0]);
		_rapierTodoLayoutTicked(file, groupKey, group, rows.filter(li => li.classList.contains('rapier-todo-done') && !li.classList.contains('rapier-todo-branch-open')).length);
	}
}

// The chevron row: a last <li> with no box, ordered between open and ticked by CSS; closed by default.
function _rapierTodoLayoutTicked(file, key, list, tickedCount) {
	let row = list.querySelector(':scope > li.rapier-todo-ticked-row');
	if (!tickedCount) { if (row) row.remove(); list.classList.remove('rapier-todo-list--closed'); return; }
	if (!row) {
		row = _rapierNotesEl('li', 'rapier-todo-ticked-row'); row.setAttribute('role', 'presentation');
		const btn = _rapierNotesEl('button', 'rapier-todo-ticked'); btn.type = 'button';
		btn.appendChild(_rapierTodoChevronIcon()); btn.appendChild(document.createElement('span'));
		row.appendChild(btn); list.appendChild(row);
	}
	const btn = row.querySelector('.rapier-todo-ticked');
	const closed = _rapierTodoIsCollapsed(file, key);
	btn.querySelector('span').textContent = tickedCount === 1 ? '1 ticked item' : tickedCount + ' ticked items';
	btn.setAttribute('aria-expanded', String(!closed));
	btn.classList.toggle('rapier-todo-ticked--closed', closed);
	btn.onclick = evt => { evt.stopPropagation(); _rapierTodoToggleCollapsed(file, key); _rapierTodoScheduleScan(); };
	list.classList.toggle('rapier-todo-list--closed', closed);
}
function _rapierTodoIsCollapsed(file, key) {
	const set = _rapierTodo.collapsed.get(file);
	return !(set && set.has(key)); // presence means the person opened it; closed is the default
}
function _rapierTodoToggleCollapsed(file, key) {
	let set = _rapierTodo.collapsed.get(file);
	if (!set) { set = new Set(); _rapierTodo.collapsed.set(file, set); }
	if (set.has(key)) set.delete(key); else set.add(key);
}

// ---- A plain list with hidden boxes ----
function _rapierTodoDecoratePlain(key, read, list) {
	// No in-view control here either -- the sheet owns the pair (see the boxed path above).
	read.querySelector(':scope > .rapier-todo-head')?.remove();
	// No handles, no "+ List item", no chevron on a hidden-boxes list -- Keep's own look for one.
	list.classList.remove('rapier-todo-list', 'rapier-todo-list--closed');
	const staleRow = list.querySelector(':scope > li.rapier-todo-ticked-row'); if (staleRow) staleRow.remove();
	for (const li of list.children) {
		li.classList.remove('rapier-todo-item', 'rapier-todo-done');
		const h = li.querySelector(':scope > .rapier-todo-handle'); if (h) h.remove();
		_rapierTodoUnwrapLabel(li);
	}
	const staleAdd = read.querySelector(':scope > .rapier-todo-add-row'); if (staleAdd) staleAdd.remove();
	for (const row of read.closest('.block-wrapper')?.querySelectorAll(':scope > .rapier-todo-add-row') || []) row.remove();
}

// ---- The kebab's pair ----
// The note's first list decides: boxed gives "Hide checkboxes", plain or none gives "Show checkboxes". Read from the text, not the decoration.
function _rapierTodoFirstList(text) {
	const T = _rapierTodoModel(); if (!T) return null;
	const lines = String(text ?? '').split('\n');
	let fenced = false;
	for (let i = 0; i < lines.length; i++) {
		if (/^\s*(```|~~~)/.test(lines[i])) { fenced = !fenced; continue; }
		if (!fenced && /^\s*[-*]\s/.test(lines[i])) return T.listAt(text, i);
	}
	return null;
}
function _rapierTodoBoxesWord() {
	if (!_rapierNotesCurrentFile()) return '';
	const text = _rapierTodoText(); if (text == null) return '';
	const first = _rapierTodoFirstList(text);
	return first && first.boxed ? 'Hide tick boxes' : 'Show tick boxes';
}
async function _rapierTodoBoxesFlip() {
	const file = _rapierNotesCurrentFile(); if (!file) return false;
	const T = _rapierTodoModel(); if (!T) return false;
	const text = _rapierTodoText(); if (text == null) return false;
	const first = _rapierTodoFirstList(text);
	const next = !first ? T.boxNote(text) : first.boxed ? T.hideBoxes(text, first) : T.showBoxes(text, first);
	if (next == null || next === text) return false;
	// A list hidden from the kebab keeps its own "Show checkboxes"; the first list block on screen is used (an ordered list first is a cosmetic miss).
	let set = _rapierTodo.hidden.get(file);
	if (first && first.boxed) { if (!set) { set = new Set(); _rapierTodo.hidden.set(file, set); } set.add(file + ' 0'); }
	else if (set) set.delete(file + ' 0');
	return await _rapierTodoPersist(file, next);
}

// ---- "+ LIST ITEM": a new tick box, caret inside ----
// appendEmptyItem writes one empty task line through the one path, then enterBlockEdit and _rapierPlaceCaretInListItem put the caret in it.
function _rapierTodoBuildAddRow() {
	const row = _rapierNotesEl('div', 'rapier-todo-add-row');
	const btn = _rapierNotesEl('button', 'rapier-todo-add'); btn.type = 'button';
	btn.appendChild(_rapierNotesEl('span', 'rapier-todo-add-plus', '+'));
	btn.appendChild(_rapierNotesEl('span', 'rapier-todo-add-word', 'List item'));
	row.appendChild(btn);
	return row;
}
function _rapierTodoWireAddRow(addRow) {
	const btn = addRow.querySelector('.rapier-todo-add');
	if (btn) btn.onclick = evt => { evt.stopPropagation(); void _rapierTodoAddItem(addRow); };
}
async function _rapierTodoAddItem(addRow) {
	if (addRow.dataset.todoAdding === '1') return; // one tap, one row
	const file = _rapierNotesCurrentFile(); if (!file) return;
	if (!addRow.closest('.block-wrapper')) return;
	const T = _rapierTodoModel(); if (!T) return;
	addRow.dataset.todoAdding = '1';
	try {
		// Leave the open block first: its live projection differs from its commit (a trailing space would be written into the file).
		if (typeof _leaveOtherEditingBlocks === 'function') { try { _leaveOtherEditingBlocks(null); } catch (_) {} }
		const wrapper = addRow.closest('.block-wrapper'); if (!wrapper) return;
		const text = _rapierTodoText(); if (text == null) return;
		const lineIndex = _rapierTodoBlockLine(text, wrapper); if (lineIndex == null) return;
		const range = T.listAt(text, lineIndex); if (!range || range.boxed !== true) return;
		const next = T.appendEmptyItem(text, range);
		if (next == null) return;
		if (!await _rapierTodoPersist(file, next)) return;
		// The splice re-renders the block; the row is only a row once that has happened.
		await new Promise(resolve => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => resolve()) : setTimeout(resolve, 16)));
		// Find the item by line: the splice gives the block a new id.
		_rapierTodoCaretIntoLine(range.end);
	} finally { delete addRow.dataset.todoAdding; }
}
// Caret into the item on a source line; a failure is cosmetic and never undoes the write.
function _rapierTodoCaretIntoLine(line) {
	if (typeof enterBlockEdit !== 'function' || typeof rapier === 'undefined' || !rapier.document || !Array.isArray(rapier.document.blocks)) return;
	const host = document.getElementById('editor-blocks'); if (!host) return;
	const T = _rapierTodoModel(); if (!T) return;
	const text = _rapierTodoText(); if (text == null) return;
	for (const wrapper of host.querySelectorAll(':scope > .block-wrapper')) {
		const at = _rapierTodoBlockLine(text, wrapper);
		if (at == null) continue;
		const range = T.listAt(text, at);
		if (!range || range.boxed !== true || line < range.start || line >= range.end) continue;
		const block = rapier.document.blocks.find(b => String(b.id) === String(wrapper.dataset.blockId));
		if (!block) return;
		try { enterBlockEdit(block, wrapper); } catch (_) { return; }
		const edit = wrapper.querySelector(':scope > .block-edit');
		// Handle before caret, so the row is whole when the caret lands.
		try { _rapierTodoDecorateEditing(wrapper); } catch (_) {}
		const items = edit ? [...edit.querySelectorAll('li')] : [];
		const li = items[range.items.findIndex(item => item.line === line)];
		if (!li) return;
		if (typeof _rapierPlaceCaretInListItem === 'function') { try { _rapierPlaceCaretInListItem(li, true); } catch (_) {} }
		if (typeof li.scrollIntoView === 'function') { try { li.scrollIntoView({block: 'nearest'}); } catch (_) {} }
		return;
	}
}

// ---- The drag handle ----
// Reorders within its group by rewriting lines, written once on release. One capture listener on the host answers every handle (clones carry
// none). leaveBlockEdit rebuilds a typed-in block, so the grabbed row is found again in the new surface.
function _rapierTodoHandleDown(evt) {
	if (evt.button != null && evt.button !== 0) return;
	const handle = evt.target && evt.target.closest ? evt.target.closest('.rapier-todo-handle') : null; if (!handle) return;
	const wrapper = handle.closest('.block-wrapper'); if (!wrapper) return;
	// A press on the handle of a row being typed in leaves the row open, the caret and the keyboard where they were, until it moves
	// as a grab does: only then is the block left and the drag begun. The press left the block at once, so a tap closed the row
	// (and a phone's keyboard with it).
	if (wrapper.classList.contains('block-wrapper--editing') && handle.closest('.block-edit')) {
		evt.preventDefault();
		evt.stopPropagation();
		const press = {target: evt.target, button: evt.button, clientX: evt.clientX, clientY: evt.clientY, pointerId: evt.pointerId, preventDefault() {}, stopPropagation() {}};
		const stop = () => {
			window.removeEventListener('pointermove', move, true);
			window.removeEventListener('pointerup', stop, true);
			window.removeEventListener('pointercancel', stop, true);
		};
		const move = moved => {
			if (moved.pointerId !== press.pointerId || Math.max(Math.abs(moved.clientX - press.clientX), Math.abs(moved.clientY - press.clientY)) <= 12) return;
			stop();
			_rapierTodoGrab(press, wrapper);
			if (_rapierTodo.drag) _rapierTodoDragMove(moved);
		};
		window.addEventListener('pointermove', move, true);
		window.addEventListener('pointerup', stop, true);
		window.addEventListener('pointercancel', stop, true);
		return;
	}
	_rapierTodoGrab(evt, wrapper);
}
function _rapierTodoGrab(evt, wrapper) {
	let handle = evt.target.closest('.rapier-todo-handle'); if (!handle) return;
	let li = handle.closest('li.rapier-todo-item'); if (!li) return;
	let container = li.parentElement; if (!container) return;
	const surface = li.closest('.block-read, .block-edit');
	if (!surface || surface.parentElement !== wrapper) return;
	// A grab while typing leaves the block first (rewrites use committed text), refusing if it will not leave; the row is refound by position and
	// refused if the row count changed.
	if (wrapper.classList.contains('block-wrapper--editing')) {
		const rows = [...surface.querySelectorAll('li.rapier-todo-item')], at = rows.indexOf(li);
		if (at < 0 || typeof _leaveOtherEditingBlocks !== 'function') return;
		try { _leaveOtherEditingBlocks(null); } catch (_) { return; }
		if (!wrapper.isConnected || wrapper.classList.contains('block-wrapper--editing')) return;
		_rapierTodoScan();
		const drawn = [...wrapper.querySelectorAll('.block-read li.rapier-todo-item')];
		if (drawn.length !== rows.length) return;
		li = drawn[at];
		container = li.parentElement;
		handle = li.querySelector(':scope > .rapier-todo-handle');
		if (!handle) return;
	}
	const file = _rapierNotesCurrentFile(); if (!file) return;
	const text = _rapierTodoText(); if (text == null) return;
	const lineIndex = _rapierTodoBlockLine(text, wrapper); if (lineIndex == null) return;
	const T = _rapierTodoModel();
	const range = T.listAt(text, lineIndex);
	if (!range || range.boxed !== true) return;
	// Within its group; the group's rows are contiguous on screen.
	const inDoneGroup = el => el.classList.contains('rapier-todo-done') && !el.classList.contains('rapier-todo-branch-open');
	const done = inDoneGroup(li);
	const siblings = _rapierTodoRows(container).filter(el => inDoneGroup(el) === done && el.getClientRects().length);
	const fromIndex = siblings.indexOf(li);
	if (fromIndex < 0) return;
	const allRows = [...wrapper.querySelectorAll('.block-read li.rapier-todo-item')];
	const group = siblings.map(row => range.items[allRows.indexOf(row)]).filter(Boolean);
	if (group.length !== siblings.length) return; // the DOM and the fresh parse disagree; refuse rather than guess
	evt.preventDefault();
	evt.stopPropagation(); // a plain button already keeps the editor's own click-to-edit off it; this keeps the drag off any other ambient pointer tracking too
	// Measured once at the grab: each row's slot, height and gap; rows making way move by the dragged row's slot.
	const tops = siblings.map(el => el.getBoundingClientRect().top);
	const gap = parseFloat(getComputedStyle(li).marginBottom) || 0;
	const slots = siblings.map((el, i) => i + 1 < siblings.length ? tops[i + 1] - tops[i] : el.getBoundingClientRect().height + gap);
	_rapierTodo.drag = {file, text, range, group, container, li, siblings, fromIndex, currentIndex: fromIndex,
		startX: evt.clientX, startY: evt.clientY, axis: '', tops, slots, pointerId: evt.pointerId};
	li.classList.add('rapier-todo-dragging');
	try { handle.setPointerCapture(evt.pointerId); } catch (_) {}
	window.addEventListener('pointermove', _rapierTodoDragMove);
	window.addEventListener('pointerup', _rapierTodoDragEnd);
	window.addEventListener('pointercancel', _rapierTodoDragEnd);
}
function _rapierTodoDragMove(evt) {
	const drag = _rapierTodo.drag; if (!drag) return;
	if (evt.pointerId !== drag.pointerId) return;
	const dx = evt.clientX - drag.startX, dy = evt.clientY - drag.startY;
	if (!drag.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 12) drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
	if (drag.axis === 'x') { drag.indent = Math.abs(dx) >= 40 ? dx > 0 : null; drag.li.style.transform = 'translateX(' + Math.max(-48, Math.min(48, dx)) + 'px)'; return; }
	drag.li.style.transform = 'translateY(' + dy + 'px)';
	// A row takes a neighbour's place halfway across its slot.
	const {fromIndex: from, tops, slots} = drag, n = drag.siblings.length;
	let target = from;
	if (dy > 0) while (target + 1 < n && dy > tops[target + 1] - tops[from] - slots[from] + slots[target + 1] / 2) target++;
	else while (target > 0 && dy < tops[target - 1] - tops[from] + slots[target - 1] / 2) target--;
	if (target === drag.currentIndex) return;
	drag.currentIndex = target;
	drag.siblings.forEach((el, i) => {
		if (el === drag.li) return;
		let shift = 0;
		if (from < target && i > from && i <= target) shift = -slots[from];
		else if (from > target && i < from && i >= target) shift = slots[from];
		el.classList.toggle('rapier-todo-shift', !!shift);
		el.style.transform = shift ? 'translateY(' + shift + 'px)' : '';
	});
}
async function _rapierTodoDragEnd(evt) {
	const drag = _rapierTodo.drag; if (!drag) return;
	if (evt && evt.pointerId !== drag.pointerId) return;
	_rapierTodo.drag = null;
	window.removeEventListener('pointermove', _rapierTodoDragMove);
	window.removeEventListener('pointerup', _rapierTodoDragEnd);
	window.removeEventListener('pointercancel', _rapierTodoDragEnd);
	drag.li.classList.remove('rapier-todo-dragging'); drag.li.style.transform = '';
	drag.siblings.forEach(el => { el.classList.remove('rapier-todo-shift'); el.style.transform = ''; });
	if (evt?.type === 'pointercancel') return;
	const changed = drag.axis === 'x' ? typeof drag.indent === 'boolean' : drag.fromIndex !== drag.currentIndex;
	if (!changed) return;
	if (_rapierNotesCurrentFile() !== drag.file || _rapierTodoText() !== drag.text) { showToast('The list changed during the drag. Try again.', 'info'); return; }
	if (drag.axis === 'x') { if (typeof drag.indent === 'boolean') await _rapierTodoIndentLine(drag.group[drag.fromIndex].line, drag.indent); return; }
	if (drag.fromIndex === drag.currentIndex) return;
	await _rapierTodoCommitMove(drag);
}

async function _rapierTodoIndentLine(line, indent) {
	const file = _rapierNotesCurrentFile(), T = _rapierTodoModel(), text = _rapierTodoText();
	if (!file || !T || text == null) return false;
	const next = T.indentItem(text, line, indent);
	if (next == null || !await _rapierTodoPersist(file, next)) return false;
	_rapierTodoCaretIntoLine(line);
	return true;
}
function _rapierTodoIndentKey(evt) {
	if (evt.key !== 'Tab' || evt.isComposing || evt.keyCode === 229 || evt.ctrlKey || evt.metaKey || evt.altKey || evt.defaultPrevented || !_rapierNotesCurrentFile()) return;
	const selection = window.getSelection?.(), node = selection?.anchorNode;
	const li = evt.target.closest?.('li.rapier-todo-item') || (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)?.closest('li.rapier-todo-item');
	const wrapper = li?.closest('.block-wrapper'); if (!wrapper) return;
	const surface = li.closest('.block-edit, .block-read'); if (!surface) return;
	const rows = [...surface.querySelectorAll('li.rapier-todo-item')], ordinal = rows.indexOf(li);
	if (ordinal < 0) return;
	evt.preventDefault(); evt.stopPropagation();
	if (typeof _leaveOtherEditingBlocks === 'function') _leaveOtherEditingBlocks(null);
	const text = _rapierTodoText(), line = text == null ? null : _rapierTodoBlockLine(text, wrapper);
	const range = line == null ? null : _rapierTodoModel()?.listAt(text, line);
	if (range?.items[ordinal]) void _rapierTodoIndentLine(range.items[ordinal].line, !evt.shiftKey);
}
// Visual group from/to into absolute lines, one moveItem call; `to` is the final position (see notes/todo.mjs moveItem).
async function _rapierTodoCommitMove(drag) {
	const {file, range, group, fromIndex, currentIndex} = drag;
	const T = _rapierTodoModel();
	const text = _rapierTodoText(); if (text == null) return;
	const fullFrom = group[fromIndex].line - range.start;
	const fullTo = group[currentIndex].line - range.start;
	const next = T.moveItem(text, range, fullFrom, fullTo);
	if (next == null) return;
	await _rapierTodoPersist(file, next);
}

// ---- Wiring ----
// Called by notes.js when a note opens: the observer attaches once, a scan is scheduled every time.
function _rapierTodoInit() {
	const host = document.getElementById('editor-blocks');
	if (!host) return;
	if (!_rapierTodo.observer) {
		_rapierTodo.observer = new MutationObserver(() => _rapierTodoScheduleScan());
		_rapierTodo.observer.observe(host, {childList: true, subtree: true});
		// One capture listener for every handle, ahead of the editor's own press handling.
		host.addEventListener('pointerdown', _rapierTodoHandleDown, true);
		// One listener for a deletion across a row's edge, before the browser deletes the next row's chrome.
		host.addEventListener('beforeinput', _rapierTodoDeleteAcrossRows, true);
		host.addEventListener('keydown', _rapierTodoIndentKey, true);
	}
	_rapierTodoScheduleScan();
}
