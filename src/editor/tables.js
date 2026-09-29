/* The table's chrome, phone first (editor/scripts.json bundles it after editor/engine.js, in the same
   script scope). The engine keeps the table's source and its one transaction per act (_tableApply);
   this file shows a person where they are and turns their taps into those acts: the caret's cell with
   its row and column, and the bar's align control, which says the column's alignment in its glyph. */

const RAPIER_TABLE_ALIGN_NEXT = { '': 'left', left: 'center', center: 'right', right: '' };
const RAPIER_TABLE_ALIGN_WORD = { '': 'as written', left: 'left', center: 'centre', right: 'right' };

function _rapierTableCellsOf(row) {
	return row ? Array.from(row.children).filter(node => /^(?:TH|TD)$/.test(node.tagName)) : [];
}

// The caret's cell, and the row and column the bar's remove buttons act on, are shown by fill.
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
			// An empty cell of the caret's row says whose it is, as an empty heading says "Heading": its
			// column's heading, or "Cell" under an empty one (CSS shows it only while the cell is empty).
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
		// The glyph is what the column looks like: a column of numbers left as written stands to the right.
		const numeric = !current && !!table && !!Array.from(table.querySelectorAll('tr')).some(row => _rapierTableCellsOf(row)[col]?.classList.contains('rapier-cell--num'));
		align.dataset.tableAlignShown = current || (numeric ? 'right' : 'left');
		align.setAttribute('aria-label', 'align column: ' + RAPIER_TABLE_ALIGN_WORD[current] + '; tap for ' + RAPIER_TABLE_ALIGN_WORD[RAPIER_TABLE_ALIGN_NEXT[current]]);
		align.title = align.getAttribute('aria-label');
	}
}

// A table wider than the screen scrolls sideways under its first column, which stays (CSS); the
// caret's cell is kept in view beside it, never under it.
function _rapierTableKeepInView(table, cell, cellIndex) {
	const scroller = table.closest('.table-scroll-wrap');
	if (!scroller || scroller.scrollWidth <= scroller.clientWidth + 1) return;
	const first = cellIndex > 0 ? _rapierTableCellsOf(cell.parentElement)[0] : null;
	const box = scroller.getBoundingClientRect(), at = cell.getBoundingClientRect();
	const start = box.left + (first ? first.getBoundingClientRect().width : 0);
	if (at.left < start - 1) scroller.scrollLeft -= start - at.left;
	else if (at.right > box.right + 1) scroller.scrollLeft += Math.min(at.right - box.right, at.left - start);
}

// Motion says what an act did: a table arrives from the caret, a new row or column arrives in its
// place, and the rows under a removed one close the gap. One motion each, none when a person asks
// for less (CSS), and nothing of it touches the source.
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
	// A widened column: the columns after it slide from where they stood to their new place.
	if (position.widen) _rapierTableCellsOf(rows[0]).forEach((head, index) => {
		const from = position.widen.from[index];
		const dx = index > position.widen.index && Number.isFinite(from) ? Math.round(from - head.getBoundingClientRect().left) : 0;
		if (!dx) return;
		const cells = rows.map(row => _rapierTableCellsOf(row)[index]).filter(Boolean);
		cells.forEach(node => node.style.setProperty('--rapier-widen-from', dx + 'px'));
		play(cells, 'rapier-cell--widen');
	});
}

