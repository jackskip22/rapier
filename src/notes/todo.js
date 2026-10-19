
const _rapierTodo = {
	observer: null, scheduled: false, decorated: false,
	collapsed: new Map(),
	hidden: new Map(),
	press: null, drag: null, keyBusy: false,
};

function _rapierTodoModel() { return globalThis.RapierNotesTodo; }

function _rapierTodoSvg(tag, attrs) {
	const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
	for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
	return el;
}
function _rapierTodoHandleIcon() {
	const svg = _rapierTodoSvg('svg', {viewBox: '0 0 16 16', 'aria-hidden': 'true'});
	for (const [cx, cy] of [[5, 3], [11, 3], [5, 8], [11, 8], [5, 13], [11, 13]]) svg.appendChild(_rapierTodoSvg('circle', {cx: String(cx), cy: String(cy), r: '1.4'}));
	return svg;
}
function _rapierTodoBuildHandle() {
	const handle = _rapierNotesEl('button', 'rapier-todo-handle');
	handle.type = 'button';
	handle.contentEditable = 'false';
	handle.setAttribute('aria-label', 'Reorder list item');
	handle.setAttribute('aria-description', 'Arrow up or down moves this item. Arrow right indents; arrow left outdents.');
	handle.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowRight ArrowLeft');
	handle.appendChild(_rapierTodoHandleIcon());
	return handle;
}
function _rapierTodoChevronIcon() { return _rapierNotesGlyph('chevron-down'); }

function _rapierTodoText() {
	try { return typeof _rapierSourceText === 'function' ? _rapierSourceText() : null; } catch (_) { return null; }
}
async function _rapierTodoPersist(file, next) {
	const before = _rapierTodoText(), intent = _rapierMutationStamp();
	if (before == null || _rapierNotesCurrentFile() !== file) return false;
	try { if (typeof _rapierNotesFlush === 'function') await _rapierNotesFlush(); } catch (_) { return false; }
	if (!_rapierMutationStampSharesDocument(intent) || _rapierNotesCurrentFile() !== file || _rapierTodoText() !== before) { if (typeof showToast === 'function') showToast('The list changed. Try again.', 'info'); return false; }
	if (typeof _rapierNotesApplyText === 'function' && typeof _rapierNotes !== 'undefined' && _rapierNotes.current === file) {
		return await _rapierNotesApplyText(next, 'notes.checklist', 'List', {settle: true});
	}
	if (typeof showToast === 'function') showToast('The list could not be saved: this note is not the open one', 'error');
	return false;
}

async function _rapierTodoBatch(action) {
	if (typeof _rapierEditingRuntime !== 'undefined' && _rapierEditingRuntime.nativeInput) return;
	const file = _rapierNotesCurrentFile(), T = _rapierTodoModel();
	if (!file || !T || !['uncheck-all', 'delete-checked'].includes(action)) return false;
	if (typeof _leaveOtherEditingBlocks === 'function') _leaveOtherEditingBlocks(null);
	const text = _rapierTodoText(); if (text == null) return false;
	const next = action === 'uncheck-all' ? T.uncheckAll(text) : T.deleteChecked(text);
	return next !== text && await _rapierTodoPersist(file, next);
}
function _rapierTodoHasChecks() { const text = _rapierTodoText(); return text != null && !!_rapierTodoModel()?.hasChecks(text); }

function _rapierTodoBlockLine(text, wrapper) {
	const id = wrapper && wrapper.dataset && wrapper.dataset.blockId;
	if (!id || typeof rapier === 'undefined' || !rapier.document || !Array.isArray(rapier.document.blocks)) return null;
	const index = rapier.document.blocks.findIndex(b => String(b.id) === String(id));
	if (index < 0 || typeof _rapierBlockSourceStart !== 'function') return null;
	let offset;
	try { offset = _rapierCanonicalOffsetOfBody(_rapierBlockSourceStart(index)); } catch (_) { return null; }
	if (typeof offset !== 'number' || !Number.isFinite(offset)) return null;
	return text.slice(0, Math.max(0, offset)).split(/\r\n|\r|\n/).length - 1;
}

