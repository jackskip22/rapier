
const RAPIER_TABLE_ALIGN_NEXT = { '': 'left', left: 'center', center: 'right', right: '' };
const RAPIER_TABLE_ALIGN_WORD = { '': 'as written', left: 'left', center: 'center', right: 'right' };

function _rapierTableCellsOf(row) {
	return row ? Array.from(row.children).filter(node => /^(?:TH|TD)$/.test(node.tagName)) : [];
}

function _rapierTableChrome(wrapper, toolbar, info, position) {
	const table = wrapper && wrapper.querySelector(':scope > .block-edit table');
	if (table && info) _rapierTableWidths(table.closest('.block-edit'), info.lines.join('\n'));
	if (table) {
		table.querySelectorAll('.rapier-cell--caret, .rapier-cell--line').forEach(cell =>
			cell.classList.remove('rapier-cell--caret', 'rapier-cell--line'));
		table.querySelectorAll('[data-rapier-hint]').forEach(cell => cell.removeAttribute('data-rapier-hint'));
		const rows = Array.from(table.querySelectorAll('tr'));
		const row = position && rows[position.rowIndex];
		const cell = row && _rapierTableCellsOf(row)[position.cellIndex];
		if (cell && wrapper.classList.contains('block-wrapper--editing')) {
			_rapierTableCellsOf(row).forEach(node => node.classList.add('rapier-cell--line'));
			rows.forEach(each => _rapierTableCellsOf(each)[position.cellIndex]?.classList.add('rapier-cell--line'));
			cell.classList.add('rapier-cell--caret');
			const heads = _rapierTableCellsOf(rows[0]);
			if (position.rowIndex > 0) _rapierTableCellsOf(row).forEach((node, index) => {
				node.dataset.rapierHint = String(heads[index]?.textContent || '').replace(/\u200b/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'Cell';
			});
			_rapierTableKeepInView(table, cell, position.cellIndex);
		}
		_rapierTableMotion(wrapper, table, position);
	}
	_rapierTableGrips(wrapper, position);
	const align = toolbar && toolbar.querySelector('button[data-table-action="align"]');
	if (align && info) {
		const col = position && Number.isInteger(position.cellIndex) ? Math.max(0, Math.min(info.cols - 1, position.cellIndex)) : 0;
		const current = info.alignments[col] || '';
		align.dataset.tableAlignNow = current;
		align.dataset.tableAlignShown = current || 'left';
		align.setAttribute('aria-label', 'align column: ' + RAPIER_TABLE_ALIGN_WORD[current] + '; tap for ' + RAPIER_TABLE_ALIGN_WORD[RAPIER_TABLE_ALIGN_NEXT[current]]);
		align.title = align.getAttribute('aria-label');
	}
}

function _rapierTableKeepInView(table, cell, cellIndex) {
	const scroller = table.closest('.table-scroll-wrap');
	if (!scroller || scroller.scrollWidth <= scroller.clientWidth + 1) return;
	const box = scroller.getBoundingClientRect(), at = cell.getBoundingClientRect();
	if (at.left < box.left - 1) scroller.scrollLeft -= box.left - at.left;
	else if (at.right > box.right + 1) scroller.scrollLeft += Math.min(at.right - box.right, at.left - box.left);
}

let _rapierTableArriving = 0;
function _rapierTableArriveNext() { _rapierTableArriving = _rapierNow() + 1500; }
function _rapierTableMotion(wrapper, table, position) {
	const play = (nodes, name) => nodes.forEach(node => {
		node.classList.remove(name);
		void node.offsetWidth;
		node.classList.add(name);
		node.addEventListener('animationend', () => node.classList.remove(name), { once: true });
	});
	if (_rapierTableArriving && wrapper.classList.contains('block-wrapper--editing')) {
		if (_rapierNow() < _rapierTableArriving) play([table], 'rapier-table--arrive');
		_rapierTableArriving = 0;
	}
	if (!position) return;
	const rows = Array.from(table.querySelectorAll('tr'));
	if (position.arrive === 'row') play(_rapierTableCellsOf(rows[position.rowIndex]), 'rapier-cell--arrive');
	if (position.arrive === 'col') play(rows.map(row => _rapierTableCellsOf(row)[position.cellIndex]).filter(Boolean), 'rapier-cell--arrive-col');
	if (Number.isInteger(position.closeFrom)) play(rows.slice(position.closeFrom).flatMap(_rapierTableCellsOf), 'rapier-cell--close');
	if (position.widen) _rapierTableCellsOf(rows[0]).forEach((head, index) => {
		const from = position.widen.from[index];
		const dx = index > position.widen.index && Number.isFinite(from) ? Math.round(from - head.getBoundingClientRect().left) : 0;
		if (!dx) return;
		const cells = rows.map(row => _rapierTableCellsOf(row)[index]).filter(Boolean);
		cells.forEach(node => node.style.setProperty('--rapier-widen-from', dx + 'px'));
		play(cells, 'rapier-cell--widen');
	});
}

function _rapierTableShape(root) {
	const host = root.closest && root.closest('.block-wrapper');
	const block = host && _rapierBoundBlock(host);
	if (block) _rapierTableWidths(root, block.raw);
	root.querySelectorAll('table').forEach(_rapierTablePinchWatch);
	const number = /^[(\-+\u2212]?[$\u20ac\u00a3\u00a5\u20b9]?\s?\d[\d,.\u00a0\u202f ]*(?:%|[kKmMbB]n?)?\)?$/;
	root.querySelectorAll('table').forEach(table => {
		const rows = Array.from(table.rows || []);
		if (rows.length < 2) return;
		const cols = Math.max(0, ...rows.map(row => _rapierTableCellsOf(row).length));
		for (let col = 0; col < cols; col++) {
			const values = rows.slice(1).map(row => _rapierTableCellsOf(row)[col]).filter(Boolean)
				.map(cell => String(cell.textContent || '').trim()).filter(Boolean);
			const numeric = values.length > 0 && values.every(value => number.test(value));
			rows.forEach(row => _rapierTableCellsOf(row)[col]?.classList.toggle('rapier-cell--num', numeric));
		}
	});
}

function _rapierTableAlignNext(blockId, position) {
	const block = rapier.document.blocks.find(candidate => candidate.id === blockId);
	if (!block) return;
	const info = _tableInfo(_tableRawFromBlock(blockId) || block.raw);
	const col = position && Number.isInteger(position.cellIndex) ? Math.max(0, Math.min(info.cols - 1, position.cellIndex)) : 0;
	const current = info.alignments[col] || '';
	const next = RAPIER_TABLE_ALIGN_NEXT[current];
	_tableSetAlignment(blockId, next || current, position);
}

function _rapierTableRemove(blockId) {
	const block = rapier.document.blocks.find(candidate => candidate.id === blockId);
	return !!block && _replaceOneBlockWithRawSet(block, [_rapierEmptyParagraphRaw(rapier.document.blocks.length)], 0, 0, { keepEmpty: true });
}

function _rapierTableSwallowClick(pressed) {
	const x = pressed.clientX, y = pressed.clientY, until = _rapierNow() + 800;
	const swallow = click => {
		document.removeEventListener('click', swallow, true);
		if (_rapierNow() > until || Math.hypot(click.clientX - x, click.clientY - y) > 32) return;
		click.preventDefault();
		click.stopImmediatePropagation();
	};
	document.addEventListener('click', swallow, true);
	setTimeout(() => document.removeEventListener('click', swallow, true), 800);
}

function _rapierTableEnter(editDiv, wrapper, block, cell, opts = {}) {
	const position = _rapierTableActionPosition(editDiv);
	const selection = window.getSelection && window.getSelection();
	let range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
	const table = cell.closest('table');
	if (!position || !table || !range || !range.collapsed || !cell.contains(range.startContainer)) return false;
	if (!opts.sourceCheckpointed) _commitLiveBlockBeforeStructure(block, wrapper, editDiv);
	const offset = _charOffsetForRangePoint(cell, range.startContainer, range.startOffset);
	const firstParagraph = cell.querySelector(':scope > p');
	const firstLine = !firstParagraph || firstParagraph.contains(range.startContainer) || range.startContainer === cell && range.startOffset === 0;
	if (position.rowIndex === 0 && position.cellIndex === 0 && offset === 0 && firstLine &&
			_rapierShownWrappers(_editorHostEl())[0] === wrapper && !_rapierNotesOwnTheDocument()) {
		const raw = opts.sourceCheckpointed ? _tableRawFromEdit(block.id) : block.raw;
		return _replaceOneBlockWithRawSet(block, [_rapierEmptyParagraphRaw(rapier.document.blocks.length + 1), raw], 1, 0);
	}
	if (_isTableBlock(block.raw) && !cell.querySelector('p')) {
		if (_rapierTableTypedRow(block, cell, position, range, offset)) return true;
		_insertSoftBreak(editDiv, range);
		const before = document.createRange();
		before.setStart(cell, 0);
		before.setEnd(selection.getRangeAt(0).startContainer, selection.getRangeAt(0).startOffset);
		const lineIndex = before.cloneContents().querySelectorAll('br').length;
		return _tableApply(block.id, _tableRawFromDom(block.id, table), { ...position, lineIndex, charOffset: 0 });
	}
	let paragraph = _nodeAsElement(range.startContainer)?.closest('p');
	if (!paragraph || paragraph.parentElement !== cell) {
		paragraph = document.createElement('p');
		while (cell.firstChild) paragraph.appendChild(cell.firstChild);
		cell.appendChild(paragraph);
		_setCursorCharOffset(paragraph, offset);
		range = selection.getRangeAt(0);
	}
	const paragraphIndex = Array.from(cell.children).filter(node => node.tagName === 'P').indexOf(paragraph) + 1;
	_insertQuoteParagraph(editDiv, range, paragraph);
	return _tableApply(block.id, _tableRawFromDom(block.id, table), { ...position, paragraphIndex, charOffset: 0 });
}

function _rapierTableTypedRow(block, cell, position, range, offset) {
	const typed = position.rowIndex > 0 ? String(cell.textContent || '').replace(/[\u200b\u00a0]/g, ' ').trim() : '';
	if (!/^\|.*[^\\]\|$/.test(typed) || offset < String(cell.textContent || '').replace(/\u200b/g, '').trimEnd().length) return false;
	if (!_rapierTableCellsOf(cell.closest('tr')).every(each => each === cell || !String(each.textContent || '').replace(/\u200b/g, '').trim())) return false;
	const info = _tableInfo(block.raw), cells = _tableSplitRow(typed), at = info.dataIdxs[position.rowIndex - 1];
	if (!cells || at === undefined || info.sepIdx < 0) return false;
	const separator = _tableIsSeparator(typed), lines = info.lines.slice();
	lines[at] = _tableBuildRow(separator ? Array(info.cols).fill('') : Array.from({length: info.cols}, (_, index) => cells[index] || ''));
	const next = separator ? position.rowIndex : position.rowIndex + 1;
	if (!separator && next > info.dataIdxs.length) lines.push(_tableBuildRow(Array(info.cols).fill('')));
	return _tableApply(block.id, lines.join('\n'), { rowIndex: next, cellIndex: 0, charOffset: 0 });
}

function _rapierTableGrips(wrapper, position) {
	const editing = wrapper.classList.contains('block-wrapper--editing');
	const table = editing ? wrapper.querySelector(':scope > .block-edit table') : null;
	const row = table && position ? Array.from(table.querySelectorAll('tr'))[position.rowIndex] : null;
	const cell = row ? _rapierTableCellsOf(row)[position.cellIndex] : null;
	let grips = Array.from(wrapper.querySelectorAll(':scope > .table-grip'));
	if (!cell) { grips.forEach(grip => { grip.hidden = true; }); return; }
	if (grips.length !== 3) {
		grips.forEach(grip => grip.remove());
		grips = ['row', 'col', 'edge'].map(axis => {
			const grip = document.createElement('button');
			grip.type = 'button';
			grip.className = 'table-grip table-grip--' + axis;
			grip.tabIndex = -1;
			grip.setAttribute('contenteditable', 'false');
			grip.dataset.tableGrip = axis;
			const keys = _rapierChordWords(_rapierTableKeys()[axis === 'edge' ? 'width' : 'move']);
			grip.setAttribute('aria-label', axis === 'row' ? 'this row: tap to pick it, drag to move it (' + keys + 'Up, ' + keys + 'Down)'
				: axis === 'col' ? 'this column: tap to pick it, drag to move it (' + keys + 'Left, ' + keys + 'Right)' : 'this column\'s width: drag to widen it (' + keys + 'Left, ' + keys + 'Right)');
			grip.addEventListener('pointerdown', _rapierTableGripDown);
			wrapper.appendChild(grip);
			return grip;
		});
	}
	const scroller = table.closest('.table-scroll-wrap');
	if (scroller && !scroller._rapierGripScroll) {
		scroller._rapierGripScroll = true;
		scroller.addEventListener('scroll', () => {
			const host = scroller.closest('.block-wrapper--editing');
			if (host) _rapierTableGrips(host, _rapierTableActionPosition(host.querySelector(':scope > .block-edit')));
		}, { passive: true });
	}
	const box = wrapper.getBoundingClientRect(), t = table.getBoundingClientRect(), r = row.getBoundingClientRect(), c = cell.getBoundingClientRect();
	const scrolled = scroller ? scroller.getBoundingClientRect() : t;
	const clip = { left: scrolled.left, right: scrolled.right };
	const [rowGrip, colGrip, edgeGrip] = grips;
	rowGrip.hidden = false;
	let rowLeft = Math.max(t.left, scrolled.left) - 22;
	const k = _rapierTableScaleOf(table);
	if (k < 1) {
		const first = getComputedStyle(_rapierTableCellsOf(row)[0]);
		const words = _rapierTableCellsOf(row)[0].getBoundingClientRect().left + (parseFloat(first.paddingLeft) + parseFloat(first.borderLeftWidth)) * k;
		rowLeft = Math.min(rowLeft, words - 28);
	}
	rowGrip.style.left = Math.round(rowLeft - box.left) + 'px';
	const firstCell = _rapierTableCellsOf(row)[0], firstStyle = firstCell && getComputedStyle(firstCell);
	const wordsAt = firstCell ? firstCell.getBoundingClientRect().left + (parseFloat(firstStyle.paddingLeft) + parseFloat(firstStyle.borderLeftWidth)) * k : Infinity;
	const over = Math.round(rowLeft) + 44 - Math.max(wordsAt, Math.round(rowLeft) + 28);
	rowGrip.style.clipPath = over > 0 ? 'inset(0 ' + Math.ceil(over) + 'px 0 0)' : '';
	rowGrip.style.top = Math.round(r.top + r.height / 2 - box.top - 22) + 'px';
	rowGrip.dataset.index = String(position.rowIndex);
	const centre = c.left + c.width / 2;
	colGrip.hidden = centre < clip.left || centre > clip.right;
	colGrip.style.left = Math.round(centre - box.left - 22) + 'px';
	colGrip.style.top = Math.round(t.top - box.top - 36) + 'px';
	colGrip.dataset.index = String(position.cellIndex);
	const edge = Math.min(Math.max(c.right, centre + 44), box.right - 22);
	edgeGrip.hidden = c.right < clip.left || c.right > clip.right + 22;
	edgeGrip.style.left = Math.round(edge - box.left - 22) + 'px';
	edgeGrip.style.top = colGrip.style.top;
	edgeGrip.dataset.index = String(position.cellIndex);
}

function _rapierTableWidths(root, raw) {
	const tables = root && root.querySelectorAll ? root.querySelectorAll('table') : [];
	if (tables.length !== 1 || !raw) return;
	const info = _tableInfo(raw);
	if (info.sepIdx < 0) return;
	const markers = _tableSplitRow(info.lines[info.sepIdx]) || [];
	_rapierTableCellsOf(tables[0].rows[0]).forEach((cell, index) => {
		const dashes = String(markers[index] || '').replace(/[^-]/g, '').length;
		cell.style.minWidth = dashes > 3 ? 'calc(' + Math.min(dashes, 120) + 'ch + 2 * var(--space-3))' : '';
	});
}

function _rapierTableWiden(wrapper, table, index, grip, down, position) {
	const head = _rapierTableCellsOf(table.rows[0])[index];
	if (!head) return;
	const k = _rapierTableScaleOf(table);
	const rect = head.getBoundingClientRect();
	const at = { left: rect.left, width: rect.width / k };
	const style = getComputedStyle(head);
	const pad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
	const measure = (_rapierTableWiden.canvas ||= document.createElement('canvas')).getContext('2d');
	measure.font = style.font;
	const ch = Math.max(1, measure.measureText('0').width);
	const was = head.style.minWidth;
	head.style.minWidth = '0px';
	const least = Math.max(head.getBoundingClientRect().width / k, ch * 3 + pad);
	head.style.minWidth = was;
	const guide = document.createElement('div');
	guide.className = 'table-drop';
	guide.hidden = true;
	wrapper.appendChild(guide);
	let width = at.width, moved = false;
	const move = event => {
		if (!moved && Math.abs(event.clientX - down.clientX) < 8) return;
		moved = true;
		width = Math.max(least, Math.max(3, Math.round((at.width + (event.clientX - down.clientX) / k - pad) / ch)) * ch + pad);
		const box = wrapper.getBoundingClientRect(), t = table.getBoundingClientRect();
		guide.hidden = false;
		Object.assign(guide.style, { left: '0px', top: (t.top - box.top) + 'px', width: '2px', height: t.height + 'px',
			transform: 'translateX(' + Math.round(at.left + width * k - box.left - 1) + 'px)' });
		grip.style.transform = 'translateX(' + Math.round((width - at.width) * k) + 'px)';
		event.preventDefault();
	};
	const end = () => {
		grip.removeEventListener('pointermove', move);
		grip.removeEventListener('pointerup', end);
		grip.removeEventListener('pointercancel', end);
		guide.remove();
		grip.style.transform = '';
		if (!moved) { _rapierTableSwallowClick(down); return; }
		const blockId = Number(wrapper.dataset.blockId);
		_rapierTableWriteWidth(blockId, table, index, width <= least + 0.5 ? 3 : Math.max(3, Math.round((width - pad) / ch)), position);
	};
	grip.addEventListener('pointermove', move);
	grip.addEventListener('pointerup', end);
	grip.addEventListener('pointercancel', end);
}
function _rapierTableWriteWidth(blockId, table, index, dashes, position) {
	const raw = _tableRawFromBlock(blockId);
	const info = raw ? _tableInfo(raw) : null;
	if (!info || info.sepIdx < 0) return false;
	let seen = -1, changed = false;
	const line = info.lines[info.sepIdx].replace(/-+/g, run => {
		seen++;
		if (seen !== index || run.length === dashes) return run;
		changed = true;
		return '-'.repeat(dashes);
	});
	if (!changed) return false;
	const lines = info.lines.slice();
	lines[info.sepIdx] = line;
	const from = _rapierTableCellsOf(table.rows[0]).map(cell => cell.getBoundingClientRect().left);
	return _rapierTableApplyWidth(blockId, lines.join('\n'), position, { index, from });
}
function _rapierTableApplyWidth(blockId, raw, position, widen = null) {
	_rapierCheckpointEdit(document.querySelector('[data-block-id="' + blockId + '"] > .block-edit'));
	return _tableApply(blockId, raw, { rowIndex: Math.max(0, Number(position?.rowIndex) || 0), cellIndex: Math.max(0, Number(position?.cellIndex) || 0), charOffset: Infinity, widen });
}

function _rapierTableGripDown(event) {
	const grip = event.currentTarget;
	const wrapper = grip.closest('.block-wrapper');
	const editDiv = wrapper && wrapper.querySelector(':scope > .block-edit');
	const table = editDiv && editDiv.querySelector('table');
	if (!table || (event.button != null && event.button !== 0) || _rapierUserMutationBlocked(false)) return;
	event.preventDefault();
	event.stopPropagation();
	const axis = grip.dataset.tableGrip, from = Number(grip.dataset.index);
	const position = _rapierTableActionPosition(editDiv);
	try { grip.setPointerCapture(event.pointerId); } catch (_) {}
	if (axis === 'edge') { _rapierTableWiden(wrapper, table, from, grip, event, position); return; }
	const drop = document.createElement('div');
	drop.className = 'table-drop';
	drop.hidden = true;
	wrapper.appendChild(drop);
	let target = from, dragging = false;
	const slots = () => axis === 'row'
		? Array.from(table.querySelectorAll('tr')).map(each => each.getBoundingClientRect())
		: _rapierTableCellsOf(table.querySelector('tr')).map(each => each.getBoundingClientRect());
	const move = moved => {
		if (!dragging && Math.hypot(moved.clientX - event.clientX, moved.clientY - event.clientY) < 8) return;
		dragging = true;
		const rects = slots(), at = axis === 'row' ? moved.clientY : moved.clientX;
		let before = rects.findIndex(rect => at < (axis === 'row' ? rect.top + rect.height / 2 : rect.left + rect.width / 2));
		if (before < 0) before = rects.length;
		target = before > from ? before - 1 : before;
		const box = wrapper.getBoundingClientRect(), t = table.getBoundingClientRect();
		const edge = before < rects.length ? (axis === 'row' ? rects[before].top : rects[before].left) : (axis === 'row' ? rects[rects.length - 1].bottom : rects[rects.length - 1].right);
		drop.hidden = false;
		if (axis === 'row') Object.assign(drop.style, { left: (t.left - box.left) + 'px', top: (edge - box.top - 1) + 'px', width: t.width + 'px', height: '2px' });
		else Object.assign(drop.style, { left: (edge - box.left - 1) + 'px', top: (t.top - box.top) + 'px', width: '2px', height: t.height + 'px' });
		moved.preventDefault();
	};
	const end = () => {
		grip.removeEventListener('pointermove', move);
		grip.removeEventListener('pointerup', end);
		grip.removeEventListener('pointercancel', end);
		drop.remove();
		if (!dragging) { _rapierTableSwallowClick(event); _rapierTablePickLine(table, axis, from); }
		if (!dragging || target === from) return;
		_rapierCheckpointEdit(editDiv);
		_rapierTableMove(Number(wrapper.dataset.blockId), axis, from, target, position);
	};
	grip.addEventListener('pointermove', move);
	grip.addEventListener('pointerup', end);
	grip.addEventListener('pointercancel', end);
}

function _rapierTableMove(blockId, axis, from, to, position) {
	if (_rapierUserMutationBlocked()) return false;
	const raw = _tableRawFromBlock(blockId);
	const info = raw ? _tableInfo(raw) : null;
	if (!info || info.sepIdx < 0) return false;
	const lines = info.lines.slice();
	if (axis === 'row') {
		const order = [info.rowIdxs.find(index => index < info.sepIdx), ...info.dataIdxs];
		if (!(from >= 0 && from < order.length && to >= 0 && to < order.length) || from === to || !Number.isInteger(order[0])) return false;
		const moved = order.map(index => info.lines[index]);
		moved.splice(to, 0, moved.splice(from, 1)[0]);
		order.forEach((index, k) => { lines[index] = moved[k]; });
		return _tableApply(blockId, lines.join('\n'), { rowIndex: to, cellIndex: Math.max(0, Number(position?.cellIndex) || 0), charOffset: Infinity, arrive: 'row' });
	}
	if (!(from >= 0 && from < info.cols && to >= 0 && to < info.cols) || from === to) return false;
	const next = lines.map((line, index) => {
		const cells = _tableSplitRow(line);
		if (!cells) return line;
		while (cells.length < info.cols) cells.push(index === info.sepIdx ? '---' : '');
		cells.splice(to, 0, cells.splice(from, 1)[0]);
		return _tableBuildRow(cells);
	});
	return _tableApply(blockId, next.join('\n'), { rowIndex: Math.max(0, Number(position?.rowIndex) || 0), cellIndex: to, charOffset: Infinity, arrive: 'col' });
}

function _rapierTableKeys() {
	return _rapierMac() ? { move: 'Ctrl+Shift+', width: 'Ctrl+Alt+Shift+', pick: 'Ctrl+' } : { move: 'Alt+', width: 'Alt+Shift+', pick: 'Mod+' };
}
function _rapierTableKey(editDiv, event) {
	if (event.defaultPrevented || event.isComposing) return false;
	const chord = _rapierChordOf(event), keys = _rapierTableKeys(), arrow = chord.replace(/^.*\+/, '');
	const step = chord === keys.pick + ' ' ? ['pick', 'col'] : chord === keys.pick + 'Shift+ ' ? ['pick', 'row']
		: chord === keys.move + arrow ? { Up: ['row', -1], Down: ['row', 1], Left: ['col', -1], Right: ['col', 1] }[arrow]
		: chord === keys.width + arrow ? { Left: ['width', -1], Right: ['width', 1] }[arrow] : null;
	const wrapper = step && editDiv.closest('.block-wrapper--editing.block-wrapper--table');
	const position = wrapper && _rapierTableActionPosition(editDiv);
	if (!position) return false;
	event.preventDefault();
	const [axis, delta] = step, blockId = Number(wrapper.dataset.blockId);
	if (axis === 'pick') {
		_rapierTablePickLine(editDiv.querySelector('table'), delta, delta === 'row' ? position.rowIndex : position.cellIndex);
		return true;
	}
	_rapierCheckpointEdit(editDiv);
	if (axis === 'width') {
		const table = editDiv.querySelector('table'), head = table && _rapierTableCellsOf(table.rows[0])[position.cellIndex];
		if (!head) return true;
		const info = _tableInfo(_tableRawFromBlock(blockId) || ''), run = (info.lines[info.sepIdx] || '').match(/-+/g)?.[position.cellIndex]?.length || 3;
		let from = run;
		if (run <= 3) {
			const style = getComputedStyle(head), pad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
			const measure = (_rapierTableWiden.canvas ||= document.createElement('canvas')).getContext('2d');
			measure.font = style.font;
			from = Math.round((head.getBoundingClientRect().width / _rapierTableScaleOf(table) - pad) / Math.max(1, measure.measureText('0').width));
		}
		_rapierTableWriteWidth(blockId, table, position.cellIndex, Math.max(3, from + delta), position);
		return true;
	}
	const from = axis === 'row' ? position.rowIndex : position.cellIndex;
	_rapierTableMove(blockId, axis, from, from + delta, position);
	return true;
}

function _rapierTableDelimitedGrid(text) {
	const body = String(text || '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
	if (!body || body.length > 1048576 || !/\n/.test(body)) return null;
	for (const separator of ['\t', ',']) {
		const rows = [];
		let row = [], cell = '', quoted = false, fresh = true, spaced = false;
		for (let index = 0; index < body.length; index++) {
			const char = body[index];
			if (quoted) {
				if (char !== '"') cell += char;
				else if (body[index + 1] === '"') { cell += '"'; index++; }
				else quoted = false;
			} else if (char === '"' && fresh) { quoted = true; fresh = false; }
			else if (char === separator) { row.push(cell.trim()); cell = ''; fresh = true; if (body[index + 1] === ' ') spaced = true; }
			else if (char === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; fresh = true; }
			else { cell += char; if (char !== ' ') fresh = false; }
		}
		if (quoted) continue;
		row.push(cell.trim()); rows.push(row);
		const width = rows[0].length;
		if (rows.length < 2 || width < 2 || rows.some(each => each.length !== width)) continue;
		if (rows.every(each => !each[0])) continue;
		if (separator === ',' && (spaced || rows.some(each => each.some(value => value.length > 64 || /[.!?;:]\s/.test(value))))) continue;
		return rows;
	}
	return null;
}

function _rapierTableFromDelimited(text) {
	const selection = window.getSelection && window.getSelection();
	const at = selection && selection.rangeCount ? selection.getRangeAt(0).startContainer : null;
	if ((at && (at.nodeType === 1 ? at : at.parentElement)?.closest?.('pre, code, td, th')) || !/[\t,]/.test(String(text || ''))) return null;
	const grid = _rapierTableDelimitedGrid(text);
	if (!grid) return null;
	const plain = value => turndown.escape(String(value).replace(/\u00a0/g, ' ').replace(/\s*\n\s*/g, ' '));
	_rapierTableArriveNext();
	return [_tableBuildRow(grid[0].map(plain)), _tableSeparator(grid[0].length), ...grid.slice(1).map(row => _tableBuildRow(row.map(plain)))].join('\n');
}

function _rapierTableHtmlPaste(event) {
	const html = event.clipboardData ? event.clipboardData.getData('text/html') : '';
	if (event.defaultPrevented || !/<table\b/i.test(html)) return;
	const selection = window.getSelection && window.getSelection();
	const at = selection && selection.rangeCount ? selection.getRangeAt(0).startContainer : null;
	const place = at && (at.nodeType === 1 ? at : at.parentElement);
	if (place?.closest?.('#editor-blocks') && !place.closest('pre, code, td, th')) _rapierTableArriveNext();
}

function _rapierTableFromTypedRow(block, wrapper, editDiv, prefixRaw, suffixRaw) {
	const line = String(prefixRaw || '').trim();
	if (String(suffixRaw || '').trim() || /\n/.test(line) || !/^\|.*[^\\]\|$/.test(line) || _tableIsSeparator(line)) return false;
	const cells = _tableSplitRow(line);
	if (!cells || !cells.some(value => value)) return false;
	_commitLiveBlockBeforeStructure(block, wrapper, editDiv);
	_rapierTableArriveNext();
	const raw = [line, _tableSeparator(cells.length), _tableBuildRow(Array(cells.length).fill(''))].join('\n');
	if (!_replaceOneBlockWithRawSet(block, [raw], 0, 0)) return false;
	const open = _rapierActiveEditDiv();
	if (open) _rapierMoveTableCaret(open, 1, 0);
	return true;
}

let _rapierTablePick = null;
function _rapierTablePickNow() {
	const selection = window.getSelection && window.getSelection();
	if (!selection || !selection.rangeCount || selection.isCollapsed) return null;
	const cellOf = node => (node && (node.nodeType === 1 ? node : node.parentElement))?.closest?.('th,td') || null;
	const from = cellOf(selection.anchorNode), to = cellOf(selection.focusNode);
	if (!from || !to || from === to) return null;
	const table = from.closest('table');
	const grip = table && table._rapierGrip;
	if (!grip || grip.anchor !== selection.anchorNode || grip.anchorOffset !== selection.anchorOffset ||
			grip.focus !== selection.focusNode || grip.focusOffset !== selection.focusOffset) return null;
	const wrapper = table && table.closest('.block-wrapper--editing.block-wrapper--table');
	const editDiv = wrapper && wrapper.querySelector(':scope > .block-edit');
	if (!editDiv || to.closest('table') !== table || !editDiv.contains(table)) return null;
	const rows = Array.from(table.querySelectorAll('tr'));
	const at = cell => [rows.indexOf(cell.closest('tr')), _rapierTableCellsOf(cell.closest('tr')).indexOf(cell)];
	const [r1, c1] = at(from), [r2, c2] = at(to);
	if (r1 < 0 || r2 < 0 || c1 < 0 || c2 < 0) return null;
	return { blockId: Number(wrapper.dataset.blockId), editDiv, rows,
		r0: Math.min(r1, r2), r1: Math.max(r1, r2), c0: Math.min(c1, c2), c1: Math.max(c1, c2) };
}

function _rapierTablePickShow() {
	const pick = _rapierTablePickNow();
	if (pick || _rapierTablePick) document.querySelectorAll('#editor-blocks .rapier-cell--picked').forEach(cell => cell.classList.remove('rapier-cell--picked'));
	_rapierTablePick = pick;
	if (!pick) return;
	pick.rows.slice(pick.r0, pick.r1 + 1).forEach(row =>
		_rapierTableCellsOf(row).slice(pick.c0, pick.c1 + 1).forEach(cell => cell.classList.add('rapier-cell--picked')));
}

function _rapierTablePickLine(table, axis, index) {
	const rows = Array.from(table.querySelectorAll('tr'));
	const cells = axis === 'row' ? _rapierTableCellsOf(rows[index]) : rows.map(row => _rapierTableCellsOf(row)[index]).filter(Boolean);
	const selection = window.getSelection && window.getSelection();
	if (cells.length < 2 || !selection) return false;
	const last = cells[cells.length - 1];
	selection.setBaseAndExtent(cells[0], 0, last, last.childNodes.length);
	table._rapierGrip = { anchor: selection.anchorNode, anchorOffset: selection.anchorOffset, focus: selection.focusNode, focusOffset: selection.focusOffset };
	_rapierTablePickShow();
	return true;
}

function _rapierTableSelected() {
	const selection = window.getSelection && window.getSelection();
	if (!selection || !selection.rangeCount || selection.isCollapsed) return null;
	const range = selection.getRangeAt(0);
	const cellOf = node => (node && (node.nodeType === 1 ? node : node.parentElement))?.closest?.('th,td') || null;
	const wrapper = _blockWrapperOf(range.startContainer);
	const editDiv = wrapper && wrapper.classList.contains('block-wrapper--editing')
		? wrapper.querySelector(':scope > .block-edit') : null;
	const table = editDiv && editDiv.querySelector('table'), block = wrapper && _rapierBoundBlock(wrapper);
	const admitted = wrapper && (wrapper.classList.contains('block-wrapper--table') ||
		block?.type === 'html_block' && /^<table(?:\s|>)/i.test(block.raw.trim()) && !_rapierRawEditorReason(block.raw));
	if (!table || !admitted || !editDiv.contains(range.startContainer) || !editDiv.contains(range.endContainer) ||
			cellOf(range.startContainer) === cellOf(range.endContainer)) return null;
	return { editDiv, table, blockId: Number(wrapper.dataset.blockId), parts: _rapierTableCellRanges(table, range) };
}

function _rapierTableTake(span, inputType) {
	if (_rapierUserMutationBlocked()) return false;
	const { editDiv, table, blockId, parts } = span;
	if (!parts.length) return true;
	const selection = window.getSelection(), selectedRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
	const first = selectedRange && table.contains(selectedRange.startContainer) ? selectedRange : parts[0].range;
	const start = _nodeAsElement(first.startContainer), cell = start?.closest('td,th'), paragraph = start?.closest('td > p, th > p');
	const surface = paragraph || cell, offset = surface ? _charOffsetForRangePoint(surface, first.startContainer, first.startOffset) : 0;
	const keepsParagraph = selectedRange && Array.from(table.querySelectorAll('td > p, th > p')).some(node => !selectedRange.intersectsNode(node));
	_rapierCheckpointEdit(editDiv);
	parts.forEach(({ range }) => range.deleteContents());
	if (!keepsParagraph && Array.from(table.querySelectorAll('td, th')).every(cell => !String(cell.textContent || '').replace(/[\s\u200b\ufeff]+/g, '') && !cell.querySelector('img'))) {
		return _rapierTableRemove(blockId);
	}
	if (surface && editDiv.contains(surface)) {
		if (paragraph && !paragraph.textContent.replace(/\u200b/g, '') && !paragraph.querySelector('img, br, input, math, .math-rendered')) paragraph.appendChild(document.createElement('br'));
		_setCursorCharOffset(surface, offset);
	}
	else { selection.removeAllRanges(); selection.addRange(parts[0].range); }
	if (/^delete/.test(inputType)) editDiv.dispatchEvent(new InputEvent('input', { bubbles: true, inputType }));
	return true;
}

function _rapierTablePickEmpty(pick, typed = '') {
	if (!pick || _rapierUserMutationBlocked()) return false;
	_rapierCheckpointEdit(pick.editDiv);
	const raw = _tableRawFromBlock(pick.blockId);
	const info = raw ? _tableInfo(raw) : null;
	if (!info || info.sepIdx < 0) return false;
	const lineOf = [info.rowIdxs.find(index => index < info.sepIdx), ...info.dataIdxs];
	if (!typed && pick.r0 === 0 && pick.c0 === 0 && pick.r1 >= lineOf.length - 1 && pick.c1 >= info.cols - 1) {
		_rapierTablePick = null;
		return _rapierTableRemove(pick.blockId);
	}
	const lines = info.lines.slice();
	for (let row = pick.r0; row <= pick.r1 && row < lineOf.length; row++) {
		const cells = _tableSplitRow(lines[lineOf[row]]) || [];
		while (cells.length <= pick.c1 && cells.length < info.cols) cells.push('');
		for (let col = pick.c0; col <= pick.c1 && col < cells.length; col++) cells[col] = row === pick.r0 && col === pick.c0 ? turndown.escape(typed) : '';
		const line = _tableBuildRow(cells);
		if (_tableSplitRow(line).join('\u0000') !== (_tableSplitRow(lines[lineOf[row]]) || []).join('\u0000')) lines[lineOf[row]] = line;
	}
	_rapierTablePick = null;
	return _tableApply(pick.blockId, lines.join('\n'), { rowIndex: pick.r0, cellIndex: pick.c0, charOffset: Infinity });
}

function _rapierTablePickInput(event) {
	if (event.defaultPrevented || !/^(?:deleteContent|deleteWord|deleteSoftLine|deleteHardLine|deleteByCut|insertText$|insertReplacementText$)/.test(String(event.inputType || ''))) return;
	const pick = _rapierTablePickNow();
	const typed = /^insert/.test(event.inputType);
	if (!pick) {
		const span = _rapierTableSelected();
		if (!span) return;
		if (!typed) { event.preventDefault(); event.stopImmediatePropagation(); }
		_rapierTableTake(span, event.inputType);
		return;
	}
	event.preventDefault();
	event.stopImmediatePropagation();
	_rapierTablePickEmpty(pick, typed ? String(event.data || '') : '');
}

function _rapierTablePickCompose() {
	if (rapier.composition.block || _rapierUserMutationBlocked(false)) return;
	const pick = _rapierTablePickNow();
	if (!pick) {
		const span = _rapierTableSelected();
		if (span) _rapierTableTake(span, 'insertCompositionText');
		return;
	}
	_rapierCheckpointEdit(pick.editDiv);
	pick.rows.slice(pick.r0, pick.r1 + 1).forEach(row =>
		_rapierTableCellsOf(row).slice(pick.c0, pick.c1 + 1).forEach(cell => cell.replaceChildren()));
	window.getSelection().collapse(_rapierTableCellsOf(pick.rows[pick.r0])[pick.c0], 0);
	_rapierTablePickShow();
}

function _rapierTablePickCopy(event, cut) {
	const pick = event.clipboardData && !event.defaultPrevented ? _rapierTablePickNow() : null;
	if (!pick) return;
	const raw = _tableRawFromBlock(pick.blockId);
	const info = raw ? _tableInfo(raw) : null;
	if (!info || info.sepIdx < 0) return;
	const lineOf = [info.rowIdxs.find(index => index < info.sepIdx), ...info.dataIdxs];
	const source = lineOf.slice(pick.r0, pick.r1 + 1).map(index => {
		const cells = _tableSplitRow(info.lines[index]) || [];
		return Array.from({ length: pick.c1 - pick.c0 + 1 }, (_unused, k) => cells[pick.c0 + k] || '');
	});
	const text = pick.rows.slice(pick.r0, pick.r1 + 1).map(row => _rapierTableCellsOf(row).slice(pick.c0, pick.c1 + 1)
		.map(cell => String(cell.textContent || '').replace(/[\t\r\n]+/g, ' ').trim()).join('\t')).join('\n');
	const markdown = [_tableBuildRow(source[0]), _tableSeparator(source[0].length, info.alignments.slice(pick.c0, pick.c1 + 1)), ...source.slice(1).map(_tableBuildRow)].join('\n');
	event.preventDefault();
	event.stopImmediatePropagation();
	event.clipboardData.setData('text/plain', text);
	event.clipboardData.setData('text/html', renderBlock(markdown));
	try { event.clipboardData.setData('text/markdown', markdown); } catch (_) {}
	if (cut && !rapier.access.readOnly) _rapierTablePickEmpty(pick);
}

document.addEventListener('selectionchange', _rapierTablePickShow);
document.addEventListener('beforeinput', _rapierTablePickInput, true);
document.addEventListener('compositionstart', _rapierTablePickCompose, true);
document.addEventListener('paste', _rapierTableHtmlPaste, true);
document.addEventListener('copy', event => _rapierTablePickCopy(event, false), true);
document.addEventListener('cut', event => _rapierTablePickCopy(event, true), true);

function _rapierTableCut() {
	const span = _rapierTableSelected();
	return !!span && _rapierTableTake(span, 'deleteByCut');
}

const RAPIER_TABLE_PINCH_FLOOR = 0.3;
const _rapierTablePinch = { scales: new Map(), observer: null, live: null };

function _rapierTableScaleOf(table) {
	const scale = parseFloat(table && table.dataset ? table.dataset.rapierScale : '');
	return scale > 0 && scale < 1 ? scale : 1;
}
function _rapierTablePinchKey(table) {
	const host = table.closest('.block-wrapper');
	if (!host || host.dataset.blockId == null) return null;
	const home = table.closest('.block-read, .block-edit') || host;
	return host.dataset.blockId + ':' + Array.prototype.indexOf.call(home.querySelectorAll('table'), table);
}
function _rapierTablePinchLeast(scroller, table) {
	const natural = table.offsetWidth || 1;
	return Math.min(1, Math.max(RAPIER_TABLE_PINCH_FLOOR, scroller.clientWidth / natural));
}
function _rapierTableIsWide(scroller, table) { return table.offsetWidth > scroller.clientWidth + 1; }
function _rapierTableDraw(table, scale) {
	const style = table.style;
	if (!(scale < 1)) {
		if (table.dataset.rapierScale === undefined) return;
		style.removeProperty('transform'); style.removeProperty('transform-origin'); style.removeProperty('margin-bottom');
		delete table.dataset.rapierScale;
		return;
	}
	const text = String(Math.round(scale * 10000) / 10000);
	if (table.dataset.rapierScale !== text) {
		table.dataset.rapierScale = text;
		style.transformOrigin = '0 0';
		style.transform = 'scale(' + text + ')';
	}
	const margin = '-' + Math.round(table.offsetHeight * (1 - scale) * 100) / 100 + 'px';
	if (style.marginBottom !== margin) style.marginBottom = margin;
}
function _rapierTablePinchSettle(table) {
	const scroller = table.closest('.table-scroll-wrap');
	if (!scroller) return;
	if (scroller.closest('#editor-blocks') && document.body.classList.contains('rapier-notes-open')) return;
	const wide = _rapierTableIsWide(scroller, table);
	if (scroller.hasAttribute('data-rapier-wide') !== wide) scroller.toggleAttribute('data-rapier-wide', wide);
	const key = _rapierTablePinchKey(table);
	const kept = key == null ? undefined : _rapierTablePinch.scales.get(key);
	const live = _rapierTablePinch.live;
	if (live && live.table === table) { _rapierTableDraw(table, live.scale); return; }
	_rapierTableDraw(table, wide && kept ? Math.max(kept, _rapierTablePinchLeast(scroller, table)) : 1);
}
function _rapierTablePinchResume() {
	document.querySelectorAll('#editor-blocks .table-scroll-wrap > table').forEach(_rapierTablePinchSettle);
	_rapierRefreshOverflowAffordances(document.getElementById('editor-blocks'));
}
function _rapierTablePinchWatch(table) {
	const scroller = table.closest('.table-scroll-wrap');
	if (!scroller) return;
	if (!_rapierTablePinch.observer && typeof ResizeObserver === 'function') {
		_rapierTablePinch.observer = new ResizeObserver(entries => entries.forEach(entry => {
			const node = entry.target;
			const own = node.tagName === 'TABLE' ? node : node.querySelector(':scope > table');
			if (own && own.isConnected) _rapierTablePinchSettle(own);
		}));
	}
	if (!scroller._rapierPinchBound) {
		scroller._rapierPinchBound = true;
		scroller.addEventListener('touchstart', _rapierTablePinchStart, { passive: false });
		_rapierTablePinch.observer?.observe(scroller);
	}
	if (!table._rapierPinchWatched) {
		table._rapierPinchWatched = true;
		_rapierTablePinch.observer?.observe(table);
	}
	_rapierTablePinchSettle(table);
}
function _rapierTablePinchForget() {
	_rapierTablePinch.scales.clear();
	_rapierTablePinchEnd(null, true);
	document.querySelectorAll('table[data-rapier-scale]').forEach(table => _rapierTableDraw(table, 1));
}
const _rapierTableFingers = touches => {
	const a = touches[0], b = touches[1];
	return { span: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1, x: (a.clientX + b.clientX) / 2 };
};
function _rapierTablePinchStart(event) {
	if (_rapierTablePinch.live || !event.touches || event.touches.length !== 2) return;
	const scroller = event.currentTarget;
	const table = scroller.querySelector(':scope > table');
	if (!table || !_rapierTableIsWide(scroller, table)) return;
	for (const touch of event.touches) if (!(touch.target instanceof Node) || !scroller.contains(touch.target)) return;
	const fingers = _rapierTableFingers(event.touches);
	const was = { overflowX: scroller.style.overflowX, touchAction: scroller.style.touchAction };
	scroller.style.overflowX = 'hidden';
	scroller.style.touchAction = 'none';
	_rapierTablePinch.live = { scroller, table, span: fingers.span, scale: _rapierTableScaleOf(table), from: _rapierTableScaleOf(table), was, content: null };
	const live = _rapierTablePinch.live;
	const box = scroller.getBoundingClientRect();
	live.content = (scroller.scrollLeft + fingers.x - box.left) / live.from;
	live.at = fingers.x;
	if (event.cancelable) event.preventDefault();
	scroller.addEventListener('touchmove', _rapierTablePinchMove, { passive: false });
	scroller.addEventListener('touchend', _rapierTablePinchEnd, { passive: false });
	scroller.addEventListener('touchcancel', _rapierTablePinchEnd, { passive: false });
}
function _rapierTablePinchMove(event) {
	const live = _rapierTablePinch.live;
	if (!live || !event.touches || event.touches.length < 2) return;
	if (event.cancelable) event.preventDefault();
	const fingers = _rapierTableFingers(event.touches);
	const least = _rapierTablePinchLeast(live.scroller, live.table);
	live.scale = Math.min(1, Math.max(least, live.from * fingers.span / live.span));
	_rapierTableDraw(live.table, live.scale);
	const box = live.scroller.getBoundingClientRect();
	const room = Math.max(0, live.scroller.scrollWidth - live.scroller.clientWidth);
	live.scroller.scrollLeft = Math.min(room, Math.max(0, live.content * live.scale - (live.at - box.left)));
}
function _rapierTablePinchEnd(event, force) {
	const live = _rapierTablePinch.live;
	if (!live) return;
	if (!force && event && event.touches && event.touches.length >= 2) return;
	_rapierTablePinch.live = null;
	const { scroller, table } = live;
	scroller.removeEventListener('touchmove', _rapierTablePinchMove);
	scroller.removeEventListener('touchend', _rapierTablePinchEnd);
	scroller.removeEventListener('touchcancel', _rapierTablePinchEnd);
	scroller.style.overflowX = live.was.overflowX;
	scroller.style.touchAction = live.was.touchAction;
	const key = _rapierTablePinchKey(table);
	if (key != null && !force) { if (live.scale < 1) _rapierTablePinch.scales.set(key, live.scale); else _rapierTablePinch.scales.delete(key); }
	if (event && event.cancelable) event.preventDefault();
	_rapierTablePinchSettle(table);
}


function _tableLf(raw) { return String(raw ?? '').replace(/\r(?!\n)/g, '\n'); }

function _isTableBlock(raw) {
	const t = _tableLf(raw).trim();
	if (!t) return false;
	const lines = t.split('\n');
	if (lines.length < 2) return false;
	if (/^\s*\|.*\|\s*$/.test(lines[0]) && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[1])) return true;
	const head = _tableSplitRow(lines[0]);
	return !!head && _tableIsSeparator(lines[1]) && _tableSplitRow(lines[1]).length === head.length;
}

function _tableSplitRow(line, selectionSeparator) {
	const value = String(line || '').trim();
	const selection = typeof selectionSeparator === 'string';
	const separator = selection ? selectionSeparator : '|';
	const inline = selection ? new md.inline.State(value, md, {}, []) : null;
	const cells = [];
	let cell = '', separated = false;
	for (let index = 0; index < value.length;) {
		const char = value[index];
		if (char === '\\' && !selection && value[index + 1] === '|') { cell += '|'; index += 2; continue; }
		if (char === '\\' && selection && index + 1 < value.length) { cell += value.slice(index, index + 2); index += 2; continue; }
		if (inline && char === '`') {
			inline.pos = index;
			md.inline.skipToken(inline);
			cell += value.slice(index, inline.pos);
			index = inline.pos;
			continue;
		}
		const width = separator === '  ' ? (/^[ \t]{2,}/.exec(value.slice(index)) || [''])[0].length : char === separator ? 1 : 0;
		if (width) {
			cells.push(cell.trim()); cell = ''; separated = true; index += width;
		} else { cell += char; index++; }
	}
	cells.push(cell.trim());
	if (!separated) return null;
	if (separator === '|') {
		if (!cells[0]) cells.shift();
		if (cells.length > 1 && !cells[cells.length - 1]) cells.pop();
	}
	return cells.length ? cells : [''];
}

function _tableEscapeCell(cell) {
	const value = String(cell ?? '').trim();
	const inline = new md.inline.State(value, md, {}, []);
	let out = '';
	for (let index = 0; index < value.length;) {
		const char = value[index];
		if (char === '\\' && index + 1 < value.length) {
			out += value.slice(index, index + 2); index += 2; continue;
		}
		if (char === '`') {
			inline.pos = index;
			md.inline.skipToken(inline);
			const span = value.slice(index, inline.pos);
			if (/\\\|/.test(span)) {
				const code = md.parseInline(span, {})[0].children.find(token => token.type === 'code_inline');
				out += '<code>' + Array.from(code.content, char => /[a-zA-Z0-9 \t]/.test(char) ? char : '&#' + char.codePointAt(0) + ';').join('') + '</code>';
			} else out += span.replace(/\|/g, '\\|');
			index = inline.pos;
			continue;
		}
		out += char === '|' ? '\\|' : char;
		index++;
	}
	return out;
}

function _tableBuildRow(cells) {
	return '| ' + cells.map(_tableEscapeCell).join(' | ') + ' |';
}

function _tableSeparator(cols, alignments = []) {
	return globalThis.RapierMarkdownSpec.delimiterRow(Array.from({ length: Math.max(1, cols) }, (_unused, index) => alignments[index]));
}

function _tableIsSeparator(line) {
	const cells = _tableSplitRow(line);
	if (!cells || !cells.length) return false;
	return cells.every(cell => /^:?-+:?$/.test(cell));
}

function _tableInfo(raw) {
	const lines = _tableLf(raw).trimEnd().split('\n');
	const sepIdx = lines.findIndex(_tableIsSeparator);
	const rowIdxs = lines.reduce((acc, line, i) => (_tableSplitRow(line) ? acc.concat(i) : acc), []);
	const dataIdxs = sepIdx >= 0 ? rowIdxs.filter(i => i > sepIdx) : rowIdxs.slice(2);
	const cols = Math.max(0, ...rowIdxs.map(i => (_tableSplitRow(lines[i]) || []).length));
	const separatorCells = sepIdx >= 0 ? (_tableSplitRow(lines[sepIdx]) || []) : [];
	const alignments = separatorCells.map(cell => {
		const marker = String(cell || '').trim();
		if (/^:-+:$/.test(marker)) return 'center';
		if (/^:-+$/.test(marker)) return 'left';
		if (/^-+:$/.test(marker)) return 'right';
		return '';
	});
	const rowLines = sepIdx >= 0 ? [rowIdxs.find(i => i < sepIdx), ...dataIdxs] : [];
	return { lines, sepIdx, rowIdxs, dataIdxs, rowLines, rows: dataIdxs.length, cols, alignments };
}

function _tableRawFromEdit(blockId) {
	const wrapper = document.querySelector('[data-block-id="' + blockId + '"]');
	const editDiv = wrapper ? wrapper.querySelector('.block-edit') : null;
	return _tableRawFromDom(blockId, editDiv ? editDiv.querySelector('table') : null);
}

function _tableRawFromDom(blockId, table) {
	if (!table) return null;
	const original = rapier.document.blocks.find(block => block.id === blockId);
	if (_rapierHtmlTableNeedsHtml(table, {paragraphsAsLines: !!original && _isTableBlock(original.raw)})) {
		const copy = table.cloneNode(true);
		if (original && !/\bcaret-color\s*:/i.test(String(original.raw || ''))) {
			for (const span of copy.querySelectorAll('span[style]')) {
				if (!/^\s*caret-color\s*:\s*[^;]+;?\s*$/i.test(span.getAttribute('style') || '')) continue;
				span.removeAttribute('style');
				if (!span.attributes.length) span.replaceWith(...span.childNodes);
			}
		}
		for (const parent of [copy, ...copy.querySelectorAll('thead,tbody,tfoot,tr')]) {
			for (const node of Array.from(parent.childNodes)) if (node.nodeType === Node.TEXT_NODE && !/\S/.test(node.nodeValue || '')) node.remove();
			for (const child of Array.from(parent.children)) parent.insertBefore(document.createTextNode('\n'), child);
			parent.appendChild(document.createTextNode('\n'));
		}
		return _rapierHtmlTableSource(copy);
	}
	const readRows = root => Array.from(root.querySelectorAll('tr')).map(tr =>
		Array.from(tr.children)
			.filter(cell => /^(TD|TH)$/.test(cell.tagName))
			.map(_rapierTableCellMarkdown)
	).filter(row => row.length);
	const rows = readRows(table);
	if (!rows.length) return null;
	const cols = Math.max(1, ...rows.map(row => row.length));
	const normalised = rows.map(row => row.concat(Array(Math.max(0, cols - row.length)).fill('')));
	const block = rapier.document.blocks.find(candidate => candidate.id === blockId);
	const info = block ? _tableInfo(block.raw) : null;
	const alignments = info ? info.alignments : [];
	const lineOf = info ? info.rowLines : [];
	if (info && info.cols === cols && lineOf.length === rows.length) {
		const projected = _rapierRenderedMarkProbe(block.raw, 'bold')?.root.querySelector('table');
		const beforeRows = projected && readRows(projected), lines = _tableLf(block.raw).split('\n');
		const spans = lineOf.map(at => Number.isInteger(at) ? _rapierTableCellSpans(lines[at]) : []);
		if (beforeRows?.length === rows.length && spans.every((row, index) => Number.isInteger(lineOf[index]) && row.length <= cols &&
				rows[index].length === cols && beforeRows[index].length === cols)) {
			for (let row = 0; row < rows.length; row++) {
				const at = lineOf[row], changed = rows[row].flatMap((cell, col) => cell === beforeRows[row][col] ? [] : [col]);
				if (changed.some(col => col >= spans[row].length)) { lines[at] = _tableBuildRow(rows[row]) + (lines[at].endsWith('\r') ? '\r' : ''); continue; }
				for (const col of changed.reverse()) {
					const [from, to] = spans[row][col];
					lines[at] = lines[at].slice(0, from) + _tableEscapeCell(rows[row][col]) + lines[at].slice(to);
				}
			}
			return lines.join('\n');
		}
	}
	const rowLine = (row, index) => {
		const built = _tableBuildRow(row);
		const line = Number.isInteger(lineOf[index]) ? info.lines[lineOf[index]] : null;
		const cells = line != null ? (_tableSplitRow(line) || []) : null;
		return cells && cells.length <= cols && _tableBuildRow(cells.concat(Array(cols - cells.length).fill(''))) === built ? line.replace(/\r$/, '') : built;
	};
	return [
		rowLine(normalised[0], 0),
		info && info.sepIdx >= 0 && info.cols === cols ? info.lines[info.sepIdx].replace(/\r$/, '') : _tableSeparator(cols, alignments),
		...normalised.slice(1).map((row, index) => rowLine(row, index + 1)),
	].join('\n');
}

function _rapierTableCellLines(cell) {
	const split = nodes => {
		const lines = [[]];
		for (const node of nodes) {
			if (node.nodeName === 'BR') lines.push([]);
			else lines[lines.length - 1].push(node);
		}
		if (lines.length > 1 && !lines[lines.length - 1].some(node => node.nodeType !== 3 || String(node.nodeValue || '').replace(/\u200b/g, ''))) lines.pop();
		return lines;
	};
	const children = Array.from(cell.childNodes);
	const paragraphs = children.filter(node => node.nodeName === 'P');
	if (!paragraphs.length || children.some(node => node.nodeName !== 'P' && (node.nodeType !== 3 || /\S/.test(node.nodeValue || '')))) return split(children);
	return paragraphs.flatMap(paragraph => split(Array.from(paragraph.childNodes)));
}

function _rapierTableCellMarkdown(cell) {
	const lines = _rapierTableCellLines(cell).map(nodes => {
		const holder = document.createElement('div');
		for (const node of nodes) holder.appendChild(node.cloneNode(true));
		return globalThis.RapierMarkdownSpec.cellBreaks(_markdownFromEditHTML(holder.innerHTML))
			.replace(/\n{2,}/g, '<br>').replace(/\n/g, ' ').trim();
	});
	return lines.join('<br>') + (lines.length > 1 && lines[lines.length - 1] === '' ? '<br>' : '');
}

function _syncTableBlockFromEdit(blockId) {
	const currentRaw = _tableRawFromEdit(blockId);
	const b = rapier.document.blocks.find(b => b.id === blockId);
	if (!currentRaw || !b || currentRaw === b.raw) return true;
	const wrapper = document.querySelector('[data-block-id="' + blockId + '"]');
	const editDiv = wrapper && wrapper.querySelector('.block-edit');
	if (!editDiv) return false;
	editDiv._rapierCheckpointFresh = false;
	_rapierCheckpointEdit(editDiv);
	return editDiv._rapierCheckpointFresh === true;
}

function _tableRawFromBlock(blockId) {
	if (!_syncTableBlockFromEdit(blockId)) return null;
	const b = rapier.document.blocks.find(b => b.id === blockId);
	return b ? b.raw : null;
}

function _tableRawForCopy(blockId) {
	const block = rapier.document.blocks.find(candidate => candidate.id === blockId);
	if (!block) return null;
	const wrapper = document.querySelector('[data-block-id="' + blockId + '"]');
	if (wrapper && wrapper.classList.contains('block-wrapper--editing')) {
		const liveRaw = _tableRawFromEdit(blockId);
		if (liveRaw) return liveRaw;
	}
	return _isTableBlock(block.raw) ? block.raw : null;
}

function _tableStats(raw) {
	const info = _tableInfo(raw);
	return { rows: info.rows, cols: info.cols };
}

function _rapierTableCellActivation(root, target, clientX, clientY) {
	if (!root || !target || !target.closest) return null;
	const cell = target.closest('th,td');
	if (!cell || !root.contains(cell)) return null;
	const row = cell.closest('tr');
	const table = cell.closest('table');
	if (!row || !table || !root.contains(table)) return null;
	const rows = Array.from(table.querySelectorAll('tr'));
	const cells = Array.from(row.children).filter(node => /^(TH|TD)$/.test(node.tagName));
	const rowIndex = rows.indexOf(row);
	const cellIndex = cells.indexOf(cell);
	if (rowIndex < 0 || cellIndex < 0) return null;
	return {
		rowIndex,
		cellIndex,
		charOffset: _rapierRenderedCharOffsetFromPoint(cell, clientX, clientY),
	};
}

function _rapierSetTableCaret(root, activation) {
	if (!root || !activation) return false;
	const table = root.querySelector('table');
	if (!table) return false;
	const rows = Array.from(table.querySelectorAll('tr'));
	const row = rows[Number(activation.rowIndex)];
	if (!row) return false;
	const cells = Array.from(row.children).filter(node => /^(TH|TD)$/.test(node.tagName));
	const cell = cells[Number(activation.cellIndex)];
	if (!cell) return false;
	const lineBreak = Number(activation.lineIndex) > 0 ? cell.querySelectorAll('br')[activation.lineIndex - 1] : null;
	if (lineBreak) {
		const range = document.createRange(), selection = window.getSelection && window.getSelection();
		range.setStartAfter(lineBreak);
		range.collapse(true);
		if (selection) { selection.removeAllRanges(); selection.addRange(range); }
		return true;
	}
	const paragraph = Number.isInteger(activation.paragraphIndex)
		? Array.from(cell.children).filter(node => node.tagName === 'P')[activation.paragraphIndex] : null;
	_setCursorCharOffset(paragraph || cell, activation.charOffset == null ? Infinity : activation.charOffset);
	return true;
}

function _createTableToolbar(block) {
	if (!_isTableBlock(block.raw)) return null;

	const toolbar = document.createElement('div');
	toolbar.className = 'table-toolbar';
	toolbar.setAttribute('contenteditable', 'false');
	toolbar.setAttribute('role', 'toolbar');
	toolbar.setAttribute('aria-label', 'table');
	toolbar.id = 'table-toolbar-' + block.id;
	const glyph = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#i-tbl-' + name + '"></use></svg>';
	const button = (attrs, label, name) => '<button type="button" class="fmt-btn table-toolbar-btn" ' + attrs + ' title="' + label + '" aria-label="' + label + '">' + glyph(name) + '</button>';
	toolbar.innerHTML =
		button('data-table-action="row" data-table-delta="1"', 'add a row below', 'row-add') +
		button('data-table-action="row" data-table-delta="-1"', 'remove this row', 'row-del') +
		'<div class="table-toolbar-sep"></div>' +
		button('data-table-action="col" data-table-delta="1"', 'add a column to the right', 'col-add') +
		button('data-table-action="col" data-table-delta="-1"', 'remove this column', 'col-del') +
		'<div class="table-toolbar-sep"></div>' +
		'<button type="button" class="fmt-btn table-toolbar-btn" data-table-action="align" data-table-align="cycle" title="align column" aria-label="align column"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ['left', 'center', 'right'].map((side) => '<g class="table-align-glyph" data-align-glyph="' + side + '">' + _RAPIER_COMMAND_ICONS['align-' + side] + '</g>').join('') + '</svg></button>' +
		button('data-table-action="copy" data-table-format="all"', 'copy the table', 'copy') +
		button('data-table-action="delete"', 'delete the table', 'delete');
	return toolbar;
}

function _rapierMarkTableCaptionCandidate(readDiv, raw) {
	if (!RAPIER_TABLE_CAPTION_PREFIX_RE.test(String(raw || ''))) return;
	if (readDiv.childNodes.length !== 1 || readDiv.childElementCount !== 1) return;
	const only = readDiv.firstElementChild;
	if (only && only.tagName === 'P') only.classList.add('rapier-table-caption-candidate');
}

function _rapierTableActionPosition(editDiv) {
	if (!editDiv) return null;
	const selection = window.getSelection && window.getSelection();
	let node = selection && selection.rangeCount ? selection.getRangeAt(0).startContainer : null;
	let element = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
	let cell = element?.closest?.('th,td');
	if (!cell || !editDiv.contains(cell)) cell = editDiv.querySelector('th,td');
	if (!cell) return null;
	const row = cell.closest('tr');
	const table = cell.closest('table');
	if (!row || !table) return null;
	const rows = Array.from(table.querySelectorAll('tr'));
	const cells = Array.from(row.children).filter(child => /^(TH|TD)$/.test(child.tagName));
	return { rowIndex: rows.indexOf(row), cellIndex: cells.indexOf(cell), charOffset: 0 };
}

function _rapierRefreshTableToolbarState(blockId, position = null) {
	const wrapper = document.querySelector('[data-block-id="' + blockId + '"]');
	const toolbar = wrapper?.querySelector(':scope > .table-toolbar');
	if (!toolbar) return;
	const block = rapier.document.blocks.find(candidate => candidate.id === blockId);
	if (!block) return;
	const editDiv = wrapper.querySelector(':scope > .block-edit');
	const resolved = position || (wrapper.classList.contains('block-wrapper--editing')
		? _rapierTableActionPosition(editDiv) : null);
	const info = _tableInfo(block.raw);
	const fallback = Math.max(0, info.cols - 1);
	const activeCol = resolved && Number.isInteger(resolved.cellIndex)
		? Math.max(0, Math.min(fallback, resolved.cellIndex)) : 0;
	const activeAlignment = info.alignments[activeCol] || '';
	toolbar.dataset.activeColumn = String(activeCol);
	toolbar.dataset.activeAlignment = activeAlignment;
	_rapierTableChrome(wrapper, toolbar, info, resolved);
}

function _rapierMoveTableCaret(editDiv, rowIndex, cellIndex, atEnd = false, select = false) {
	if (!editDiv) return false;
	const table = editDiv.querySelector('table');
	const rows = table ? Array.from(table.querySelectorAll('tr')) : [];
	const row = rows[rowIndex];
	if (!row) return false;
	const cells = Array.from(row.children).filter(node => /^(?:TH|TD)$/.test(node.tagName));
	const cell = cells[cellIndex];
	if (!cell) return false;

	if (select && String(cell.textContent || '').trim()) {
		_rapierSetSelectionCharOffsets(cell, 0, String(cell.textContent || '').length);
	} else {
		_setCursorCharOffset(cell, atEnd ? Infinity : 0);
	}
	_rapierRefreshTableToolbarState(Number(editDiv.closest('.block-wrapper')?.dataset.blockId), {
		rowIndex, cellIndex, charOffset: atEnd ? Infinity : 0,
	});
	return true;
}

function _rapierHandleTableTab(editDiv, event) {
	if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || rapier.view.tabReleases) return false;
	if (!editDiv || event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return false;
	const wrapper = editDiv.closest('.block-wrapper--editing.block-wrapper--table');
	if (!wrapper) return false;
	const position = _rapierTableActionPosition(editDiv);
	const table = editDiv.querySelector('table');
	if (!position || !table) return false;
	const rows = Array.from(table.querySelectorAll('tr'));
	const row = rows[position.rowIndex];
	const cells = row ? Array.from(row.children).filter(node => /^(?:TH|TD)$/.test(node.tagName)) : [];
	if (!cells.length) return false;

	if (event.shiftKey) {
		if (position.cellIndex > 0) {
			event.preventDefault();
			return _rapierMoveTableCaret(editDiv, position.rowIndex, position.cellIndex - 1, true, true);
		}
		if (position.rowIndex > 0) {
			const previous = rows[position.rowIndex - 1];
			const previousCells = Array.from(previous.children).filter(node => /^(?:TH|TD)$/.test(node.tagName));
			if (previousCells.length) {
				event.preventDefault();
				return _rapierMoveTableCaret(editDiv, position.rowIndex - 1, previousCells.length - 1, true, true);
			}
		}
		return false;
	}

	if (position.cellIndex + 1 < cells.length) {
		event.preventDefault();
		return _rapierMoveTableCaret(editDiv, position.rowIndex, position.cellIndex + 1, false, true);
	}
	if (position.rowIndex + 1 < rows.length) {
		event.preventDefault();
		return _rapierMoveTableCaret(editDiv, position.rowIndex + 1, 0, false, true);
	}

	event.preventDefault();
	_rapierCheckpointEdit(editDiv);
	_tableChangeRows(Number(wrapper.dataset.blockId), 1, { ...position, cellIndex: 0 });
	return true;
}

function _rapierHandleTableAction(event, button) {
	const copyOnly = button?.dataset?.tableAction === 'copy';
	if (!button || (!copyOnly && _rapierUserMutationBlocked(false)) ||
			(copyOnly && _rapierPersistenceCaptureBlocked())) {
		event.preventDefault();
		event.stopPropagation();
		return;
	}
	if (event.type === 'pointerdown' && event.button != null && event.button !== 0) return;
	if (event.type === 'pointerdown') {
		const strip = button.closest('.table-toolbar')?.getBoundingClientRect();
		const inside = !strip || event.pointerType === 'mouse' || event.clientX >= strip.left && event.clientX <= strip.right &&
			event.clientY >= strip.top && event.clientY <= strip.bottom;
		button._rapierPressAt = inside ? _rapierNow() : 0;
		if (!inside) return;
	}
	if (event.type === 'click' && event.detail !== 0 && !(_rapierNow() - Number(button._rapierPressAt || 0) < 2000)) {
		event.preventDefault();
		event.stopPropagation();
		return;
	}
	if (event.type === 'click') button._rapierPressAt = 0;
	if (copyOnly && event.type === 'pointerdown') { event.preventDefault(); event.stopPropagation(); return; }
	if (event.type === 'click' && _rapierNow() - Number(button._rapierPointerActionAt || 0) < 350) {
		event.preventDefault();
		event.stopPropagation();
		return;
	}
	event.preventDefault();
	event.stopPropagation();
	if (event.type === 'pointerdown') { button._rapierPointerActionAt = _rapierNow(); _rapierTableSwallowClick(event); }
	const wrapper = button.closest('.block-wrapper');
	const block = _rapierBoundBlock(wrapper);
	if (!wrapper || !block) return;
	const editDiv = wrapper.querySelector(':scope > .block-edit');
	if (button.dataset.tableAction === 'copy') {
		_rapierCopyTable(block.id, button.dataset.tableFormat).catch(() => {
			showToast('Couldn’t copy the table.', 'error');
		});
		return;
	}
	const position = wrapper.classList.contains('block-wrapper--editing')
		? _rapierTableActionPosition(editDiv)
		: null;
	if (editDiv) _rapierCheckpointEdit(editDiv);
	const delta = Number(button.dataset.tableDelta || 0);
	if (button.dataset.tableAction === 'row') _tableChangeRows(block.id, delta, position);
	if (button.dataset.tableAction === 'col') _tableChangeCols(block.id, delta, position);
	if (button.dataset.tableAction === 'align') _rapierTableAlignNext(block.id, position);
	if (button.dataset.tableAction === 'delete') _rapierTableRemove(block.id);
}

function _rapierTableVerticalStep(context, event) {
	if (event.defaultPrevented || event.isComposing || !/^Arrow(?:Up|Down)$/.test(event.key)) return false;
	const before = _rapierCaretBeforeArrow(context.editDiv, event);
	const cell = before && _nodeAsElement(before.node)?.closest('th,td');
	const table = cell && context.editDiv.contains(cell) ? cell.closest('table') : null;
	if (!table) return false;
	event.preventDefault();
	const rows = Array.from(table.querySelectorAll('tr')), row = cell.closest('tr');
	const cellsOf = each => Array.from(each.children).filter(node => /^(?:TH|TD)$/.test(node.tagName));
	const target = rows[rows.indexOf(row) + (event.key === 'ArrowDown' ? 1 : -1)];
	if (!target) { _rapierHopToNeighbour(context, event.key, before); return true; }
	const cells = cellsOf(target), next = cells[Math.min(cellsOf(row).indexOf(cell), cells.length - 1)];
	if (!next) return true;
	const box = next.getBoundingClientRect();
	const range = before.goal == null ? null : _rapierCaretRangeFromPoint(
		Math.min(Math.max(before.goal, box.left + 1), Math.max(box.left + 1, box.right - 1)), box.top + box.height / 2);
	const selection = window.getSelection();
	if (range && next.contains(range.startContainer)) { selection.removeAllRanges(); selection.addRange(range); }
	else _setCursorCharOffset(next, 0);
	const rect = selection.rangeCount ? _rapierCaretClientRect(selection.getRangeAt(0)) : null;
	context.editDiv._rapierVerticalGoal = rect && before.goal != null ? { x: before.goal, left: rect.left } : null;
	return true;
}

function _rapierTableSelectedCells(live, range) {
	const cells = [], table = live.querySelector('table');
	if (!table) return cells;
	Array.from(table.querySelectorAll('tr')).forEach((tr, row) => {
		Array.from(tr.children).filter(node => /^(?:TH|TD)$/.test(node.tagName)).forEach((cell, col) => {
			if (!range.intersectsNode(cell)) return;
			const text = String(cell.textContent || '');
			let start = _nodeInside(cell, range.startContainer) ? _charOffsetForRangePoint(cell, range.startContainer, range.startOffset) : 0;
			let end = _nodeInside(cell, range.endContainer) ? _charOffsetForRangePoint(cell, range.endContainer, range.endOffset) : text.length;
			start = Math.max(0, Math.min(start, text.length));
			end = Math.max(start, Math.min(end, text.length));
			while (start < end && /\s/.test(text.charAt(start))) start++;
			while (end > start && /\s/.test(text.charAt(end - 1))) end--;
			if (start < end) cells.push({ row, col, start, end, selected: text.slice(start, end) });
		});
	});
	return cells;
}

function _rapierTableCellSpans(line) {
	const text = String(line || ''), lead = text.length - text.trimStart().length, value = text.trim(), spans = [];
	let from = 0;
	for (let index = 0; index <= value.length; index++) {
		if (value.charAt(index) === '\\' && value.charAt(index + 1) === '|') { index++; continue; }
		if (index === value.length || value.charAt(index) === '|') { spans.push([from, index]); from = index + 1; }
	}
	const cells = spans.map(([a, b]) => {
		const from = a, to = b;
		while (a < b && /\s/.test(value.charAt(a))) a++;
		while (b > a && /\s/.test(value.charAt(b - 1))) b--;
		if (a === b && to > from) a = b = Math.min(from + 1, to);
		return [a + lead, b + lead];
	});
	if (cells.length && cells[0][0] === cells[0][1]) cells.shift();
	if (cells.length > 1 && cells[cells.length - 1][0] === cells[cells.length - 1][1]) cells.pop();
	return cells;
}

function _rapierExactCellSource(state, node) {
	if (!state || state.wrappers.length !== 1) return null;
	const wrapper = state.wrappers[0], live = _liveBlockEl(wrapper);
	if (!wrapper.classList.contains('block-wrapper--table') || !live ||
			wrapper.classList.contains('block-wrapper--source-edit')) return null;
	const element = node && (node.nodeType === Node.TEXT_NODE ? node.parentElement : node);
	const cell = element && element.closest('td, th'), table = live.querySelector('table');
	if (!cell || !table || cell.closest('table') !== table) return null;
	const rows = Array.from(table.querySelectorAll('tr')), tr = cell.closest('tr');
	const row = rows.indexOf(tr), col = Array.from(tr.children).filter(child => /^(?:TD|TH)$/.test(child.tagName)).indexOf(cell);
	const before = String(state.blocksBefore[0].raw || ''), info = _tableInfo(before);
	if (info.sepIdx < 0) return null;
	const at = info.rowLines[row];
	const lines = _tableLf(before).split('\n'), span = Number.isInteger(at) && _rapierTableCellSpans(lines[at])[col];
	if (!span) return null;
	const from = lines.slice(0, at).reduce((length, line) => length + line.length + 1, 0) + span[0];
	const to = from + span[1] - span[0];
	return { cell, row, col, raw: before.slice(from, to), write: raw => before.slice(0, from) + raw + before.slice(to) };
}

function _rapierPlanTableCells(raw, cells, plan) {
	const source = String(raw || ''), info = _tableInfo(source), lines = _tableLf(source).split('\n');
	if (info.sepIdx < 0) return null;
	const rowAt = info.rowLines;
	let changed = false;
	for (const cell of cells.slice().sort((a, b) => b.row - a.row || b.col - a.col)) {
		const at = rowAt[cell.row];
		if (!Number.isInteger(at) || at >= lines.length) continue;
		const line = lines[at], spans = _rapierTableCellSpans(line), own = _tableSplitRow(line);
		if (!own || !spans[cell.col] || own.length !== spans.length) continue;
		const planned = plan(own[cell.col], cell.selected, cell.start, cell.end);
		if (planned == null || planned === own[cell.col]) continue;
		lines[at] = line.slice(0, spans[cell.col][0]) + _tableEscapeCell(planned) + line.slice(spans[cell.col][1]);
		changed = true;
	}
	return changed ? lines.join('\n') : null;
}

function _rapierTableFromSelection() {
	const editDiv = _rapierActiveEditDiv();
	const selection = window.getSelection && window.getSelection();
	if (!editDiv || !selection || !selection.rangeCount || selection.isCollapsed) return false;
	const range = selection.getRangeAt(0);
	if (!_rangePointInside(editDiv, range.startContainer) || !_rangePointInside(editDiv, range.endContainer)) return false;
	const wrapper = editDiv.closest('.block-wrapper');
	const blockId = wrapper && parseInt(wrapper.dataset.blockId, 10);
	const block = Number.isFinite(blockId) ? rapier.document.blocks.find(candidate => candidate.id === blockId) : null;
	if (!wrapper || !block) return false;

	const selectedDiv = document.createElement('div');
	selectedDiv.appendChild(range.cloneContents());
	const prefixRaw = _rapierBlockHalfRaw(wrapper, block, range, false).trim();
	const suffixRaw = _rapierBlockHalfRaw(wrapper, block, range, true).trim();

	let selectedText = String(_markdownFromEditHTML(selectedDiv.innerHTML) || range.toString() || '');

	const normalizedSelection = selectedText.replace(/\s+/g, ' ').trim();
	const normalizedBlock = String(block.raw || '').replace(/\s+/g, ' ').trim();
	if (!prefixRaw && !suffixRaw && normalizedSelection === normalizedBlock) selectedText = String(block.raw || '');
	if (!selectedText.trim()) return false;
	const table = _rapierTableSource(selectedText);
	const rawList = [prefixRaw, table, suffixRaw].filter(raw => raw && raw.trim());
	const at = prefixRaw && prefixRaw.trim() ? 1 : 0;
	return _replaceOneBlockWithRawSet(block, rawList, at, 0);
}

function _rapierTableSource(text) {
	const rows = String(text || '').split('\n').map(line => line.trim()).filter(Boolean)
		.map(line => _tableSplitRow(line, '\t') || _tableSplitRow(line, '|') || _tableSplitRow(line, '  ') || [line]);
	if (!rows.length) return _rapierBlockTemplate('table');
	const width = Math.max(1, ...rows.map(row => row.length));
	const line = row => _tableBuildRow([...row, ...Array(width - row.length).fill('')]);
	const lines = [line(rows[0]), _tableSeparator(width).replace(/ /g, '')];
	for (const row of rows.slice(1)) lines.push(line(row));
	if (rows.length === 1) lines.push(line([]));
	return lines.join('\n');
}

function _rapierTableCellRanges(table, range) {
	const parts = [];
	for (const cell of table.querySelectorAll('td, th')) {
		const whole = document.createRange();
		whole.selectNodeContents(cell);
		const part = range.cloneRange();
		if (part.compareBoundaryPoints(Range.START_TO_START, whole) < 0) part.setStart(whole.startContainer, whole.startOffset);
		if (part.compareBoundaryPoints(Range.END_TO_END, whole) > 0) part.setEnd(whole.endContainer, whole.endOffset);
		if (part.collapsed || !(part.toString().replace(/[\u200b\ufeff]/g, '') || part.cloneContents().querySelector('img'))) continue;
		parts.push({ cell, range: part });
	}
	return parts;
}

function _rapierTableWithout(block, table, parts) {
	const copy = table.cloneNode(true);
	const cells = Array.from(table.querySelectorAll('td, th')), copies = Array.from(copy.querySelectorAll('td, th'));
	const pathIn = (root, node) => { const path = []; for (let at = node; at !== root; at = at.parentNode) path.unshift(Array.prototype.indexOf.call(at.parentNode.childNodes, at)); return path; };
	const twin = (cell, node) => pathIn(cell, node).reduce((at, index) => at.childNodes[index], copies[cells.indexOf(cell)]);
	for (const { cell, range } of parts) {
		const gone = document.createRange();
		gone.setStart(twin(cell, range.startContainer), range.startOffset);
		gone.setEnd(twin(cell, range.endContainer), range.endOffset);
		gone.deleteContents();
	}
	if (parts.length && copies.every(cell => !String(cell.textContent || '').replace(/[\s\u200b\ufeff]+/g, '') && !cell.querySelector('img'))) return '';
	return _tableRawFromDom(block.id, copy);
}

function _rapierTableBoundary(block, node, offset, side) {
	const holder = _nodeAsElement(node);
	const table = holder && (holder.closest('table') || holder.querySelector('table'));
	if (!table || !_isTableBlock(String(block && block.raw || ''))) return null;
	const span = document.createRange();
	try {
		if (side === 'suffix') { span.setStart(table, 0); span.setEnd(node, offset); }
		else { span.setStart(node, offset); span.setEnd(table, table.childNodes.length); }
	} catch (_) { return null; }
	const parts = _rapierTableCellRanges(table, span);
	const lead = side === 'suffix' ? parts[parts.length - 1] : parts[0];
	const rows = Array.from(table.querySelectorAll('tr'));
	const row = lead && lead.cell.closest('tr');
	return {
		raw: _rapierTableWithout(block, table, parts),
		touched: parts.length > 0,
		cell: lead ? {
			rowIndex: rows.indexOf(row),
			cellIndex: Array.from(row.children).filter(child => /^(?:TD|TH)$/.test(child.tagName)).indexOf(lead.cell),
			charOffset: side === 'suffix' ? 0 : _charOffsetForRangePoint(lead.cell, lead.range.startContainer, lead.range.startOffset),
		} : null,
	};
}

function _rapierTableBoundaryRaw(block, node, offset, side) {
	return _rapierTableBoundary(block, node, offset, side)?.raw ?? null;
}

function _tableApply(blockId, newRaw, caretTarget) {
	if (_rapierUserMutationBlocked()) return false;
	const block = rapier.document.blocks.find(candidate => candidate.id === blockId);
	if (!block) return false;
	const viewport = _rapierCaptureEditorViewport();
	const before = block.raw;
	if (/\r(?!\n)/.test(before) && !before.includes('\n')) newRaw = String(newRaw).replace(/\n/g, '\r');
	if (!caretTarget?.widen) newRaw = _rapierReconcileMarkdownEditRaw(before, newRaw);
	if (before !== newRaw && !_rapierCommitBlockEdit(block.id, before, newRaw, {operation: 'document.change-block'})) return false;
	block.raw = newRaw;
	block.rendered = renderBlock(block.raw);
	block.dirty = false;
	if (before !== newRaw) _notifyHistoryState();
	rapierDirty(block.id);
	_scheduleStatsUpdate();

	const wrapper = document.querySelector('[data-block-id="' + blockId + '"]');
	if (wrapper) {
		const editing = wrapper.classList.contains('block-wrapper--editing');
		_writeBlockDOM(wrapper, block, { writeEdit: editing });
		if (editing) {
			const editDiv = wrapper.querySelector(':scope > .block-edit');
			if (editDiv) {
				editDiv._rapierHistoryBaselineRaw = newRaw;
				editDiv._rapierCheckpointFresh = true;
				_rapierRecordEditOpening(editDiv, wrapper);
				_syncEmptyClass(wrapper, editDiv);
				_rapierFocusEditingHost(editDiv);
				if (!_rapierSetTableCaret(editDiv, caretTarget)) {
					const table = editDiv.querySelector('table');
					if (table) {
						const range = document.createRange();
						range.selectNodeContents(table);
						range.collapse(false);
						const selection = window.getSelection && window.getSelection();
						if (selection) { selection.removeAllRanges(); selection.addRange(range); }
					}
				}
			}
		}
	}

	const stats = _tableStats(block.raw);
	const rowEl = document.getElementById('table-rows-' + blockId);
	const colEl = document.getElementById('table-cols-' + blockId);
	if (rowEl) rowEl.textContent = stats.rows;
	if (colEl) colEl.textContent = stats.cols;
	_rapierRefreshTableToolbarState(blockId, caretTarget || null);
	_rapierRestoreEditorViewport(viewport);
	return true;
}

async function _rapierCopyTable(blockId, format) {
	if (_rapierPersistenceCaptureBlocked()) {
		showToast('Finish your edit, then copy again.', 'info');
		return false;
	}
	const raw = _tableRawForCopy(blockId);
	if (!raw) return false;
	let text = raw;
	let label = 'Markdown';
	if (format === 'all') {
		const info = _tableInfo(raw);
		const cells = info.lines.filter((line, index) => index !== info.sepIdx).map(_tableSplitRow).filter(Boolean);
		const tsv = cells.map(row => row.map(value => String(value || '').replace(/[\t\r\n]+/g, ' ').trim()).join('\t')).join('\n');
		const copied = await _rapierWriteFormattedClipboard(renderBlock(raw), tsv, raw);
		showToast(copied ? 'Table copied' : 'Couldn’t copy the table.', copied ? 'success' : 'error');
		return copied;
	}
	if (format === 'csv' || format === 'tsv') {
		const info = _tableInfo(raw);
		const rows = info.lines
			.filter((line, index) => index !== info.sepIdx)
			.map(_tableSplitRow)
			.filter(Boolean);
		if (format === 'csv') {
			const csvCell = value => {
				const cell = String(value || '').replace(/\\\|/g, '|').trim();
				return /[",\r\n]/.test(cell) ? '"' + cell.replace(/"/g, '""') + '"' : cell;
			};
			text = rows.map(row => row.map(csvCell).join(',')).join('\n');
			label = 'CSV';
		} else {
			const tsvCell = value => String(value || '')
				.replace(/\\\|/g, '|')
				.replace(/[\t\r\n]+/g, ' ')
				.trim();
			text = rows.map(row => row.map(tsvCell).join('\t')).join('\n');
			label = 'TSV';
		}
	}
	const copied = await _rapierWriteTextClipboard(text);
	if (copied === null) return false;
	showToast(copied ? 'Table copied as ' + label : 'Couldn’t copy the table.', copied ? 'success' : 'error');
	return copied;
}

function _tableSetAlignment(blockId, alignment, position) {
	if (_rapierUserMutationBlocked()) return;
	if (!/^(?:left|center|right)$/.test(String(alignment || ''))) return;
	const raw = _tableRawFromBlock(blockId);
	if (!raw) return;
	const info = _tableInfo(raw);
	if (info.sepIdx < 0 || info.cols < 1) return;
	const fallback = Math.max(0, info.cols - 1);
	const activeCol = position && Number.isInteger(position.cellIndex)
		? Math.max(0, Math.min(fallback, position.cellIndex)) : 0;
	const next = Array.from({ length: info.cols }, (_unused, index) => info.alignments[index] || '');
	next[activeCol] = next[activeCol] === alignment ? '' : alignment;
	const lines = String(raw).split('\n');
	let seen = -1;
	const line = lines[info.sepIdx].replace(/:?-+:?/g, marker => {
		if (++seen !== activeCol) return marker;
		const dashes = '-'.repeat(marker.replace(/:/g, '').length);
		return next[activeCol] === 'center' ? ':' + dashes + ':' : next[activeCol] === 'left' ? ':' + dashes
			: next[activeCol] === 'right' ? dashes + ':' : dashes;
	});
	lines[info.sepIdx] = seen >= activeCol ? line : _tableSeparator(info.cols, next) + (/\r$/.test(lines[info.sepIdx]) ? '\r' : '');
	_tableApply(blockId, lines.join('\n'), {
		rowIndex: Math.max(0, Number(position?.rowIndex) || 0),
		cellIndex: activeCol,
		charOffset: position?.charOffset == null ? 0 : position.charOffset,
	});
}

function _tableChangeRows(blockId, delta, position, sourceRaw = null) {
	if (_rapierUserMutationBlocked()) return;
	const raw = sourceRaw == null ? _tableRawFromBlock(blockId) : sourceRaw;
	if (!raw) return;
	const info = _tableInfo(raw);
	const lines = info.lines.slice();
	if (info.sepIdx < 0) return;
	const activeRow = position && Number.isInteger(position.rowIndex) ? position.rowIndex : null;
	const activeCol = Math.max(0, Number(position?.cellIndex) || 0);

	if (delta > 0) {
		const cols = Math.max(1, info.cols || 1);
		let insertAt = lines.length;
		let targetRow = info.dataIdxs.length + 1;
		if (activeRow === 0) {
			insertAt = info.sepIdx + 1;
			targetRow = 1;
		} else if (activeRow != null && activeRow > 0) {
			const dataLine = info.dataIdxs[Math.min(info.dataIdxs.length - 1, activeRow - 1)];
			if (Number.isInteger(dataLine)) {
				insertAt = dataLine + 1;
				targetRow = Math.min(info.dataIdxs.length + 1, activeRow + 1);
			}
		}
		lines.splice(insertAt, 0, _tableBuildRow(Array(cols).fill('')));
		_tableApply(blockId, lines.join('\n'), {
			rowIndex: targetRow,
			cellIndex: 0,
			charOffset: 0,
			arrive: 'row',
		});
		return;
	}

	if (!info.dataIdxs.length) { _rapierTableRemove(blockId); return; }
	if (activeRow === 0) {
		const first = info.dataIdxs[0];
		const promoted = lines.slice();
		promoted[info.rowLines[0]] = lines[first];
		promoted.splice(first, 1);
		_tableApply(blockId, promoted.join('\n'), {
			rowIndex: 0,
			cellIndex: Math.min(Math.max(0, info.cols - 1), activeCol),
			charOffset: 0,
		});
		return;
	}
	const dataIndex = activeRow != null && activeRow > 0
		? Math.min(info.dataIdxs.length - 1, activeRow - 1)
		: info.dataIdxs.length - 1;
	lines.splice(info.dataIdxs[dataIndex], 1);
	const remainingRows = Math.max(0, info.dataIdxs.length - 1);
	const targetRow = remainingRows ? Math.min(dataIndex + 1, remainingRows) : 0;
	_tableApply(blockId, lines.join('\n'), {
		rowIndex: targetRow,
		cellIndex: Math.min(Math.max(0, info.cols - 1), activeCol),
		charOffset: 0,
		closeFrom: dataIndex + 1,
	});
}

function _tableChangeCols(blockId, delta, position) {
	if (_rapierUserMutationBlocked()) return;
	const raw = _tableRawFromBlock(blockId);
	if (!raw) return;
	const info = _tableInfo(raw);
	if (info.sepIdx < 0) return;
	const fallback = Math.max(0, info.cols - 1);
	const activeCol = position && Number.isInteger(position.cellIndex)
		? Math.max(0, Math.min(fallback, position.cellIndex))
		: fallback;

	if (delta > 0) {
		const insertCol = activeCol + 1;
		const newLines = info.lines.map((line, index) => {
			const cells = _tableSplitRow(line);
			if (!cells) return line;

			cells.splice(insertCol, 0, index === info.sepIdx ? '---' : '');
			return _tableBuildRow(cells);
		});
		_tableApply(blockId, newLines.join('\n'), {
			rowIndex: Math.max(0, Number(position?.rowIndex) || 0),
			cellIndex: insertCol,
			charOffset: 0,
			arrive: 'col',
		});
		return;
	}

	if (info.cols <= 1) { _rapierTableRemove(blockId); return; }
	const newLines = info.lines.map(line => {
		const cells = _tableSplitRow(line);
		if (!cells || cells.length <= 1) return line;
		cells.splice(Math.min(activeCol, cells.length - 1), 1);
		return _tableBuildRow(cells);
	});
	_tableApply(blockId, newLines.join('\n'), {
		rowIndex: Math.max(0, Number(position?.rowIndex) || 0),
		cellIndex: Math.min(activeCol, info.cols - 2),
		charOffset: 0,
	});
}

function _rapierTrimTableCellEdges(sel, range) {
	const cellOf = node => { const el = node && (node.nodeType === Node.TEXT_NODE ? node.parentElement : node); return el && el.closest ? el.closest('td, th') : null; };
	const first = cellOf(range.startContainer), last = cellOf(range.endContainer);
	if (!first || !last || first === last || first.closest('table') !== last.closest('table')) return range;
	const cells = Array.from(first.closest('table').querySelectorAll('td, th'));
	const empty = (fromNode, fromOffset, toNode, toOffset) => {
		const probe = document.createRange();
		try { probe.setStart(fromNode, fromOffset); probe.setEnd(toNode, toOffset); } catch (_) { return false; }
		return !probe.toString() && !probe.cloneContents().querySelector('img');
	};
	const trimmed = range.cloneRange();
	if (empty(last, 0, range.endContainer, range.endOffset) && cells.indexOf(last) > 0) {
		const before = cells[cells.indexOf(last) - 1];
		trimmed.setEnd(before, before.childNodes.length);
	}
	if (empty(range.startContainer, range.startOffset, first, first.childNodes.length) && cells.indexOf(first) < cells.length - 1) {
		trimmed.setStart(cells[cells.indexOf(first) + 1], 0);
	}
	if (trimmed.collapsed || trimmed.compareBoundaryPoints(Range.START_TO_START, range) === 0 && trimmed.compareBoundaryPoints(Range.END_TO_END, range) === 0) return range;
	try { sel.removeAllRanges(); sel.addRange(trimmed); } catch (_) { return range; }
	return sel.rangeCount ? sel.getRangeAt(0) : range;
}

function _rapierHtmlTableHasDirection(table) {
	return /^(?:ltr|rtl|auto)$/i.test(table.getAttribute('dir') || '') ||
		/^(?:ltr|rtl)$/i.test(table.style?.direction || '');
}

function _rapierHtmlTableNeedsHtml(table, {paragraphsAsLines = false} = {}) {
	if (!table) return false;
	if (_rapierHtmlTableHasDirection(table)) return true;
	if (table.querySelector('caption,table')) return true;
	return Array.from(table.querySelectorAll('td,th')).some(cell => _rapierHtmlTableCellNeedsHtml(cell, paragraphsAsLines));
}

function _rapierHtmlTableCellNeedsHtml(cell, paragraphsAsLines) {
	if (['colspan', 'rowspan'].some(name => cell.hasAttribute(name) && String(cell.getAttribute(name)).trim() !== '1')) return true;
	if (cell.querySelector('address,article,aside,blockquote,details,dialog,div,dl,fieldset,figure,footer,form,h1,h2,h3,h4,h5,h6,header,hgroup,hr,main,nav,ol,pre,section,ul')) return true;
	const paragraphs = cell.querySelectorAll('p');
	if (Array.from(paragraphs).some(paragraph => Object.keys(globalThis.RapierMarkdownLayout.textLayout(paragraph.style, {pointSize: 1})).length)) return true;
	if (paragraphsAsLines) return Array.from(paragraphs).some(paragraph => paragraph.parentElement !== cell || paragraph.attributes.length &&
		Array.from(paragraph.attributes).some(attribute => attribute.name !== 'dir'));
	return paragraphs.length > 1 || paragraphs.length === 1 && Array.from(cell.childNodes).some(node =>
		node !== paragraphs[0] && (node.nodeType === 1 || node.nodeType === 3 && /\S/.test(node.nodeValue || '')));
}

function _rapierHtmlTablePicture(node, doc, appendix) {
	const remote = node.getAttribute('data-rapier-remote-src'), label = node.getAttribute('data-rapier-asset');
	const src = remote || node.getAttribute('data-rapier-image-url') || (label ? appendix(label) : node.getAttribute('src')) || '';
	if (!src && !label) return;
	const authored = node.nodeName === 'IMG' && !node.hasAttribute('data-rapier-markdown-image');
	const image = doc.createElement('img');
	if (src) image.setAttribute('src', src);
	if (authored) {
		for (const attribute of Array.from(node.attributes)) if (attribute.name !== 'src') image.setAttribute(attribute.name, attribute.value);
	} else {
		const rawAlt = node.getAttribute('data-rapier-image-alt-source');
		const sourceParts = rawAlt == null ? null : _rapierRenderModule('render-markdown')._rapierImageAltSourceParts(rawAlt);
		const alt = sourceParts && _rapierRenderModule('render-markdown')._rapierImageAltText(sourceParts.alt) === '' ? '' :
			node.getAttribute(remote ? 'data-rapier-remote-alt' : 'alt');
		const title = node.getAttribute(remote ? 'data-rapier-remote-title' : 'title');
		const size = _rapierRenderModule('render-markdown')._rapierImageAltSize(rawAlt);
		if (alt != null) image.setAttribute('alt', alt);
		if (title) image.setAttribute('title', title);
		if (size) image.setAttribute('width', String(size.width));
	}
	node.replaceWith(image);
}

function _rapierHtmlTableSource(table) {
	const inert = document.implementation.createHTMLDocument(''), assets = globalThis.RapierImageAssets;
	const copy = inert.importNode(table, true);
	let index = null;
	const appendix = label => (index ||= assets.documentAssets(_rapierSourceText())).assets.get(assets.normalizeLabel(label))?.url || '';
	copy.querySelectorAll('.table-edit-controls, .table-tools, .table-toolbar, .block-edit-button, .block-plus, .block-move-controls, [data-table-action]').forEach(node => node.remove());
	copy.querySelectorAll('img, span[data-rapier-remote-src]').forEach(node => _rapierHtmlTablePicture(node, inert, appendix));
	for (const node of [copy, ...copy.querySelectorAll('*')]) {
		for (const attribute of Array.from(node.attributes)) {
			if (/^(?:data-|on)/i.test(attribute.name) || /^(?:contenteditable|tabindex|spellcheck|draggable|autocorrect|autocapitalize|aria-selected|aria-readonly)$/i.test(attribute.name)) node.removeAttribute(attribute.name);
		}
		const classes = (node.getAttribute('class') || '').split(/\s+/).filter(name => name && !/^(?:rapier-|block-|table-(?:edit|tools|toolbar))/.test(name));
		if (classes.length) node.setAttribute('class', classes.join(' ')); else node.removeAttribute('class');
		if (/^(?:rapier-|table-(?:rows|cols|toolbar)-)/.test(node.getAttribute('id') || '')) node.removeAttribute('id');
	}
	return globalThis.RapierMarkdownSpec.htmlBlockLines(_rapierRenderModule('render-sanitize').sanitizeRapierHtml(copy.outerHTML, 'source'));
}

function _rapierHtmlTablePasteGrid(table, mapCell = null) {
	if (!table || _rapierHtmlTableNeedsHtml(table)) return null;
	const sourceRows = Array.from(table.querySelectorAll('tr')).filter(row => row.closest('table') === table);
	const text = typeof mapCell === 'function' ? mapCell : (cell => String(cell.textContent || '')
		.replace(/\u00a0/g, ' ').replace(/[\t\r\n]+/g, ' ').trim());
	const rows = sourceRows.map(row => Array.from(row.children).filter(cell => /^(?:TH|TD)$/.test(cell.tagName)).map(text)).filter(row => row.length);
	const maxWidth = Math.max(0, ...rows.map(row => row.length));
	if (!maxWidth) return null;
	rows.forEach(row => { while (row.length < maxWidth) row.push(''); });
	return rows;
}

function _rapierTsvRows(body) {
	const lines = () => body.split('\n').map(line => line.split('\t'));
	const rows = [];
	let row = [], at = 0;
	for (;;) {
		let cell = '';
		if (body[at] === '"') {
			for (let from = at + 1;;) {
				const quote = body.indexOf('"', from);
				if (quote < 0) return lines();
				cell += body.slice(from, quote);
				if (body[quote + 1] !== '"') { at = quote + 1; break; }
				cell += '"'; from = quote + 2;
			}
			if (at < body.length && body[at] !== '\t' && body[at] !== '\n') return lines();
		} else {
			let end = at;
			while (end < body.length && body[end] !== '\t' && body[end] !== '\n') end++;
			cell = body.slice(at, end); at = end;
		}
		row.push(cell);
		if (at >= body.length) { rows.push(row); return rows; }
		if (body[at] === '\n') { rows.push(row); row = []; }
		at++;
	}
}

function _rapierTabularPasteGrid(payload) {
	const html = String(payload?.html || '');
	let table = null;
	if (/<table\b/i.test(html)) {
		try {
			const root = document.createElement('div');
			root.innerHTML = _rapierPreparePasteHtml(html);
			table = root.querySelector('table');
			if (_rapierHtmlTableNeedsHtml(table)) return null;
		} catch (_) { return null; }
	}
	const plain = String(payload?.plain || '').replace(/\r\n?/g, '\n');
	if (plain.includes('\t')) {
		const rows = _rapierTsvRows(plain.replace(/\n+$/g, ''));
		if (rows.length && rows.some(row => row.length > 1)) return rows;
	}
	return _rapierHtmlTablePasteGrid(table) || _rapierTableDelimitedGrid(plain);
}

function _rapierPasteGridIntoTable(editDiv, grid) {
	if (!editDiv || !Array.isArray(grid) || !grid.length || _rapierUserMutationBlocked(false)) return false;
	const wrapper = editDiv.closest('.block-wrapper--editing.block-wrapper--table');
	const blockId = Number(wrapper?.dataset.blockId);
	const position = _rapierTableActionPosition(editDiv);
	if (!wrapper || !Number.isSafeInteger(blockId) || !position) return false;
	const width = Math.max(0, ...grid.map(row => Array.isArray(row) ? row.length : 0));
	if (!width) return false;

	_rapierCheckpointEdit(editDiv);
	const raw = _tableRawFromBlock(blockId);
	const info = _tableInfo(raw);
	if (info.sepIdx < 0 || info.cols < 1) return false;
	const lineOf = info.rowLines;
	if (!Number.isInteger(lineOf[0])) return false;
	const rows = lineOf.map(index => _tableSplitRow(info.lines[index]) || []);
	const requiredRows = Math.max(rows.length, position.rowIndex + grid.length);
	const requiredCols = Math.max(info.cols, position.cellIndex + width);
	while (rows.length < requiredRows) rows.push([]);
	rows.forEach(row => { while (row.length < requiredCols) row.push(''); });

	const escapePlain = value => turndown.escape(String(value == null ? '' : value)
		.replace(/\u00a0/g, ' ').replace(/[\t\r\n]+/g, ' '));
	grid.forEach((incoming, rowOffset) => {
		if (!Array.isArray(incoming)) return;
		incoming.forEach((value, colOffset) => {
			rows[position.rowIndex + rowOffset][position.cellIndex + colOffset] = escapePlain(value);
		});
	});
	const alignments = Array.from({ length: requiredCols }, (_unused, index) => info.alignments[index] || '');
	const grew = requiredCols > info.cols;
	const reached = index => index >= position.rowIndex && index < position.rowIndex + grid.length;
	const rowLine = (row, index) => !grew && index < lineOf.length && !reached(index) ? info.lines[lineOf[index]] : _tableBuildRow(row);
	const nextRaw = [
		rowLine(rows[0], 0),
		grew ? _tableSeparator(requiredCols, alignments) : info.lines[info.sepIdx],
		...rows.slice(1).map((row, index) => rowLine(row, index + 1)),
	].join('\n');
	if (_tableApply(blockId, nextRaw, {
		rowIndex: Math.min(requiredRows - 1, position.rowIndex + grid.length - 1),
		cellIndex: Math.min(requiredCols - 1, position.cellIndex + width - 1),
		charOffset: Infinity,
	})) srAnnounce('Table cells pasted.');
	return true;
}

globalThis.RapierTables = Object.freeze({ arrive: _rapierTableArriveNext, shape: _rapierTableShape, key: _rapierTableKey, cut: _rapierTableCut, forget: _rapierTablePinchForget, resume: _rapierTablePinchResume });