// A table's shape, read or edited: a column whose filled body cells are all numbers is set in
// tabular numerals and, unless its separator aligns it, to the right, its heading with it.
function _rapierTableShape(root) {
	const host = root.closest && root.closest('.block-wrapper');
	const block = host && _rapierBoundBlock(host);
	if (block) _rapierTableWidths(root, block.raw);
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

// The align control cycles as written, left, centre, right, and back: one exact separator change.
function _rapierTableAlignNext(blockId, position) {
	const block = rapier.document.blocks.find(candidate => candidate.id === blockId);
	if (!block) return;
	const info = _tableInfo(_tableRawFromBlock(blockId) || block.raw);
	const col = position && Number.isInteger(position.cellIndex) ? Math.max(0, Math.min(info.cols - 1, position.cellIndex)) : 0;
	const current = info.alignments[col] || '';
	const next = RAPIER_TABLE_ALIGN_NEXT[current];
	// _tableSetAlignment toggles a pressed alignment off, which is how "as written" comes back.
	_tableSetAlignment(blockId, next || current, position);
}

// The last row or the last column removed is the table removed: one transaction leaves an empty
// line where it stood, with the caret in it, and one Undo brings the table back whole.
function _rapierTableRemove(blockId) {
	const block = rapier.document.blocks.find(candidate => candidate.id === blockId);
	return !!block && _replaceOneBlockWithRawSet(block, [''], 0, 0, { keepEmpty: true });
}

// A bar button acts on the finger's press, so the table can shrink or grow under the finger before
// it lifts; the click that follows would land on whatever moved there (the paragraph below, which
// took the person out of the table). That one click is the press's own, and it is swallowed.
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

// Enter in a cell goes down, as a phone's return key and a spreadsheet do: to the cell below, or on
// the last row to a new row's first cell; Enter on that new row still empty leaves the table for an
// empty line under it (the row taken back in the same transaction), as Enter on an empty list item
// leaves the list. Shift+Enter keeps its line break inside the cell.
function _rapierTableEnter(editDiv, wrapper, block, cell) {
	const position = _rapierTableActionPosition(editDiv);
	const raw = position && _tableRawFromBlock(block.id);
	const info = raw ? _tableInfo(raw) : null;
	if (!info || info.sepIdx < 0) return false;
	const rowCount = 1 + info.dataIdxs.length;
	_rapierCheckpointEdit(editDiv);
	if (position.rowIndex + 1 < rowCount) return _rapierMoveTableCaret(editDiv, position.rowIndex + 1, Math.min(position.cellIndex, Math.max(0, info.cols - 1)), true);
	const last = position.rowIndex > 0 && _tableSplitRow(info.lines[info.dataIdxs[info.dataIdxs.length - 1]]);
	if (!last || last.some(value => String(value || '').replace(/\u200b/g, '').trim())) {
		_tableChangeRows(block.id, 1, { rowIndex: position.rowIndex, cellIndex: 0, charOffset: 0 });
		return true;
	}
	// One commit leaves: the table without its empty last row (a header alone is still a table, and
	// its only row stays) and a real empty paragraph under it with the caret on it.
	const lines = info.lines.slice();
	if (info.dataIdxs.length > 1) lines.splice(info.dataIdxs[info.dataIdxs.length - 1], 1);
	return _replaceOneBlockWithRawSet(block, [lines.join('\n'), ''], 1, 0, { keepEmpty: true });
}

// Grips: the caret's row carries one on its start edge and its column one on its top edge, and only
// those (the handles are on the cell you are in, not everywhere). A finger drags a grip to move the
// row or the column; a drop line shows where it lands; one transaction and one Undo on release.
// The keyboard's way is Alt+Arrow in any cell.
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
			grip.setAttribute('aria-label', axis === 'row' ? 'this row: tap to pick it, drag to move it (Alt+Up, Alt+Down)'
				: axis === 'col' ? 'this column: tap to pick it, drag to move it (Alt+Left, Alt+Right)' : 'this column\'s width: drag to widen it');
			grip.addEventListener('pointerdown', _rapierTableGripDown);
			wrapper.appendChild(grip);
			return grip;
		});
	}
	// A wide table scrolled sideways carries its grips with it; the person's swipe moves only the grips,
	// never the caret's cell back into view.
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
	// A column under the sticky first column is out of view, and so are its grips.
	const first = scroller && position.cellIndex > 0 ? _rapierTableCellsOf(row)[0] : null;
	const clip = { left: first ? Math.max(scrolled.left, first.getBoundingClientRect().right) : scrolled.left, right: scrolled.right };
	const [rowGrip, colGrip, edgeGrip] = grips;
	rowGrip.hidden = false;
	rowGrip.style.left = Math.round(Math.max(t.left, scrolled.left) - box.left - 22) + 'px';
	rowGrip.style.top = Math.round(r.top + r.height / 2 - box.top - 22) + 'px';
	rowGrip.dataset.index = String(position.rowIndex);
	const centre = c.left + c.width / 2;
	colGrip.hidden = centre < clip.left || centre > clip.right;
	colGrip.style.left = Math.round(centre - box.left - 22) + 'px';
	colGrip.style.top = Math.round(t.top - box.top - 36) + 'px';
	colGrip.dataset.index = String(position.cellIndex);
	// The width grip stands over the column's end edge, beside the column's own.
	const edge = Math.min(Math.max(c.right, centre + 44), box.right - 22);
	edgeGrip.hidden = c.right < clip.left || c.right > clip.right + 22;
	edgeGrip.style.left = Math.round(edge - box.left - 22) + 'px';
	edgeGrip.style.top = colGrip.style.top;
	edgeGrip.dataset.index = String(position.cellIndex);
}