function _rapierTodoScheduleScan() {
	if (_rapierTodo.scheduled) return;
	_rapierTodo.scheduled = true;
	const run = () => { _rapierTodo.scheduled = false; try { _rapierTodoScan(); } catch (_) {} };
	if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else setTimeout(run, 16);
}
function _rapierTodoStrip(wrapper) {
	if (!wrapper) return;
	for (const row of wrapper.querySelectorAll(':scope > .rapier-todo-add-row')) row.remove();
	const read = wrapper.querySelector(':scope > .block-read');
	if (!read) return;
	const head = read.querySelector(':scope > .rapier-todo-head'); if (head) head.remove();
	const list = read.querySelector(':scope > ul, :scope > ol');
	if (list) {
		list.classList.toggle('rapier-todo-list', false); list.classList.toggle('rapier-todo-list--closed', false);
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
	const selection = window.getSelection && window.getSelection();
	for (const span of li.querySelectorAll(':scope > .rapier-todo-label')) {
		let held = null;
		if (selection && selection.rangeCount && (span.contains(selection.anchorNode) || span.contains(selection.focusNode))) {
			const parent = span.parentNode, start = Array.prototype.indexOf.call(parent.childNodes, span), count = span.childNodes.length;
			const point = (node, offset) => node === span ? {node: parent, offset: start + offset}
				: {node, offset: node === parent && offset > start ? offset + count - 1 : offset};
			held = {anchor: point(selection.anchorNode, selection.anchorOffset), focus: point(selection.focusNode, selection.focusOffset)};
		}
		while (span.firstChild) span.parentNode.insertBefore(span.firstChild, span);
		span.remove();
		if (held && held.anchor.node.isConnected && held.focus.node.isConnected &&
				(selection.anchorNode !== held.anchor.node || selection.anchorOffset !== held.anchor.offset ||
				 selection.focusNode !== held.focus.node || selection.focusOffset !== held.focus.offset)) {
			selection.setBaseAndExtent(held.anchor.node, held.anchor.offset, held.focus.node, held.focus.offset);
		}
	}
}
function _rapierTodoEnsureLabel(li) {
	const box = li.querySelector(':scope > input[type="checkbox"], :scope > .task-list-item-checkbox');
	if (!box) { _rapierTodoUnwrapLabel(li); return; }
	const existing = li.querySelector(':scope > .rapier-todo-label');
	const own = _rapierTodoLabelTextAfterBox(li, box);
	if (own && (!existing || !existing.contains(own))) { _rapierTodoUnwrapLabel(li); return; }
	if (existing) { if (existing.previousSibling !== box) box.after(existing); return; }
	const span = _rapierNotesEl('span', 'rapier-todo-label');
	span.appendChild(document.createTextNode(' '));
	box.after(span);
}
function _rapierTodoFootAddRow(wrapper) {
	const addRow = wrapper && wrapper.querySelector(':scope > .rapier-todo-add-row');
	if (addRow && wrapper.lastElementChild !== addRow) wrapper.appendChild(addRow);
}
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
	const T = _rapierTodoModel(), gesture = _rapierTodo.press || _rapierTodo.drag;
	if (gesture && (file !== gesture.file || !_rapierMutationStampSharesDocument(gesture.intent) || !gesture.wrapper.isConnected)) _rapierTodoCancelGesture();
	if (!file || !host || !T) { if (host && _rapierTodo.decorated) { for (const w of host.querySelectorAll(':scope > .block-wrapper')) _rapierTodoStrip(w); _rapierTodo.decorated = false; } return; }
	const text = _rapierTodoText();
	if (text == null) return;
	let ordinal = 0;
	const seen = new Set();
	_rapierTodo.decorated = true;
	for (const wrapper of host.querySelectorAll(':scope > .block-wrapper')) {
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
	for (const map of [_rapierTodo.collapsed, _rapierTodo.hidden]) {
		const set = map.get(file);
		if (set) for (const k of [...set]) if (!seen.has(k) && ![...seen].some(parent => k.startsWith(parent + ':'))) set.delete(k);
	}
}

function _rapierTodoDecorateEditing(wrapper) {
	if (rapier.composition.block) return;
	_rapierTodoFootAddRow(wrapper);
	const edit = wrapper.querySelector(':scope > .block-edit');
	if (!edit) return;
	for (const row of edit.querySelectorAll('li.rapier-todo-ticked-row')) row.remove();
	for (const li of edit.querySelectorAll('li')) {
		const box = li.querySelector(':scope > input[type="checkbox"], :scope > .task-list-item-checkbox');
		const handle = li.querySelector(':scope > .rapier-todo-handle');
		if (!box) {
			if (handle) handle.remove();
			_rapierTodoUnwrapLabel(li);
			li.classList.toggle('rapier-todo-item', false);
			continue;
		}
		li.classList.toggle('rapier-todo-item', true);
		if (!handle) li.insertBefore(_rapierTodoBuildHandle(), li.firstChild);
		if (li.textContent.trim()) { _rapierTodoUnwrapLabel(li); _rapierTodoDropTrailingBreaks(li); }
		else _rapierTodoEmptyRowKeepsOneLabel(li, box);
	}
}
function _rapierTodoDropTrailingBreaks(li) {
	let node = li.lastChild;
	while (node && node.nodeType === Node.TEXT_NODE && !node.data) node = node.previousSibling;
	if (!node || node.nodeName !== 'BR') return;
	let before = node.previousSibling;
	while (before && before.nodeType === Node.TEXT_NODE && !before.data) before = before.previousSibling;
	if (before && before.nodeName !== 'BR' && before.textContent.trim()) node.remove();
}
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
		while (words.length && words[0].nodeType === Node.TEXT_NODE && !words[0].data.trim()) words.shift().remove();
		if (words.length && words[0].nodeType === Node.TEXT_NODE) words[0].data = words[0].data.replace(/^\s+/, '');
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
function _rapierTodoRowContent(li) {
	return [...li.childNodes].filter(node => node.nodeType !== Node.ELEMENT_NODE || !node.matches('.rapier-todo-handle, input[type="checkbox"], ul, ol'));
}
function _rapierTodoRowNests(li) {
	return !!li.querySelector(':scope > ul, :scope > ol');
}
function _rapierTodoLastLine(li) {
	let row = li;
	for (;;) {
		const nested = [...row.children].filter(el => el.tagName === 'UL' || el.tagName === 'OL').pop();
		const items = nested ? [...nested.children].filter(el => el.tagName === 'LI' && el.getClientRects().length) : [];
		if (!items.length) return row;
		row = items[items.length - 1];
	}
}
function _rapierTodoRowLast(li) {
	const content = _rapierTodoRowContent(li);
	for (let i = content.length - 1; i >= 0; i--) if (content[i].nodeType !== Node.TEXT_NODE || content[i].data) return content[i];
	return null;
}
const RAPIER_TODO_SHOWN = 'img, svg, video, audio, iframe, canvas, math, input, .math-rendered';
function _rapierTodoRowIsEmpty(li) {
	return _rapierTodoRowContent(li).every(node => node.nodeType !== Node.ELEMENT_NODE
		? !(node.nodeType === Node.TEXT_NODE && node.data.trim())
		: node.nodeName === 'BR' || (!node.matches(RAPIER_TODO_SHOWN) && !node.textContent.trim() && !node.querySelector(RAPIER_TODO_SHOWN)));
}
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
	const breaks = [...part.querySelectorAll('br')];
	if (!backward && breaks.length === 1 && _rapierTodoRowLast(li) && _rapierTodoRowLast(li).nodeName === 'BR') breaks.pop();
	return !part.textContent.trim() && !breaks.length && !part.querySelector('ul, ol, ' + RAPIER_TODO_SHOWN);
}
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

