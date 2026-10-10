// SPDX-License-Identifier: AGPL-3.0-only
// Spectral refraction of the original artwork. The SVG owns both source and optics.
const DEFAULTS = Object.freeze({ strength: 1, amount: 3000, blur: 20, bump: 4, angle: 0,
	amountX: 1, amountY: 1, red: .5, blue: 1, samples: 8, edge: 'reflect' });
const RANGES = Object.freeze({ strength: [0, 1], amount: [-10000, 10000], blur: [0, 80],
	bump: [0, 20], angle: [-180, 180], amountX: [0, 4], amountY: [0, 4], red: [-2, 2],
	blue: [-2, 2], samples: [3, 32] });
const KEYS = new Set(['type', 'version', 'preset', ...Object.keys(DEFAULTS)]);

export const REFRACTION_PRESETS = Object.freeze([
	['glass', 'Glass', {}],
	['prism', 'Prism', { amount: 1800, blur: 12, red: -.5 }],
	['ripple', 'Ripple', { amount: 1800, blur: 6, bump: 6, angle: 35 }],
	['soft-glass', 'Soft glass', { amount: 1800, blur: 32, bump: 3 }],
].map(([id, name, values]) => Object.freeze({ id, name, values: Object.freeze(values) })));

export function refractionPreset(id = 'glass') {
	const preset = REFRACTION_PRESETS.find(row => row.id === id);
	return preset ? { type: 'refraction', version: 1, preset: id, ...DEFAULTS, ...preset.values } : null;
}

export function fillRefraction(input) {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
	const start = refractionPreset(input.preset ?? 'glass');
	return start ? { ...start, ...input } : input;
}

export function admitRefraction(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.type !== 'refraction' || raw.version !== 1 ||
		Object.keys(raw).some(key => !KEYS.has(key)) || !['reflect', 'tile', 'transparent'].includes(raw.edge)) return null;
	const out = refractionPreset(raw.preset);
	if (!out) return null;
	for (const [key, [min, max]] of Object.entries(RANGES)) {
		const value = raw[key];
		if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || key === 'samples' && !Number.isInteger(value)) return null;
		out[key] = value;
	}
	out.edge = raw.edge;
	return out;
}

// Refraction samples beyond the edge, but output stays in the original silhouette.
export function refractionBounds(_effect, box) { return { ...box }; }

const fmt = n => String(Math.round(n * 1e7) / 1e7);
const region = b => ' x="' + fmt(b.minX) + '" y="' + fmt(b.minY) + '" width="' + fmt(b.maxX - b.minX) + '" height="' + fmt(b.maxY - b.minY) + '"';

