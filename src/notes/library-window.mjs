// SPDX-License-Identifier: AGPL-3.0-only
const finite = (n, min = 0) => typeof n === 'number' && Number.isFinite(n) && n >= min;
const integer = (n, min = 0) => Number.isSafeInteger(n) && n >= min;
const freeze = Object.freeze;

export function createMasonry({items, width, columns = 2, gap = 8, context, epoch = 0, start = 0}) {
	if (!Array.isArray(items) || !integer(columns, 1) || columns > 8 || !finite(gap) || !finite(width, 1) || width <= gap * (columns - 1)
		|| typeof context !== 'string' || !context || !integer(epoch) || !integer(start) || start > items.length) throw new TypeError('masonry needs ordered identities and an exact layout context');
	const seen = new Set(), ordered = items.map(item => {
		if (typeof item?.key !== 'string' || !item.key || seen.has(item.key) || typeof item.revision !== 'string' || !item.revision) throw new TypeError('masonry identities must be unique folder revisions');
		seen.add(item.key); return freeze({key:item.key, revision:item.revision});
	});
	return freeze({items:freeze(ordered), width, columns, gap, context, epoch, start, next:start, columnWidth:(width - gap * (columns - 1)) / columns,
		heights:freeze(Array(columns).fill(0)), blocks:freeze([]), extent:0});
}

export function planMasonry(state, {top = 0, viewportHeight, overscan = viewportHeight, batch = state.columns * 2} = {}) {
	if (!finite(top) || !finite(viewportHeight, 1) || !finite(overscan) || !integer(batch, 1) || batch > 32 || !Number.isFinite(top + viewportHeight + overscan)) throw new TypeError('masonry needs a finite viewport and a bounded batch');
	const complete = state.next === state.items.length, covered = Math.min(...state.heights) >= top + viewportHeight + overscan;
	return {derive:complete || covered ? [] : state.items.slice(state.next, state.next + batch), complete, covered, extent:state.extent, unknownTail:!complete};
}

// Only settled measurements enter geometry. A changed font, width, source or fold is a new epoch.
export function commitMasonry(state, measurements) {
	if (!Array.isArray(measurements) || !measurements.length || measurements.length > 32 || state.next + measurements.length > state.items.length) throw new TypeError('masonry needs a nonempty bounded measurement batch');
	const heights = state.heights.slice(), blocks = state.blocks.slice();
	let tail = blocks.length && blocks[blocks.length - 1].length < 64 ? blocks.pop().slice() : [], next = state.next;
	for (const m of measurements) {
		const wanted = state.items[next];
		if (m?.key !== wanted.key || m.revision !== wanted.revision || m.epoch !== state.epoch || m.context !== state.context || m.width !== state.columnWidth || m.settled !== true
			|| !finite(m.height, Number.MIN_VALUE)) throw new Error('masonry refuses an estimated, stale, out-of-order or unsettled measurement');
		let column = 0; for (let i = 1; i < heights.length; i++) if (heights[i] < heights[column]) column = i;
		const top = heights[column], bottom = top + m.height + state.gap;
		if (bottom > Number.MAX_SAFE_INTEGER) throw new RangeError('masonry geometry exceeds exact numeric coordinates');
		tail.push(freeze({key:m.key, revision:m.revision, column, x:Math.round(column * (state.columnWidth + state.gap)), y:Math.round(top), height:m.height, width:state.columnWidth}));
		heights[column] = bottom; next++;
		if (tail.length === 64) { blocks.push(freeze(tail)); tail = []; }
	}
	if (tail.length) blocks.push(freeze(tail));
	return freeze({...state, next, heights:freeze(heights), blocks:freeze(blocks), extent:Math.max(...heights) - state.gap});
}

export function masonryRows(state, {top = 0, bottom = Infinity} = {}) {
	if (!finite(top) || !(bottom === Infinity || finite(bottom, top))) throw new TypeError('masonry window is outside its coordinate space');
	const rows = [];
	for (const block of state.blocks) for (const row of block) if (row.y + row.height >= top && row.y <= bottom) rows.push(row);
	return rows;
}

// Where a carried card goes: the one answer to "which place is closest to where the card is held", asked by
// the drag while the finger moves and by the drop when it lifts, so the cards never make a place the drop
// will not write. `heights` are the other cards of the section in their order, `height` the carried card's
// own; `x`, `y` the carried card's top left in the grid (the finger less where it holds the card). Every
// place the card could take is one insertion index, and the card's slot at index k is the shortest column
// after the first k others are packed -- the page's own rule (commitMasonry: the shortest column, the
// leftmost of equals) -- so every slot comes from one pass over the prefix. Every slot of every column is
// weighed: a slot in the column the carried card's centre is over by how far its top is from the card's top;
// a slot in another column by its plain distance from the card measured from that column's line (the column
// step and the height between), so the card's own column wins until another column has a place nearer than
// its own -- a finger held under a tall card that fills its column takes the other column's slot beside it,
// never the top of the tall one half a screen away. `keep` is the place the cards are making now, for the
// drag alone (the drop passes -1): it stays while it is within `margin` px as near as the nearest, so a
// finger resting on the line between two places does not swap the cards back and forth under it.
export function nearestSlot({heights, height, columns = 2, columnWidth, gap = 8, x, y, keep = -1, margin = 0}) {
	if (!Array.isArray(heights) || !integer(columns, 1) || columns > 8 || !finite(columnWidth, Number.MIN_VALUE) || !finite(gap) || !finite(height) || !Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('a place needs the section\'s heights, the column geometry and where the card is held');
	const tops = Array(columns).fill(0), pitch = columnWidth + gap, want = Math.max(0, Math.min(columns - 1, Math.floor((x + columnWidth / 2) / pitch)));
	let best = null, kept = null;
	for (let k = 0; ; k++) {
		let column = 0; for (let i = 1; i < columns; i++) if (tops[i] < tops[column]) column = i;
		const slot = {index: k, column, x: Math.round(column * pitch), y: Math.round(tops[column])};
		const dy = Math.abs(slot.y - y), d = column === want ? dy : Math.hypot(Math.abs(column - want) * pitch, dy);
		if (!best || d < best.d) best = {...slot, d};
		if (k === keep) kept = {...slot, d};
		if (k === heights.length) break;
		const h = heights[k]; if (!finite(h)) throw new TypeError('a place needs every card\'s height');
		tops[column] += h + gap;
	}
	const {index, column, x: sx, y: sy} = kept && kept.d <= best.d + margin ? kept : best;
	return {index, column, x: sx, y: sy};
}