function _rapierTodoRows(list) {
	return [...list.children].filter(el => el.tagName === 'LI' && !el.classList.contains('rapier-todo-ticked-row'));
}
function _rapierTodoDecorateBoxed(file, key, read, list, range) {
	const T = _rapierTodoModel();
	const liElements = [...list.querySelectorAll('li')].filter(li => !li.classList.contains('rapier-todo-ticked-row'));
	if (liElements.length !== range.items.length) { _rapierTodoStrip(read.closest('.block-wrapper')); return; }
	list.classList.toggle('rapier-todo-list', true);
	liElements.forEach(li => {
		li.classList.toggle('rapier-todo-item', true);
		if (!li.querySelector(':scope > .rapier-todo-handle')) li.insertBefore(_rapierTodoBuildHandle(), li.firstChild);
		_rapierTodoEnsureLabel(li);
	});
	read.querySelector(':scope > .rapier-todo-head')?.remove();

	const wrapper = read.closest('.block-wrapper');
	const stale = read.querySelector(':scope > .rapier-todo-add-row'); if (stale) stale.remove();
	let addRow = wrapper && wrapper.querySelector(':scope > .rapier-todo-add-row');
	if (wrapper && !addRow) { addRow = _rapierTodoBuildAddRow(); wrapper.appendChild(addRow); }
	if (wrapper) _rapierTodoFootAddRow(wrapper);
	if (addRow) _rapierTodoWireAddRow(addRow);

	liElements.forEach((li, i) => li.classList.toggle('rapier-todo-done', !!range.items[i].done));
	for (const group of [list, ...list.querySelectorAll('ul, ol')]) {
		group.classList.toggle('rapier-todo-list', true);
		const rows = _rapierTodoRows(group);
		for (const li of rows) li.classList.toggle('rapier-todo-branch-open', !!li.querySelector('li.rapier-todo-item:not(.rapier-todo-done)'));
		const groupKey = group === list ? key : key + ':' + liElements.indexOf(rows[0]);
		_rapierTodoLayoutTicked(file, groupKey, group, rows.filter(li => li.classList.contains('rapier-todo-done') && !li.classList.contains('rapier-todo-branch-open')).length);
	}
}

