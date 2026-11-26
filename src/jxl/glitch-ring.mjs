// SPDX-License-Identifier: AGPL-3.0-only
const SVG = 'http://www.w3.org/2000/svg';
const GAP = 3 * Math.PI / 180;
const SLOP = 6, REACH = 14;

export function createRing(rings, {get, on}) {
	const root = document.createElementNS(SVG, 'svg'), label = document.createElement('div');
	root.setAttribute('class', 'rapier-jxl-glitch__ring'); root.setAttribute('role', 'slider'); root.setAttribute('tabindex', '0');
	root.setAttribute('aria-valuemin', '0'); root.setAttribute('aria-valuemax', '100');
	label.className = 'rapier-jxl-glitch__name'; label.hidden = true;
	const all = rings.flat(), parts = new Map();
	let chosen = all[0].id, size = {cx: 0, cy: 0, bands: [[0, 0], [0, 0]]}, gesture = null, hideTimer = 0, wheelTimer = 0;
	for (const [ring, list] of rings.entries()) for (const [i, segment] of list.entries()) {
		const fill = document.createElementNS(SVG, 'path'), edge = document.createElementNS(SVG, 'path');
		fill.setAttribute('class', 'rapier-jxl-glitch__fill'); edge.setAttribute('class', 'rapier-jxl-glitch__edge');
		root.append(fill, edge);
		parts.set(segment.id, {fill, edge, ring, i, count: list.length, segment});
	}
	const span = (i, n) => [-Math.PI / 2 + i * 2 * Math.PI / n + GAP / 2, -Math.PI / 2 + (i + 1) * 2 * Math.PI / n - GAP / 2];
	const point = (r, a) => `${(size.cx + r * Math.cos(a)).toFixed(2)} ${(size.cy + r * Math.sin(a)).toFixed(2)}`;
	const sector = (r0, r1, a0, a1) => {
		const large = a1 - a0 > Math.PI ? 1 : 0;
		return `M ${point(r1, a0)} A ${r1} ${r1} 0 ${large} 1 ${point(r1, a1)} L ${point(r0, a1)} A ${r0} ${r0} 0 ${large} 0 ${point(r0, a0)} Z`;
	};
	function draw() {
		for (const [id, p] of parts) {
			const [a0, a1] = span(p.i, p.count), [r0, r1] = size.bands[p.ring], value = get(id);
			p.edge.setAttribute('d', sector(r0, r1, a0, a1));
			p.fill.setAttribute('d', value > 0 ? sector(r0, r1, a0, a0 + (a1 - a0) * value) : '');
			p.edge.classList.toggle('rapier-jxl-glitch__edge--chosen', id === chosen);
		}
		const value = Math.round(get(chosen) * 100), name = parts.get(chosen).segment.name;
		root.setAttribute('aria-valuenow', String(value)); root.setAttribute('aria-valuetext', name + ' ' + value);
		root.setAttribute('aria-label', name);
	}
	function layout(width, height) {
		const side = Math.min(width, height), thick = Math.max(14, side * 0.05), outer = side * 0.42, inner = outer - thick - Math.max(8, side * 0.025);
		const square = Math.min(side, Math.ceil(2 * (outer + REACH)));
		size = {cx: square / 2, cy: square / 2, bands: [[outer - thick, outer], [inner - thick, inner]]};
		root.setAttribute('viewBox', `0 0 ${square} ${square}`);
		root.style.width = root.style.height = square + 'px';
		root.style.left = (width - square) / 2 + 'px'; root.style.top = (height - square) / 2 + 'px';
		draw();
	}
	function hit(x, y) {
		const dx = x - size.cx, dy = y - size.cy, d = Math.hypot(dx, dy);
		const ring = size.bands.findIndex(([r0, r1]) => d >= r0 - REACH && d <= r1 + REACH);
		if (ring < 0) return null;
		const list = rings[ring], turn = ((Math.atan2(dy, dx) + Math.PI / 2) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
		return list[Math.min(list.length - 1, Math.floor(turn / (2 * Math.PI / list.length)))].id;
	}
	const local = event => { const box = root.getBoundingClientRect(), vb = root.viewBox.baseVal; return [(event.clientX - box.left) * vb.width / box.width, (event.clientY - box.top) * vb.height / box.height]; };
	function show(held, linger = false) {
		clearTimeout(hideTimer);
		label.textContent = parts.get(chosen).segment.name; label.hidden = false;
		if (!held) hideTimer = setTimeout(() => { label.hidden = true; }, linger ? 900 : 0);
	}
	function set(value) {
		value = Math.max(0, Math.min(1, value));
		if (value !== get(chosen)) { on.change(chosen, value); draw(); }
	}
	function choose(id) { if (id && id !== chosen) { chosen = id; on.choose(id); draw(); } }
	root.addEventListener('pointerdown', event => {
		if (gesture || event.button > 0) return;
		event.preventDefault();
		root.focus({preventScroll: true});
		root.setPointerCapture(event.pointerId);
		const [x, y] = local(event);
		choose(hit(x, y));
		gesture = {pointer: event.pointerId, x, y, start: get(chosen), moving: false};
		show(true);
	});
	root.addEventListener('pointermove', event => {
		if (!gesture || event.pointerId !== gesture.pointer) return;
		const [x, y] = local(event), dy = y - gesture.y;
		if (!gesture.moving) {
			if (Math.abs(dy) < SLOP || Math.abs(dy) < Math.abs(x - gesture.x)) return;
			gesture.moving = true; gesture.y = y; gesture.start = get(chosen); on.start(); return;
		}
		const box = root.getBoundingClientRect(), vb = root.viewBox.baseVal.height, frame = root.parentElement?.getBoundingClientRect().height || box.height;
		set(gesture.start - dy / (Math.max(240, frame) * vb / box.height));
	});
	const end = event => {
		if (!gesture || event.pointerId !== gesture.pointer) return;
		const moved = gesture.moving;
		gesture = null;
		if (moved) on.end();
		show(false, true);
	};
	root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end);
	root.addEventListener('lostpointercapture', end);
	root.addEventListener('wheel', event => {
		const [x, y] = local(event), over = hit(x, y);
		if (!over) return;
		event.preventDefault();
		if (over !== chosen && wheelTimer) { clearTimeout(wheelTimer); wheelTimer = 0; on.end(); }
		choose(over);
		if (!wheelTimer) on.start(); else clearTimeout(wheelTimer);
		wheelTimer = setTimeout(() => { wheelTimer = 0; on.end(); show(false); }, 400);
		show(true);
		set(get(chosen) - event.deltaY * (event.deltaMode === 1 ? 0.02 : 0.0012));
	}, {passive: false});
	root.addEventListener('keydown', event => {
		const order = all.map(s => s.id), at = order.indexOf(chosen);
		if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') choose(order[(at + (event.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length]);
		else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
			on.start(); set(Math.round((get(chosen) + (event.key === 'ArrowUp' ? 0.05 : -0.05)) * 20) / 20); on.end();
		} else return;
		event.preventDefault(); show(false, true);
	});
	return {root, label, layout, draw, get chosen() { return chosen; }, choose, hit};
}
