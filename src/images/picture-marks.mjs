// SPDX-License-Identifier: AGPL-3.0-only
// Normalized picture boxes share one placement and clipping owner across Find surfaces.
export function geometry(quad, image) {
	if (!image) return null;
	const box = image.getBoundingClientRect();
	if (!(box.width > 0 && box.height > 0)) return null;
	const corners = image.getBoxQuads?.({box: 'content'})?.[0];
	const points = quad.map(([u, v]) => {
		const x = Math.max(0, Math.min(1, u)), y = Math.max(0, Math.min(1, v));
		return corners ? [corners.p1.x + (corners.p2.x - corners.p1.x) * x + (corners.p4.x - corners.p1.x) * y,
			corners.p1.y + (corners.p2.y - corners.p1.y) * x + (corners.p4.y - corners.p1.y) * y] :
			[box.left + x * box.width, box.top + y * box.height];
	});
	const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
	const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
	return {left, right, top, bottom, width: right - left, height: bottom - top, points};
}

export function clippingAncestors(image, host) {
	const rows = [];
	for (let node = image.parentElement; node; node = node.parentElement) {
		const style = getComputedStyle(node), x = style.overflowX !== 'visible', y = style.overflowY !== 'visible';
		if ((x || y) && !/^(?:inline|contents)$/.test(style.display)) {
			const box = node.getBoundingClientRect();
			const scaleX = node.offsetWidth ? box.width / node.offsetWidth : 1;
			const scaleY = node.offsetHeight ? box.height / node.offsetHeight : 1;
			const left = box.left + node.clientLeft * scaleX, top = box.top + node.clientTop * scaleY;
			rows.push({node, x, y, left, top, right: left + node.clientWidth * scaleX,
				bottom: top + node.clientHeight * scaleY, scaleX,
				scroll: /^(?:auto|scroll|hidden)$/.test(style.overflowX) && node.scrollWidth > node.clientWidth});
		}
		if (node === host) break;
	}
	return rows;
}

export function reveal(quad, image, host) {
	if (!image) return null;
	// Only explicit Find navigation moves a picture's scrolling paragraph.
	for (const row of clippingAncestors(image, host)) {
		if (!row.scroll || !(row.scaleX > 0)) continue;
		const box = geometry(quad, image);
		if (!box) return null;
		const from = box.left - row.left, to = box.right - row.right;
		if (from < 0 && to > 0) continue;
		const wider = box.width > row.right - row.left;
		const delta = from < 0 ? (wider ? to : from) : to > 0 ? (wider ? from : to) : 0;
		if (delta) row.node.scrollLeft += delta / row.scaleX;
	}
	return geometry(quad, image);
}

export function paint(root, quad, image, selected, host, clip, originX = 0, clips) {
	const box = geometry(quad, image);
	if (!box) return;
	let visible = clips?.get(image);
	if (!visible) {
		visible = {...clip};
		for (const row of clippingAncestors(image, host)) {
			if (row.x) { visible.left = Math.max(visible.left, row.left); visible.right = Math.min(visible.right, row.right); }
			if (row.y) { visible.top = Math.max(visible.top, row.top); visible.bottom = Math.min(visible.bottom, row.bottom); }
		}
		clips?.set(image, visible);
	}
	const left = Math.max(box.left, visible.left), right = Math.min(box.right, visible.right);
	const top = Math.max(box.top, visible.top), bottom = Math.min(box.bottom, visible.bottom);
	if (right <= left || bottom <= top) return;
	const mark = document.createElement('span');
	mark.className = 'rapier-find-current-mark ' + (selected ? 'rapier-find-picture-current-mark' : 'rapier-find-picture-mark');
	mark.style.left = left - originX + 'px'; mark.style.top = top + 'px';
	mark.style.width = right - left + 'px'; mark.style.height = bottom - top + 'px';
	mark.style.clipPath = 'polygon(' + box.points.map(([x, y]) =>
		(100 * (x - left) / (right - left)) + '% ' + (100 * (y - top) / (bottom - top)) + '%').join(',') + ')';
	root.appendChild(mark);
}