function _rapierTodoLayoutTicked(file, key, list, tickedCount) {
	let row = list.querySelector(':scope > li.rapier-todo-ticked-row');
	if (!tickedCount) { if (row) row.remove(); list.classList.toggle('rapier-todo-list--closed', false); return; }
	if (!row) {
		row = _rapierNotesEl('li', 'rapier-todo-ticked-row'); row.setAttribute('role', 'presentation');
		const btn = _rapierNotesEl('button', 'rapier-notes-chip rapier-todo-ticked'); btn.type = 'button';
		btn.appendChild(_rapierTodoChevronIcon()); btn.appendChild(document.createElement('span'));
		row.appendChild(btn); list.appendChild(row);
	}
	const btn = row.querySelector('.rapier-todo-ticked');
	const closed = _rapierTodoIsCollapsed(file, key);
	const label = btn.querySelector('span'), words = 'Checked (' + tickedCount + ')';
	if (label.textContent !== words) label.textContent = words;
	if (btn.getAttribute('aria-expanded') !== String(!closed)) btn.setAttribute('aria-expanded', String(!closed));
	btn.classList.toggle('rapier-todo-ticked--closed', closed);
	btn.onclick = evt => { evt.stopPropagation(); _rapierTodoToggleCollapsed(file, key); _rapierTodoScheduleScan(); };
	list.classList.toggle('rapier-todo-list--closed', closed);
}
function _rapierTodoIsCollapsed(file, key) {
	const set = _rapierTodo.collapsed.get(file);
	return !(set && set.has(key));
}
function _rapierTodoToggleCollapsed(file, key) {
	let set = _rapierTodo.collapsed.get(file);
	if (!set) { set = new Set(); _rapierTodo.collapsed.set(file, set); }
	if (set.has(key)) set.delete(key); else set.add(key);
}

function _rapierTodoDecoratePlain(key, read, list) {
	read.querySelector(':scope > .rapier-todo-head')?.remove();
	list.classList.toggle('rapier-todo-list', false); list.classList.toggle('rapier-todo-list--closed', false);
	const staleRow = list.querySelector(':scope > li.rapier-todo-ticked-row'); if (staleRow) staleRow.remove();
	for (const li of list.children) {
		li.classList.toggle('rapier-todo-item', false); li.classList.toggle('rapier-todo-done', false);
		const h = li.querySelector(':scope > .rapier-todo-handle'); if (h) h.remove();
		_rapierTodoUnwrapLabel(li);
	}
	const staleAdd = read.querySelector(':scope > .rapier-todo-add-row'); if (staleAdd) staleAdd.remove();
	for (const row of read.closest('.block-wrapper')?.querySelectorAll(':scope > .rapier-todo-add-row') || []) row.remove();
}

