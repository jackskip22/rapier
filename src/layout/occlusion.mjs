export const SURFACE_ROLES = Object.freeze(['bar', 'storey', 'transient', 'sheet', 'overlay']);

const finite = value => typeof value === 'number' && Number.isFinite(value);
const positiveRect = rect => rect.right > rect.left && rect.bottom > rect.top;
export const copyRect = rect => ({left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom});
export const validRect = rect => rect && ['left', 'top', 'right', 'bottom'].every(key => finite(rect[key])) && rect.right >= rect.left && rect.bottom >= rect.top;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

function declarations(surfaces) {
	if (!Array.isArray(surfaces)) throw new TypeError('surfaces must be an array');
	const byId = new Map();
	for (const surface of surfaces) {
		if (!surface || typeof surface.id !== 'string' || !surface.id || byId.has(surface.id)) throw new TypeError('surface ids must be unique nonempty strings');
		if (!SURFACE_ROLES.includes(surface.role) || typeof surface.interactive !== 'boolean' || !validRect(surface.rect)) throw new TypeError('invalid declaration: ' + surface.id);
		if (surface.role !== 'storey' && surface.on !== undefined) throw new TypeError('only a storey declares its support: ' + surface.id);
		byId.set(surface.id, surface);
	}
	for (const surface of surfaces) {
		const seen = new Set([surface.id]);
		let node = surface;
		while (node.role === 'storey') {
			const parent = byId.get(node.on);
			if (!parent || !['bar', 'storey'].includes(parent.role)) throw new TypeError('missing bar/storey support: ' + node.id);
			if (seen.has(parent.id)) throw new TypeError('cyclic storeys: ' + surface.id);
			seen.add(parent.id);
			node = parent;
		}
	}
	return byId;
}

export function surfaceOrder(surfaces, first, second) {
	const byId = declarations(surfaces);
	if (!byId.has(first) || !byId.has(second)) throw new TypeError('unknown surface');
	if (first === second) return 'same';
	const above = (a, b) => {
		let node = byId.get(a);
		while (node.role === 'storey') {
			if (node.on === b) return true;
			node = byId.get(node.on);
		}
		return false;
	};
	return above(first, second) ? 'above' : above(second, first) ? 'below' : 'incomparable';
}

function nearestX(obstacles, y, width, height, low, high, preferred) {
	const intervals = obstacles.filter(rect => y < rect.bottom && y + height > rect.top)
		.map(rect => [rect.left - width, rect.right]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const merged = [];
	for (const interval of intervals) {
		const last = merged.at(-1);
		// Touching edges leave one legal position; only open interiors merge.
		if (last && interval[0] < last[1]) last[1] = Math.max(last[1], interval[1]);
		else merged.push(interval.slice());
	}
	const x = clamp(preferred, low, high);
	const blocked = merged.find(([left, right]) => x > left && x < right);
	if (!blocked) return x;
	const edges = blocked.filter(edge => edge >= low && edge <= high);
	return edges.length ? edges.sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred) || a - b)[0] : null;
}

export function placeTransient(input) {
	try {
		if (!input || !validRect(input.viewport) || !positiveRect(input.viewport)) throw new TypeError('invalid viewport');
		const viewport = copyRect(input.viewport);
		const natural = input.transient?.rect;
		if (!validRect(natural) || !positiveRect(natural)) throw new TypeError('invalid transient rect');
		declarations(input.surfaces);
		const obstacles = input.surfaces.filter(surface => surface.interactive && positiveRect(surface.rect) && overlaps(viewport, surface.rect))
			.map(surface => ({id: surface.id, rect: {
				left: Math.max(viewport.left, surface.rect.left), top: Math.max(viewport.top, surface.rect.top),
				right: Math.min(viewport.right, surface.rect.right), bottom: Math.min(viewport.bottom, surface.rect.bottom),
			}}));
		const blocking = obstacles.map(surface => surface.id).sort();
		const width = natural.right - natural.left, height = natural.bottom - natural.top;
		const maxX = viewport.right - width, maxY = viewport.bottom - height;
		if (maxX < viewport.left || maxY < viewport.top) return {status: 'wait', reason: 'too-large', blocking};
		const rects = obstacles.map(surface => surface.rect);
		const ys = new Set([clamp(natural.top, viewport.top, maxY), viewport.top, maxY]);
		for (const rect of rects) {
			for (const y of [rect.top - height, rect.bottom]) if (y >= viewport.top && y <= maxY) ys.add(y);
		}
		let best = null;
		for (const y of ys) {
			const x = nearestX(rects, y, width, height, viewport.left, maxX, natural.left);
			if (x === null) continue;
			const cost = (x - natural.left) ** 2 + (y - natural.top) ** 2;
			if (!best || cost < best.cost || cost === best.cost && (y > best.y || y === best.y && x < best.x)) best = {x, y, cost};
		}
		if (!best) return {status: 'wait', reason: 'no-room', blocking};
		return {status: 'placed', rect: {left: best.x, top: best.y, right: best.x + width, bottom: best.y + height},
			lift: viewport.bottom - best.y - height, displacement: {x: best.x - natural.left, y: best.y - natural.top}, blocking};
	} catch (error) {
		return {status: 'wait', reason: 'invalid-input', detail: String(error.message), blocking: []};
	}
}