export function refractionMarkup(effect, body, box, key, scene = false) {
	const e = admitRefraction(effect);
	if (!e) throw new TypeError('Invalid refracted light effect');
	if (!e.strength || !e.amount || !e.bump || !e.amountX && !e.amountY || !e.red && !e.blue) return body;
	const id = 'rapier-refract-' + Array.from(String(key), c => c.codePointAt(0).toString(16)).join('-');
	const w = Math.max(.001, box.maxX - box.minX), h = Math.max(.001, box.maxY - box.minY);
	const step = Math.max(1, e.blur), floor = 1.5 / 255, beta = e.bump / (2 * step);
	if (!beta) return body;
	// This shared Prewitt stencil reaches (1, 1/3), not two independent unit slopes.
	// Allow three channel steps per component for the two means and signed difference.
	const slopeLimit = Math.sqrt(10) / 3 + 3 * Math.SQRT2 / 255;
	const peak = beta * (slopeLimit - floor) / (1 + beta * (slopeLimit - floor));
	const axis = Math.max(e.amountX, e.amountY);
	const reach = Math.abs(e.amount) * Math.max(Math.abs(e.red), Math.abs(e.blue)) * peak * axis;
	// Input tiles and lens taps need room; the clip owns the output, not this working region.
	const pad = Math.ceil(reach + e.blur * 3 + step + 2);
	const work = { minX: box.minX - pad, minY: box.minY - pad, maxX: box.maxX + pad, maxY: box.maxY + pad };
	const workWidth = work.maxX - work.minX, workHeight = work.maxY - work.minY;
	// A hard lens at maximum bend can otherwise ask SVG for a 146,000-pixel buffer.
	// Refuse the new settings through the drawing command's rollback before allocating it.
	if (workWidth > 16384 || workHeight > 16384 || workWidth * workHeight > 64 * 1024 * 1024)
		throw Object.assign(new Error('Use less refraction or a softer lens for this drawing.'), { code: 'drawing_work_limit' });
	const area = region(work), clip = region(box);
	let filter = '';
	const arithmetic = (a, b, k1, k2, k3, k4, out) => {
		filter += '<feComposite in="' + a + '" in2="' + b + '" operator="arithmetic" k1="' + fmt(k1) + '" k2="' + fmt(k2) + '" k3="' + fmt(k3) + '" k4="' + fmt(k4) + '" result="' + out + '"' + area + '/>';
		return out;
	};
	const matrix = (input, values, out) => {
		filter += '<feColorMatrix in="' + input + '" type="matrix" values="' + values.map(fmt).join(' ') + '" result="' + out + '"' + area + '/>';
		return out;
	};
	const transfer = (input, funcs, out) => {
		filter += '<feComponentTransfer in="' + input + '" result="' + out + '"' + area + '>' + funcs + '</feComponentTransfer>';
		return out;
	};
	// Scalar carriers are white with alpha equal to their value. Premultiplied arithmetic
	// can then subtract and bias a field without clipping a signed RGB component.
	matrix('SourceGraphic', [0,0,0,0,1, 0,0,0,0,1, 0,0,0,0,1, .2126,.7152,.0722,0,0], 'luminance');
	// The lens has a transparent border. Wrapped source pixels belong only to the
	// spectral sampling margin, so exclude them before blurring the height field.
	filter += '<feComposite in="luminance" in2="SourceGraphic" operator="in" result="height"' + clip + '/>';
	filter += '<feGaussianBlur in="height" stdDeviation="' + fmt(e.blur) + '" result="lens"' + area + '/>';
	const taps = new Map();
	const tap = (x, y) => {
		const name = 'tap' + (x + 1) + (y + 1);
		if (!taps.has(name)) {
			filter += '<feOffset in="lens" dx="' + fmt(-x * step) + '" dy="' + fmt(-y * step) + '" result="' + name + '"' + area + '/>';
			taps.set(name, name);
		}
		return name;
	};
	const mean = (points, name) => {
		const terms = points.map(([x,y]) => tap(x,y));
		arithmetic(terms[0], terms[1], 0, 1/3, 1/3, 0, name + 'pair');
		return arithmetic(name + 'pair', terms[2], 0, 1, 1/3, 0, name);
	};
	const east = mean([[1,-1],[1,0],[1,1]], 'east'), west = mean([[-1,-1],[-1,0],[-1,1]], 'west');
	const south = mean([[-1,1],[0,1],[1,1]], 'south'), north = mean([[-1,-1],[0,-1],[1,-1]], 'north');
	arithmetic(east, west, 0, .5, -.5, .5, 'dx');
	arithmetic(south, north, 0, .5, -.5, .5, 'dy');
	// Squaring a small slope loses it in 8-bit filter buffers. A circumscribed 16-sided
	// norm keeps first-order precision and bounds the radial error below two percent.
	const normScale = Math.SQRT1_2 / Math.cos(Math.PI / 16);
	const absolute = '<feFuncA type="table" tableValues="' + fmt(normScale) + ' 0 ' + fmt(normScale) + '"/>';
	transfer('dx', absolute, 'absX'); transfer('dy', absolute, 'absY');
	const maximum = (a, b, name) => {
		arithmetic(a, b, 0, 1, -1, 0, name + 'positive');
		return arithmetic(name + 'positive', b, 0, 1, 1, 0, name);
	};
	maximum('absX', 'absY', 'axial');
	arithmetic('absX', 'absY', 0, Math.SQRT1_2, Math.SQRT1_2, 0, 'diagonal');
	const bisector = 1 / (2 * Math.cos(Math.PI / 8));
	arithmetic('axial', 'diagonal', 0, bisector, bisector, 0, 'between');
	maximum('axial', 'diagonal', 'cardinal');
	maximum('cardinal', 'between', 'magnitude');
	// The lens slope is measured in document units, including when the browser rasterizes
	// a smaller preview. The table is the radial noise floor and bounded response, not grain.
	const gain = Array.from({ length: 513 }, (_, i) => {
		const magnitude = i / 512, live = Math.max(0, magnitude - floor / Math.SQRT2);
		return fmt(magnitude ? live / (magnitude * (1 + beta * Math.SQRT2 * live)) : 0);
	}).join(' ');
	transfer('magnitude', '<feFuncA type="table" tableValues="' + gain + '"/>', 'gain');
	const scale = (1 + beta * (slopeLimit - floor)) / (slopeLimit - floor);
	arithmetic('dx', 'gain', -scale, 0, scale * .5, .5, 'bendX');
	arithmetic('dy', 'gain', -scale, 0, scale * .5, .5, 'bendY');
	const theta = e.angle * Math.PI / 180, cos = Math.cos(theta), sin = Math.sin(theta);
	const xScale = e.amountX / axis, yScale = e.amountY / axis;
	arithmetic('bendX', 'bendY', 0, cos * xScale, -sin * xScale, .5 * (1 - (cos - sin) * xScale), 'turnedX');
	arithmetic('bendX', 'bendY', 0, sin * yScale, cos * yScale, .5 * (1 - (sin + cos) * yScale), 'turnedY');
	matrix('turnedX', [0,0,0,e.amountX ? 1 : 0,0, 0,0,0,0,0, 0,0,0,0,0, 0,0,0,0,1], 'mapX');
	matrix('turnedY', [0,0,0,0,0, 0,0,0,e.amountY ? 1 : 0,0, 0,0,0,0,0, 0,0,0,0,1], 'mapY');
	arithmetic('mapX', 'mapY', 0, 1, 1, 0, 'map');
	const spectrum = Array.from({ length: e.samples }, (_, i) => {
		const t = i / (e.samples - 1);
		return { t, weights: [Math.max(0, 1 - 2*t), 1 - Math.abs(2*t - 1), Math.max(0, 2*t - 1)] };
	});
	const sums = [0,1,2].map(c => spectrum.reduce((sum, point) => sum + point.weights[c], 0));
	const carriers = [[],[],[]];
	for (const [i, point] of spectrum.entries()) {
		const amount = 2 * e.amount * (e.red + (e.blue - e.red) * point.t) * peak * axis;
		let source = 'SourceGraphic';
		if (!e.amountX || !e.amountY) {
			// Zero is representable in every map buffer; .5 is not. Cancel its known half-scale
			// sample offset in the source, leaving the map at the original output coordinates.
			source = 'source' + i;
			filter += '<feOffset in="SourceGraphic" dx="' + fmt(e.amountX ? 0 : -amount / 2) + '" dy="' + fmt(e.amountY ? 0 : -amount / 2) + '" result="' + source + '"' + area + '/>';
		}
		filter += '<feDisplacementMap in="' + source + '" in2="map" scale="' + fmt(amount) + '" xChannelSelector="R" yChannelSelector="G" result="ray' + i + '"' + area + '/>';
		for (let c = 0; c < 3; c++) if (point.weights[c]) {
			const values = Array(20).fill(0), weight = point.weights[c] / sums[c];
			values[c*5+c] = 1; values[18] = weight;
			carriers[c].push(matrix('ray' + i, values, 'ray' + i + 'c' + c));
		}
	}
	const colours = [], coverage = [];
	for (let c = 0; c < 3; c++) {
		let sum = carriers[c][0];
		for (let i = 1; i < carriers[c].length; i++) sum = arithmetic(sum, carriers[c][i], 0, 1, 1, 0, 'sum' + c + '-' + i);
		// Each channel carries its own weighted alpha denominator. Setting alpha to one
		// unpremultiplies that carrier before the three colours share their mean coverage.
		colours.push(transfer(sum, '<feFuncA type="linear" slope="0" intercept="1"/>', 'colour' + c));
		coverage.push(transfer(sum, '<feFuncA type="linear" slope=".3333333333"/>', 'coverage' + c));
	}
	arithmetic(colours[0], colours[1], 0, 1, 1, 0, 'rg');
	arithmetic('rg', colours[2], 0, 1, 1, 0, 'rgb');
	arithmetic(coverage[0], coverage[1], 0, 1, 1, 0, 'alphaRG');
	arithmetic('alphaRG', coverage[2], 0, 1, 1, 0, 'alphaRGB');
	filter += '<feComposite in="rgb" in2="alphaRGB" operator="in" result="colour"' + area + '/>';
	// Flat lens regions keep their exact source, avoiding a neutral-map rounding shift.
	transfer('gain', '<feFuncA type="linear" slope="255"/>', 'warpMask');
	filter += '<feComposite in="colour" in2="warpMask" operator="in" result="bent"' + area + '/>';
	filter += '<feComposite in="SourceGraphic" in2="warpMask" operator="out" result="flat"' + area + '/>';
	arithmetic('bent', 'flat', 0, 1, 1, 0, 'combined');
	transfer('SourceAlpha', '<feFuncA type="linear" slope="2048"/>', 'silhouette');
	filter += '<feComposite in="combined" in2="silhouette" operator="in" result="refracted"' + area + '/>';
	if (e.strength < 1) arithmetic('refracted', 'SourceGraphic', 0, e.strength, 1 - e.strength, 0, 'mixed');
	const filterDef = '<filter id="' + id + '" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse"' + area + ' color-interpolation-filters="sRGB">' + filter + '</filter>';
	const sceneMark = scene ? ' data-rapier-effect-scene=""' : '';
	const wrapper = '<g xmlns:xlink="http://www.w3.org/1999/xlink" data-rapier-effect="refraction" data-effect-filter="' + id + '" clip-path="url(#' + id + '-clip)">';
	const clipDef = '<clipPath id="' + id + '-clip" clipPathUnits="userSpaceOnUse"><rect' + clip + '/></clipPath>';
	if (e.edge === 'transparent') return wrapper + '<defs>' + filterDef + clipDef + '</defs><g' + sceneMark + ' filter="url(#' + id + ')">' + body + '</g></g>';
	// Render the original directly: a live paint canvas cannot pass through a <use> shadow
	// tree. Reflected instances supply only the outside sampling margin. Saved source bytes
	// still occur once, and the finished paint image also participates in that margin.
	const mirror = e.edge === 'reflect', tileW = w * (mirror ? 2 : 1), tileH = h * (mirror ? 2 : 1);
	let tiles = '<use xlink:href="#' + id + '-source" transform="translate(' + fmt(-box.minX) + ' ' + fmt(-box.minY) + ')"/>';
	if (mirror) {
		tiles += '<use xlink:href="#' + id + '-source" transform="matrix(-1 0 0 1 ' + fmt(2*w + box.minX) + ' ' + fmt(-box.minY) + ')"/>';
		tiles += '<use xlink:href="#' + id + '-source" transform="matrix(1 0 0 -1 ' + fmt(-box.minX) + ' ' + fmt(2*h + box.minY) + ')"/>';
		tiles += '<use xlink:href="#' + id + '-source" transform="matrix(-1 0 0 -1 ' + fmt(2*w + box.minX) + ' ' + fmt(2*h + box.minY) + ')"/>';
	}
	const pattern = '<pattern id="' + id + '-tile" x="' + fmt(box.minX) + '" y="' + fmt(box.minY) + '" width="' + fmt(tileW) + '" height="' + fmt(tileH) + '" patternUnits="userSpaceOnUse" viewBox="0 0 ' + fmt(tileW) + ' ' + fmt(tileH) + '">' + tiles + '</pattern>';
	const ring = [work, box].map(b => 'M' + fmt(b.minX) + ' ' + fmt(b.minY) + 'H' + fmt(b.maxX) + 'V' + fmt(b.maxY) + 'H' + fmt(b.minX) + 'Z').join('');
	return wrapper + '<defs>' + pattern + filterDef + clipDef + '</defs><g filter="url(#' + id + ')"><g id="' + id + '-source"' + sceneMark + '>' + body + '</g><path d="' + ring + '" fill-rule="evenodd" fill="url(#' + id + '-tile)"/></g></g>';
}