function _rapierTodoFirstList(text) {
	const T = _rapierTodoModel(); return T ? T.firstList(text) : null;
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
	let set = _rapierTodo.hidden.get(file);
	if (first && first.boxed) { if (!set) { set = new Set(); _rapierTodo.hidden.set(file, set); } set.add(file + ' 0'); }
	else if (set) set.delete(file + ' 0');
	return await _rapierTodoPersist(file, next);
}

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
function _rapierTodoAddItem(addRow) {
	if (addRow.dataset.todoAdding === '1' || typeof _rapierUserMutationBlocked !== 'function' || _rapierUserMutationBlocked()) return;
	if (typeof _rapierEditingRuntime !== 'undefined' && _rapierEditingRuntime.nativeInput) return;
	const file = _rapierNotesCurrentFile(), T = _rapierTodoModel();
	if (!file || !T || !addRow.closest('.block-wrapper') || typeof _replaceOneBlockWithRawSet !== 'function') return;
	const intent = _rapierMutationStamp();
	addRow.dataset.todoAdding = '1';
	try {
		if (typeof _leaveOtherEditingBlocks !== 'function' || _leaveOtherEditingBlocks(null) === false) return;
		if (!_rapierMutationStampSharesDocument(intent) || _rapierNotesCurrentFile() !== file || _rapierUserMutationBlocked()) return;
		const wrapper = addRow.closest('.block-wrapper'); if (!wrapper?.isConnected) return;
		const index = rapier.document.blocks.findIndex(block => String(block.id) === String(wrapper.dataset.blockId));
		const block = rapier.document.blocks[index]; if (!block) return;
		const text = _rapierTodoText(); if (text == null) return;
		const lineIndex = _rapierTodoBlockLine(text, wrapper); if (lineIndex == null) return;
		const range = T.listAt(text, lineIndex); if (!range || range.boxed !== true) return;
		const next = T.appendEmptyItem(text, range); if (next == null || next === text) return;
		const start = _rapierCanonicalOffsetOfBody(_rapierBlockSourceStart(index)), raw = String(block.raw || '');
		if (text.slice(start, start + raw.length) !== raw) return;
		const following = rapier.document.blocks[index + 1];
		const end = following ? _rapierCanonicalOffsetOfBody(_rapierBlockSourceStart(index + 1)) + String(following.raw || '').length : text.length;
		const prefix = text.slice(0, start), suffix = text.slice(end);
		if (!next.startsWith(prefix) || !next.endsWith(suffix)) return;
		const replacement = next.slice(start, next.length - suffix.length);
		const parsed = _rapierFinalizeParsedBlocks(_splitByTokenStream(replacement, md), replacement);
		if (parsed._rapierPrefix || parsed.length !== (following ? 2 : 1) || parsed[0]?.type !== 'bullet_list' ||
			following && (parsed[1].raw !== String(following.raw || '') || parsed._rapierTail)) return;
		const boundaryChanged = following && parsed[1].leading !== following.leading;
		const rows = boundaryChanged ? parsed : parsed.slice(0, 1);
		const options = {preserveRaw: true, edit: false, leading: rows.map(row => row.leading),
			...(boundaryChanged ? {nextBlock: following} : {}), ...(!following ? {tail: parsed._rapierTail} : {})};
		if (!_replaceOneBlockWithRawSet(block, rows.map(row => row.raw), 0, Infinity, options)) return;
		if (!_rapierMutationStampSharesDocument(intent) || _rapierNotesCurrentFile() !== file || _rapierTodoText() !== next) return;
		_rapierTodoScan();
		_rapierTodoCaretIntoLine(range.end);
		if (typeof _rapierNotesPending !== 'undefined') _rapierNotesPending.keep({settle: false});
		if (typeof _rapierNotesAutosave === 'function') void _rapierNotesAutosave().catch(() => {});
	} finally { delete addRow.dataset.todoAdding; }
}
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
		try { _rapierTodoDecorateEditing(wrapper); } catch (_) {}
		const items = edit ? [...edit.querySelectorAll('li')] : [];
		const li = items[range.items.findIndex(item => item.line === line)];
		if (!li) return;
		if (typeof _rapierPlaceCaretInListItem === 'function') { try { _rapierPlaceCaretInListItem(li, true); } catch (_) {} }
		if (typeof li.scrollIntoView === 'function') { try { li.scrollIntoView({block: 'nearest'}); } catch (_) {} }
		return;
	}
}