// A column's width is its separator's dashes, the width Pandoc and other tools read: a column
// written with more than three is at least that many characters wide. Columns otherwise take their
// words' width (a table wider than the screen scrolls).
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

// The width grip dragged: a guide stands where the column's end will be and follows the finger (moved
// by transform, the table untouched while the finger moves); on release the separator marker is written
// with as many dashes as characters fit (three at least, its colons kept), one commit, one Undo, and the
// columns after it slide to their new place.
function _rapierTableWiden(wrapper, table, index, grip, down, position) {
	const head = _rapierTableCellsOf(table.rows[0])[index];
	if (!head) return;
	const at = head.getBoundingClientRect();
	const style = getComputedStyle(head);
	const pad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
	const measure = (_rapierTableWiden.canvas ||= document.createElement('canvas')).getContext('2d');
	measure.font = style.font;
	const ch = Math.max(1, measure.measureText('0').width);
	// The narrowest the column can be written is its own words' width: read once, at the press.
	const was = head.style.minWidth;
	head.style.minWidth = '0px';
	const least = Math.max(head.getBoundingClientRect().width, ch * 3 + pad);
	head.style.minWidth = was;
	const guide = document.createElement('div');
	guide.className = 'table-drop';
	guide.hidden = true;
	wrapper.appendChild(guide);
	let width = at.width, moved = false;
	const move = event => {
		if (!moved && Math.abs(event.clientX - down.clientX) < 8) return;
		moved = true;
		// Whole characters, as the separator writes them: what the guide shows is what the release writes.
		width = Math.max(least, Math.max(3, Math.round((at.width + event.clientX - down.clientX - pad) / ch)) * ch + pad);
		const box = wrapper.getBoundingClientRect(), t = table.getBoundingClientRect();
		guide.hidden = false;
		Object.assign(guide.style, { left: '0px', top: (t.top - box.top) + 'px', width: '2px', height: t.height + 'px',
			transform: 'translateX(' + Math.round(at.left + width - box.left - 1) + 'px)' });
		grip.style.transform = 'translateX(' + Math.round(width - at.width) + 'px)';
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
		const raw = _tableRawFromBlock(blockId);
		const info = raw ? _tableInfo(raw) : null;
		if (!info || info.sepIdx < 0) return;
		// Only this column's run of dashes changes; the line's own spacing and every other byte stay. Drawn in
		// to its words, the column is written plain again (three dashes: as wide as its words).
		const dashes = width <= least + 0.5 ? 3 : Math.max(3, Math.round((width - pad) / ch));
		let seen = -1, changed = false;
		const line = info.lines[info.sepIdx].replace(/-+/g, run => {
			seen++;
			if (seen !== index || run.length === dashes) return run;
			changed = true;
			return '-'.repeat(dashes);
		});
		if (!changed) return;
		const lines = info.lines.slice();
		lines[info.sepIdx] = line;
		const from = _rapierTableCellsOf(table.rows[0]).map(cell => cell.getBoundingClientRect().left);
		_rapierTableApplyWidth(blockId, lines.join('\n'), position, { index, from });
	};
	grip.addEventListener('pointermove', move);
	grip.addEventListener('pointerup', end);
	grip.addEventListener('pointercancel', end);
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
	// The press keeps the caret and the keyboard where they are.
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
		// A press that never moved is a tap on the grip: it picks the row or the column, and its
		// click is the press's own.
		if (!dragging) { _rapierTableSwallowClick(event); _rapierTablePickLine(table, axis, from); }
		if (!dragging || target === from) return;
		_rapierCheckpointEdit(editDiv);
		_rapierTableMove(Number(wrapper.dataset.blockId), axis, from, target, position);
	};
	grip.addEventListener('pointermove', move);
	grip.addEventListener('pointerup', end);
	grip.addEventListener('pointercancel', end);
}

// A row moves as its own line, byte for byte; a column moves cell by cell through the table's writer.
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