function _rapierTodoHandleDown(evt) {
	if (evt.isPrimary === false || evt.button != null && evt.button !== 0 || _rapierTodo.press || _rapierTodo.drag) return;
	const handle = evt.target && evt.target.closest ? evt.target.closest('.rapier-todo-handle') : null; if (!handle) return;
	const wrapper = handle.closest('.block-wrapper'), file = _rapierNotesCurrentFile();
	if (!wrapper?.isConnected || !file) return;
	if (wrapper.classList.contains('block-wrapper--editing') && handle.closest('.block-edit')) {
		evt.preventDefault();
		evt.stopPropagation();
		const press = {file, wrapper, intent: _rapierMutationStamp(), target: evt.target, button: evt.button, clientX: evt.clientX, clientY: evt.clientY, pointerId: evt.pointerId, preventDefault() {}, stopPropagation() {}};
		const stop = event => {
			if (event && event.pointerId !== press.pointerId) return;
			if (_rapierTodo.press === press) _rapierTodo.press = null;
			window.removeEventListener('pointermove', move, true);
			window.removeEventListener('pointerup', stop, true);
			window.removeEventListener('pointercancel', stop, true);
			window.removeEventListener('lostpointercapture', lost, true);
		};
		const lost = event => { if (event.target === press.target) stop(event); };
		const move = moved => {
			if (_rapierTodo.press !== press) return;
			if (!wrapper.isConnected || !_rapierMutationStampSharesDocument(press.intent) || _rapierNotesCurrentFile() !== file) { stop(); return; }
			if (moved.pointerId !== press.pointerId || Math.max(Math.abs(moved.clientX - press.clientX), Math.abs(moved.clientY - press.clientY)) <= 12) return;
			stop();
			_rapierTodoGrab(press, wrapper);
			if (_rapierTodo.drag) _rapierTodoDragMove(moved);
		};
		press.stop = stop; _rapierTodo.press = press;
		window.addEventListener('pointermove', move, true);
		window.addEventListener('pointerup', stop, true);
		window.addEventListener('pointercancel', stop, true);
		window.addEventListener('lostpointercapture', lost, true);
		return;
	}
	_rapierTodoGrab(evt, wrapper);
}
function _rapierTodoLocateHandle(handle) {
	const wrapper = handle?.closest('.block-wrapper'); if (!wrapper?.isConnected) return;
	let li = handle.closest('li.rapier-todo-item'); if (!li) return;
	let container = li.parentElement; if (!container) return;
	const surface = li.closest('.block-read, .block-edit');
	if (!surface || surface.parentElement !== wrapper) return;
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
	const inDoneGroup = el => el.classList.contains('rapier-todo-done') && !el.classList.contains('rapier-todo-branch-open');
	const done = inDoneGroup(li);
	const siblings = _rapierTodoRows(container).filter(el => inDoneGroup(el) === done && el.getClientRects().length);
	const fromIndex = siblings.indexOf(li);
	if (fromIndex < 0) return;
	const allRows = [...wrapper.querySelectorAll('.block-read li.rapier-todo-item')];
	const group = siblings.map(row => range.items[allRows.indexOf(row)]).filter(Boolean);
	if (group.length !== siblings.length) return;
	return {file, text, intent: _rapierMutationStamp(), wrapper, range, group, container, li, siblings, fromIndex, done, listIndex: [...li.closest('.block-read, .block-edit').querySelectorAll('ul, ol')].indexOf(container)};
}
function _rapierTodoGrab(evt, wrapper) {
	const located = _rapierTodoLocateHandle(evt.target.closest('.rapier-todo-handle')); if (!located) return;
	const {file, text, intent, range, group, container, li, siblings, fromIndex} = located;
	const handle = li.querySelector(':scope > .rapier-todo-handle');
	evt.preventDefault();
	evt.stopPropagation();
	const tops = siblings.map(el => el.getBoundingClientRect().top);
	const gap = parseFloat(getComputedStyle(li).marginBottom) || 0;
	const slots = siblings.map((el, i) => i + 1 < siblings.length ? tops[i + 1] - tops[i] : el.getBoundingClientRect().height + gap);
	_rapierTodo.drag = {file, text, intent, wrapper, handle, range, group, container, li, siblings, fromIndex, currentIndex: fromIndex,
		startX: evt.clientX, startY: evt.clientY, axis: '', tops, slots, pointerId: evt.pointerId};
	li.classList.add('rapier-todo-dragging');
	try { handle.setPointerCapture(evt.pointerId); } catch (_) {}
	window.addEventListener('pointermove', _rapierTodoDragMove);
	window.addEventListener('pointerup', _rapierTodoDragEnd);
	window.addEventListener('pointercancel', _rapierTodoDragEnd);
	window.addEventListener('lostpointercapture', _rapierTodoDragEnd, true);
}
function _rapierTodoDragMove(evt) {
	const drag = _rapierTodo.drag; if (!drag) return;
	if (evt.pointerId !== drag.pointerId) return;
	if (!drag.wrapper.isConnected || !_rapierMutationStampSharesDocument(drag.intent) || _rapierNotesCurrentFile() !== drag.file) { _rapierTodoCancelGesture(); return; }
	const dx = evt.clientX - drag.startX, dy = evt.clientY - drag.startY;
	if (!drag.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 12) drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
	if (drag.axis === 'x') { drag.indent = Math.abs(dx) >= 40 ? dx > 0 : null; drag.li.style.transform = 'translateX(' + Math.max(-48, Math.min(48, dx)) + 'px)'; return; }
	drag.li.style.transform = 'translateY(' + dy + 'px)';
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
	if (evt?.type === 'lostpointercapture' && evt.target !== drag.handle) return;
	_rapierTodo.drag = null;
	window.removeEventListener('pointermove', _rapierTodoDragMove);
	window.removeEventListener('pointerup', _rapierTodoDragEnd);
	window.removeEventListener('pointercancel', _rapierTodoDragEnd);
	window.removeEventListener('lostpointercapture', _rapierTodoDragEnd, true);
	try { if (drag.handle.hasPointerCapture(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId); } catch (_) {}
	drag.li.classList.remove('rapier-todo-dragging'); drag.li.style.transform = '';
	drag.siblings.forEach(el => { el.classList.remove('rapier-todo-shift'); el.style.transform = ''; });
	if (evt?.type !== 'pointerup') return;
	const changed = drag.axis === 'x' ? typeof drag.indent === 'boolean' : drag.fromIndex !== drag.currentIndex;
	if (!changed) return;
	if (!drag.wrapper.isConnected || !_rapierMutationStampSharesDocument(drag.intent) || _rapierNotesCurrentFile() !== drag.file || _rapierTodoText() !== drag.text) { showToast('The list changed during the drag. Try again.', 'info'); return; }
	if (drag.axis === 'x') { if (typeof drag.indent === 'boolean') await _rapierTodoIndentLine(drag.group[drag.fromIndex].line, drag.indent); return; }
	if (drag.fromIndex === drag.currentIndex) return;
	await _rapierTodoCommitMove(drag);
}

function _rapierTodoCancelGesture(event) {
	const gesture = _rapierTodo.press || _rapierTodo.drag; if (!gesture) return;
	if (event?.type === 'keydown' && (event.key !== 'Escape' || event.isComposing)) return;
	if (event?.type === 'visibilitychange' && !document.hidden) return;
	if (event?.type === 'pointerdown' && event.pointerId === gesture.pointerId) return;
	if (event?.type === 'keydown') { event.preventDefault(); event.stopPropagation(); }
	_rapierTodo.press?.stop();
	void _rapierTodoDragEnd();
}

async function _rapierTodoIndentLine(line, indent, caret = true) {
	const file = _rapierNotesCurrentFile(), T = _rapierTodoModel(), text = _rapierTodoText();
	if (!file || !T || text == null) return false;
	const intent = _rapierMutationStamp(), next = T.indentItem(text, line, indent);
	if (next == null || !await _rapierTodoPersist(file, next)) return false;
	if (caret && _rapierMutationStampSharesDocument(intent) && _rapierNotesCurrentFile() === file && _rapierTodoText() === next) _rapierTodoCaretIntoLine(line);
	return true;
}
function _rapierTodoIndentKey(evt) {
	if (evt.key !== 'Tab' || evt.isComposing || evt.keyCode === 229 || evt.ctrlKey || evt.metaKey || evt.altKey || evt.defaultPrevented || !_rapierNotesCurrentFile()) return;
	if (!evt.target.isContentEditable || evt.target.closest?.('button, input, select, textarea, a[href], summary, [role="button"]') || typeof rapier !== 'undefined' && rapier.view.tabReleases) return;
	const selection = window.getSelection?.(), node = selection?.anchorNode;
	const li = evt.target.closest?.('li.rapier-todo-item') || (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)?.closest('li.rapier-todo-item');
	const wrapper = li?.closest('.block-wrapper'); if (!wrapper) return;
	const surface = li.closest('.block-edit');
	if (!surface?.isContentEditable || !(surface.contains(evt.target) || evt.target === document.getElementById('editor-blocks') && evt.target.contains(surface))) return;
	const rows = [...surface.querySelectorAll('li.rapier-todo-item')], ordinal = rows.indexOf(li);
	if (ordinal < 0) return;
	evt.preventDefault(); evt.stopPropagation();
	if (typeof _leaveOtherEditingBlocks === 'function') _leaveOtherEditingBlocks(null);
	const text = _rapierTodoText(), line = text == null ? null : _rapierTodoBlockLine(text, wrapper);
	const range = line == null ? null : _rapierTodoModel()?.listAt(text, line);
	if (range?.items[ordinal]) void _rapierTodoIndentLine(range.items[ordinal].line, !evt.shiftKey);
}
async function _rapierTodoCommitMove(drag) {
	const {file, range, group, fromIndex, currentIndex} = drag;
	const T = _rapierTodoModel();
	const text = _rapierTodoText();
	if (text == null || text !== drag.text || !_rapierMutationStampSharesDocument(drag.intent) || _rapierNotesCurrentFile() !== file) return false;
	const fullFrom = group[fromIndex].line - range.start;
	const fullTo = group[currentIndex].line - range.start;
	const next = T.moveItem(text, range, fullFrom, fullTo);
	if (next == null) return;
	return _rapierTodoPersist(file, next);
}

async function _rapierTodoHandleKey(event) {
	const handle = event.target.closest?.('.rapier-todo-handle');
	if (!handle || event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
	event.preventDefault(); event.stopPropagation();
	if (_rapierTodo.keyBusy || _rapierTodo.drag) return;
	const located = _rapierTodoLocateHandle(handle); if (!located) return;
	const from = located.li.querySelector(':scope > .rapier-todo-handle'), line = located.group[located.fromIndex].line;
	from.focus({preventScroll: true});
	const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
	const index = located.fromIndex + (event.key === 'ArrowUp' ? -1 : 1);
	if (vertical && (index < 0 || index >= located.group.length)) return;
	const noteId = _rapierNotes.index?.notes[located.file]?.id;
	_rapierTodo.keyBusy = true;
	try {
		const changed = vertical ? await _rapierTodoCommitMove({...located, currentIndex: index}) : await _rapierTodoIndentLine(line, event.key === 'ArrowRight', false);
		if (!changed) return;
		await new Promise(resolve => requestAnimationFrame(resolve));
		if (!_rapierMutationStampSharesDocument(located.intent) || _rapierNotes.index?.notes[_rapierNotesCurrentFile()]?.id !== noteId || document.activeElement !== from && (from.isConnected || document.activeElement !== document.body)) return;
		_rapierTodoScan();
		const text = _rapierTodoText(), host = document.getElementById('editor-blocks');
		for (const wrapper of host?.querySelectorAll(':scope > .block-wrapper') || []) {
			const start = _rapierTodoBlockLine(text, wrapper), range = start == null ? null : _rapierTodoModel().listAt(text, start);
			if (!range || range.start !== located.range.start) continue;
			const surface = wrapper.querySelector(':scope > .block-read, :scope > .block-edit'); if (!surface) continue;
			let row;
			if (vertical) {
				const list = [...surface.querySelectorAll('ul, ol')][located.listIndex];
				row = list && _rapierTodoRows(list).filter(item => (item.classList.contains('rapier-todo-done') && !item.classList.contains('rapier-todo-branch-open')) === located.done)[index];
			} else row = [...surface.querySelectorAll('li.rapier-todo-item')][range.items.findIndex(item => item.line === line)];
			const target = row?.querySelector(':scope > .rapier-todo-handle');
			if (target) { target.focus({preventScroll: true}); target.scrollIntoView({block: 'nearest'}); }
			else host.focus({preventScroll: true});
			return;
		}
		host?.focus({preventScroll: true});
	} catch (_) {
		if (typeof showToast === 'function') showToast('The list could not be changed. Try again.', 'error');
	} finally { _rapierTodo.keyBusy = false; }
}

function _rapierTodoInit() {
	const host = document.getElementById('editor-blocks');
	if (!host) return;
	if (!_rapierTodo.observer) {
		_rapierTodo.observer = new MutationObserver(() => _rapierTodoScheduleScan());
		_rapierTodo.observer.observe(host, {childList: true, subtree: true});
		host.addEventListener('pointerdown', _rapierTodoHandleDown, true);
		host.addEventListener('beforeinput', _rapierTodoDeleteAcrossRows, true);
		host.addEventListener('keydown', _rapierTodoIndentKey, true);
		host.addEventListener('compositionend', _rapierTodoScheduleScan);
		window.addEventListener('keydown', _rapierTodoHandleKey, true);
		window.addEventListener('keydown', _rapierTodoCancelGesture, true);
		window.addEventListener('pointerdown', _rapierTodoCancelGesture, true);
		window.addEventListener('blur', _rapierTodoCancelGesture);
		window.addEventListener('pagehide', _rapierTodoCancelGesture);
		document.addEventListener('visibilitychange', _rapierTodoCancelGesture);
	}
	_rapierTodoScheduleScan();
}