function _rapierTableKey(editDiv, event) {
	if (event.defaultPrevented || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return false;
	const step = { ArrowUp: ['row', -1], ArrowDown: ['row', 1], ArrowLeft: ['col', -1], ArrowRight: ['col', 1] }[event.key];
	const wrapper = step && editDiv.closest('.block-wrapper--editing.block-wrapper--table');
	const position = wrapper && _rapierTableActionPosition(editDiv);
	if (!position) return false;
	event.preventDefault();
	const [axis, delta] = step;
	const from = axis === 'row' ? position.rowIndex : position.cellIndex;
	_rapierCheckpointEdit(editDiv);
	_rapierTableMove(Number(wrapper.dataset.blockId), axis, from, from + delta, position);
	return true;
}

// Cells copied from a spreadsheet or a CSV file: rows of tab- or comma-separated values (quoted as
// RFC 4180 quotes them), every row the same width, two or more wide and two or more tall. The grid,
// or null when the text is not that (a sentence with commas in it stays a sentence, and lines
// indented by tabs stay lines).
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
		// Indented lines are not a first column of nothing; prose with a comma per line is prose.
		if (rows.every(each => !each[0])) continue;
		// A comma a space follows is prose's comma, not a file's.
		if (separator === ',' && (spaced || rows.some(each => each.some(value => value.length > 64 || /[.!?;:]\s/.test(value))))) continue;
		return rows;
	}
	return null;
}

// Such cells pasted outside a table are a table: the first row its heading. Their words are plain
// text, escaped, so a star in a cell stays a star.
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

// An HTML table pasted outside a table (a spreadsheet's cells, a web page's table) is a new table, and
// arrives as every new table does; inside a table its cells fill from the caret's (the engine's).
function _rapierTableHtmlPaste(event) {
	const html = event.clipboardData ? event.clipboardData.getData('text/html') : '';
	if (event.defaultPrevented || !/<table\b/i.test(html)) return;
	const selection = window.getSelection && window.getSelection();
	const at = selection && selection.rangeCount ? selection.getRangeAt(0).startContainer : null;
	const place = at && (at.nodeType === 1 ? at : at.parentElement);
	if (place?.closest?.('#editor-blocks') && !place.closest('pre, code, td, th')) _rapierTableArriveNext();
}

// A pipe row typed into a paragraph, then Enter, is a table: the row as typed is its heading, and a
// row under it takes the caret. One commit after the typing's own, so Undo gives the typed line back.
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

// Cells picked: a selection that runs from one cell into another picks the rectangle between them,
// shown by fill. Delete or Backspace empties those cells in one commit (every cell of the table
// picked is the table deleted); a letter typed empties them and starts the first; Copy carries them
// as a spreadsheet's cells, an HTML table and a Markdown table at once; Cut copies, then empties.
// A tap on a row's or a column's grip picks that whole row or column.
let _rapierTablePick = null;
function _rapierTablePickNow() {
	const selection = window.getSelection && window.getSelection();
	if (!selection || !selection.rangeCount || selection.isCollapsed) return null;
	const cellOf = node => (node && (node.nodeType === 1 ? node : node.parentElement))?.closest?.('th,td') || null;
	const from = cellOf(selection.anchorNode), to = cellOf(selection.focusNode);
	if (!from || !to || from === to) return null;
	const table = from.closest('table');
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
	document.querySelectorAll('#editor-blocks .rapier-cell--picked').forEach(cell => cell.classList.remove('rapier-cell--picked'));
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
	_rapierTablePickShow();
	return true;
}

// The picked cells emptied (and `typed` written into the first), as source: only the rows the pick
// reaches are written again, each once.
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
	if (!pick) return;
	event.preventDefault();
	event.stopImmediatePropagation();
	_rapierTablePickEmpty(pick, /^insert/.test(event.inputType) ? String(event.data || '') : '');
}

// A composing keyboard (a phone's: its first letter starts a composition nothing may cancel) typing over
// picked cells: the picked cells are emptied in the edit and the caret put in the first before the
// composition takes the selection, so the word lands there and nothing else goes. The composition's own
// commit writes them, one Undo with the word.
function _rapierTablePickCompose() {
	const pick = _rapierTablePickNow();
	if (!pick || rapier.composition.block || _rapierUserMutationBlocked(false)) return;
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

// The four the engine's own owners reach for, by the satellites' idiom (as RapierImageFlow): an
// owner lifted alone into a proof harness runs without this file and simply does without them.
globalThis.RapierTables = Object.freeze({ arrive: _rapierTableArriveNext, shape: _rapierTableShape, grid: _rapierTableDelimitedGrid, key: _rapierTableKey });
