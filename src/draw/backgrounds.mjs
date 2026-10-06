// Draw's canvas backgrounds: a solid colour or a gradient that fills the canvas exactly, whatever size the
// canvas becomes. Pure data in, SVG out, no DOM. Every position is 0..1 of the rectangle it fills, so a resize
// or the adaptive canvas growing re-renders the same background to the new shape.
//
// Gradients blend in OKLab, not sRGB, so blue to yellow passes through green rather than grey; the SVG carries
// enough native stops that the browser's own sRGB interpolation between them stays within one 8-bit step of the
// OKLab curve. Free-form is soft radial glows laid over the average colour: browsers do not render SVG 2's
// meshgradient, and a glow per point is what the well-loved free-form makers draw.

export const BACKGROUND_KINDS = ['solid', 'linear', 'radial', 'freeform', 'wave', 'rails', 'bloom', 'ribbon', 'echo', 'rays', 'glyphs', 'grid', 'flow', 'topo', 'aurora', 'texture'];
export const TEXTURES = ['weave', 'linen', 'dots', 'lines', 'grid', 'grain'];
export const GLYPH_STYLES = ['marks', 'halftone', 'blocks', 'rain', 'circuit'];
export const RAYS_FORMS = ['fan', 'hourglass', 'perspective'];
export const RAILS_FORMS = ['lines', 'fan', 'spiral', 'burst'];
export const BACKGROUND_EASINGS = ['linear', 'in', 'out', 'smooth'];
const MAX_STOPS = 8, MAX_POINTS = 8, HEX = /^#[0-9a-f]{6}$/;

const unit = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
const span = n => typeof n === 'number' && Number.isFinite(n) && n >= -1 && n <= 2;
const hex = c => typeof c === 'string' && HEX.test(c.toLowerCase()) ? c.toLowerCase() : null;
const round = (n, d = 4) => { const p = 10 ** d, r = Math.round(n * p) / p; return Object.is(r, -0) ? 0 : r; };
const fmt = n => String(round(n));
// Geometry of the drawn kinds needs no more than a tenth of a canvas unit: invisible at any zoom, a third of the bytes.
const fmg = n => String(round(n, 1));

// ---- colour: sRGB <-> OKLab (Björn Ottosson's published matrices) ----
const toLinear = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toGamma = c => c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
export function hexToOklab(h) {
	const n = parseInt(h.slice(1), 16), r = toLinear((n >> 16 & 255) / 255), g = toLinear((n >> 8 & 255) / 255), b = toLinear((n & 255) / 255);
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
export function oklabToRgb([L, A, B]) {
	const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
	const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
	return lin.map(c => Math.round(Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, c))))) * 255));
}
const rgbHex = rgb => '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const ease = (kind, t) => kind === 'in' ? t * t : kind === 'out' ? 1 - (1 - t) * (1 - t) : kind === 'smooth' ? t * t * (3 - 2 * t) : t;

// The swap rule (brief section 4): a chosen colour keeps its hue and turns its lightness over, so a pale sky
// becomes a deep one of the same hues on black paper, never a photographic negative.
export function invertColour(h) {
	const [L, A, B] = hexToOklab(h);
	// Light paper's pale tones become deep ones, not black: lightness lands in 0.22..0.72 and chroma rises as
	// lightness falls, so a pastel sky reads as a rich night sky of the same hue.
	const L2 = 0.22 + 0.5 * (1 - L), boost = 1 + 0.9 * Math.max(0, L - 0.5);
	return rgbHex(oklabToRgb([L2, A * boost, B * boost]));
}

// ---- admission ----
function admitStops(stops) {
	if (!Array.isArray(stops) || stops.length < 2 || stops.length > MAX_STOPS) return null;
	const out = [];
	for (const s of stops) {
		const color = hex(s?.color);
		if (!color || !unit(s.at)) return null;
		const stop = {at: round(s.at), color};
		if (s.ease !== undefined) { if (!BACKGROUND_EASINGS.includes(s.ease)) return null; if (s.ease !== 'linear') stop.ease = s.ease; }
		out.push(stop);
	}
	out.sort((a, b) => a.at - b.at);
	return out;
}
// Untrusted input in, the admitted background out, or null with nothing kept. Absent (undefined) means none.
export function normalizeBackground(input) {
	if (!input || typeof input !== 'object' || !BACKGROUND_KINDS.includes(input.kind)) return null;
	if (input.kind === 'solid') { const color = hex(input.color); return color ? {kind: 'solid', color} : null; }
	if (input.kind === 'linear') {
		const stops = admitStops(input.stops);
		if (!stops || ![input.x1, input.y1, input.x2, input.y2].every(span)) return null;
		if (input.x1 === input.x2 && input.y1 === input.y2) return null;
		return {kind: 'linear', x1: round(input.x1), y1: round(input.y1), x2: round(input.x2), y2: round(input.y2), stops};
	}
	if (input.kind === 'wave') {
		const stops = admitStops(input.stops);
		if (!stops || ![input.x1, input.y1, input.x2, input.y2].every(span) || (input.x1 === input.x2 && input.y1 === input.y2)) return null;
		if (!unit(input.flow) || !unit(input.size) || !Number.isInteger(input.seed) || input.seed < 0 || input.seed > 9999) return null;
		return {kind: 'wave', x1: round(input.x1), y1: round(input.y1), x2: round(input.x2), y2: round(input.y2), flow: round(input.flow), size: round(input.size), seed: input.seed, stops};
	}
	if (input.kind === 'rails') {
		const stops = admitStops(input.stops);
		if (!stops || !RAILS_FORMS.includes(input.form) || !Number.isInteger(input.count) || input.count < 4 || input.count > 96) return null;
		if (!unit(input.glow) || !unit(input.bend) || !unit(input.cx) || !unit(input.cy)) return null;
		return {kind: 'rails', form: input.form, count: input.count, glow: round(input.glow), bend: round(input.bend), cx: round(input.cx), cy: round(input.cy), stops};
	}
	if (input.kind === 'bloom') {
		const stops = admitStops(input.stops);
		if (!stops || !Number.isInteger(input.petals) || input.petals < 3 || input.petals > 16 || !Number.isInteger(input.layers) || input.layers < 2 || input.layers > 12) return null;
		if (![input.cx, input.cy, input.size, input.twist, input.glow].every(unit)) return null;
		return {kind: 'bloom', petals: input.petals, layers: input.layers, cx: round(input.cx), cy: round(input.cy), size: round(input.size), twist: round(input.twist), glow: round(input.glow), stops};
	}
	if (input.kind === 'ribbon') {
		const stops = admitStops(input.stops);
		if (!stops || !Array.isArray(input.points) || input.points.length < 2 || input.points.length > 6) return null;
		const points = [];
		for (const p of input.points) { if (!span(p?.x) || !span(p?.y)) return null; points.push({x: round(p.x), y: round(p.y)}); }
		if (!unit(input.width) || !unit(input.glow) || !Number.isInteger(input.bands) || input.bands < 2 || input.bands > 24) return null;
		return {kind: 'ribbon', points, width: round(input.width), bands: input.bands, glow: round(input.glow), stops};
	}
	if (input.kind === 'rays') {
		const stops = admitStops(input.stops);
		if (!stops || !RAYS_FORMS.includes(input.form) || !Number.isInteger(input.count) || input.count < 3 || input.count > 64) return null;
		if (![input.cx, input.cy, input.spread, input.curve].every(unit)) return null;
		const glow = input.glow === undefined ? 0.5 : input.glow;
		if (!unit(glow)) return null;
		return {kind: 'rays', glow: round(glow), form: input.form, count: input.count, cx: round(input.cx), cy: round(input.cy), spread: round(input.spread), curve: round(input.curve), stops};
	}
	if (input.kind === 'glyphs') {
		const stops = admitStops(input.stops);
		if (!stops || !Number.isInteger(input.cols) || input.cols < 6 || input.cols > 64 || !Number.isInteger(input.seed) || input.seed < 0 || input.seed > 9999) return null;
		if (![input.x1, input.y1, input.x2, input.y2].every(span) || ![input.density, input.wobble].every(unit)) return null;
		const style = input.style === undefined ? 'marks' : input.style, glow = input.glow === undefined ? 0.7 : input.glow;
		if (!GLYPH_STYLES.includes(style) || !unit(glow)) return null;
		return {kind: 'glyphs', style, glow: round(glow), cols: input.cols, seed: input.seed, x1: round(input.x1), y1: round(input.y1), x2: round(input.x2), y2: round(input.y2), density: round(input.density), wobble: round(input.wobble), stops};
	}
	if (input.kind === 'grid') {
		const stops = admitStops(input.stops);
		if (!stops || !Number.isInteger(input.lines) || input.lines < 6 || input.lines > 48) return null;
		if (![input.horizon, input.sun, input.glow, input.tilt].every(unit)) return null;
		return {kind: 'grid', lines: input.lines, horizon: round(input.horizon), sun: round(input.sun), glow: round(input.glow), tilt: round(input.tilt), stops};
	}
	if (input.kind === 'flow' || input.kind === 'topo') {
		const stops = admitStops(input.stops);
		if (!stops || !Number.isInteger(input.seed) || input.seed < 0 || input.seed > 9999 || !Number.isInteger(input.lines) || input.lines < 8 || input.lines > 400) return null;
		if (![input.scale, input.swirl, input.weight, input.glow].every(unit)) return null;
		return {kind: input.kind, seed: input.seed, lines: input.lines, scale: round(input.scale), swirl: round(input.swirl), weight: round(input.weight), glow: round(input.glow), stops};
	}
	if (input.kind === 'texture') {
		// Textures: a seamless tile in the paper's opposite ink, or a chosen colour.
		if (!TEXTURES.includes(input.texture) || !unit(input.strength) || !(typeof input.scale === 'number' && input.scale >= 1 / 512 && input.scale <= 1)) return null;
		if (!Number.isInteger(input.seed) || input.seed < 0 || input.seed > 9999) return null;
		const color = input.color === undefined ? null : hex(input.color);
		if (input.color !== undefined && !color) return null;
		const out = {kind: 'texture', texture: input.texture, scale: round(input.scale, 5), strength: round(input.strength), seed: input.seed};
		if (color) out.color = color;
		return out;
	}
	if (input.kind === 'aurora') {
		const stops = admitStops(input.stops);
		if (!stops || !Number.isInteger(input.seed) || input.seed < 0 || input.seed > 9999 || !Number.isInteger(input.curtains) || input.curtains < 1 || input.curtains > 6) return null;
		if (![input.height, input.sway, input.rays, input.stars, input.glow].every(unit)) return null;
		return {kind: 'aurora', seed: input.seed, curtains: input.curtains, height: round(input.height), sway: round(input.sway), rays: round(input.rays), stars: round(input.stars), glow: round(input.glow), stops};
	}
	if (input.kind === 'echo') {
		const stops = admitStops(input.stops);
		if (!stops || !Number.isInteger(input.count) || input.count < 2 || input.count > 64) return null;
		if (![input.x1, input.y1, input.x2, input.y2].every(span) || ![input.size, input.round, input.turn].every(unit)) return null;
		return {kind: 'echo', x1: round(input.x1), y1: round(input.y1), x2: round(input.x2), y2: round(input.y2), count: input.count, size: round(input.size), round: round(input.round), turn: round(input.turn), stops};
	}
	if (input.kind === 'radial') {
		const stops = admitStops(input.stops);
		if (!stops || !span(input.cx) || !span(input.cy) || !(typeof input.r === 'number' && input.r > 0 && input.r <= 3)) return null;
		return {kind: 'radial', cx: round(input.cx), cy: round(input.cy), r: round(input.r), stops};
	}
	const points = input.points;
	if (!Array.isArray(points) || points.length < 1 || points.length > MAX_POINTS) return null;
	const out = [];
	for (const p of points) {
		const color = hex(p?.color);
		if (!color || !unit(p.x) || !unit(p.y) || !(typeof p.spread === 'number' && p.spread >= 0.05 && p.spread <= 1.5)) return null;
		out.push({x: round(p.x), y: round(p.y), color, spread: round(p.spread)});
	}
	const base = input.base === undefined ? null : hex(input.base);
	if (input.base !== undefined && !base) return null;
	return base ? {kind: 'freeform', base, points: out} : {kind: 'freeform', points: out};
}

// ---- rendering ----
// Native stops sampling the OKLab curve between two authored stops: dense enough that sRGB interpolation between
// neighbours stays within one 8-bit step of the curve (the row's bound checks it), sparse where the colours agree.
function curveStops(stops) {
	const out = [];
	for (let i = 0; i < stops.length - 1; i++) {
		const a = stops[i], b = stops[i + 1], la = hexToOklab(a.color), lb = hexToOklab(b.color);
		const at = t => oklabToRgb(mix(la, lb, ease(a.ease, t)));
		// Adaptive: split a span until straight sRGB interpolation across it stays within one 8-bit step of the
		// OKLab curve at every probe; gamut clipping makes kinks a fixed count of stops would miss.
		const ts = [0, 1];
		const fine = (t0, t1, depth) => {
			const c0 = at(t0), c1 = at(t1);
			for (const f of [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
				const want = at(t0 + (t1 - t0) * f);
				if (want.some((v, j) => Math.abs(c0[j] + (c1[j] - c0[j]) * f - v) > 1)) {
					if (depth >= 9) return;
					const mid = (t0 + t1) / 2; ts.push(mid); fine(t0, mid, depth + 1); fine(mid, t1, depth + 1); return;
				}
			}
		};
		if (b.at > a.at) fine(0, 1, 0);
		ts.sort((x, y) => x - y);
		for (const t of i === 0 ? ts : ts.slice(1)) out.push([a.at + (b.at - a.at) * t, rgbHex(at(t))]);
	}
	if (stops[0].at > 0) out.unshift([0, stops[0].color]);
	if (stops.at(-1).at < 1) out.push([1, stops.at(-1).color]);
	return out.map(([at, color]) => '<stop offset="' + fmt(at) + '" stop-color="' + color + '"/>').join('');
}
// The SVG for `bg` filling the rectangle `rect` ({x, y, w, h} in canvas units). Ids carry `idPrefix` so two drawings
// on one page never share a gradient. `dark` renders the inverted colours (the canvas swapped to black).
export function backgroundSVG(input, rect, idPrefix = 'rapier-bg', dark = false) {
	const bg = normalizeBackground(input);
	if (!bg || !rect || !(rect.w > 0) || !(rect.h > 0)) return '';
	const c = col => dark ? invertColour(col) : col;
	const flip = stops => dark ? stops.map(s => ({...s, color: invertColour(s.color)})) : stops;
	const {x, y, w, h} = rect, box = '<rect x="' + fmt(x) + '" y="' + fmt(y) + '" width="' + fmt(w) + '" height="' + fmt(h) + '"';
	const id = String(idPrefix).replace(/[^A-Za-z0-9_-]/g, '');
	if (bg.kind === 'texture') {
		// The ground is the paper; the tile is drawn in the opposite ink or the chosen colour (turned over on black). Pattern tiles
		// meet with no seam at any size; grain is one stitched turbulence whose noise sets alpha only.
		const ground = dark ? '#000000' : '#ffffff', ink = bg.color ? c(bg.color) : dark ? '#ffffff' : '#000000', tile = Math.min(w, h) * bg.scale;
		let defs;
		if (bg.texture === 'grain') {
			const rgb = [1, 3, 5].map(i => parseInt(ink.slice(i, i + 2), 16) / 255);
			defs = '<filter id="' + id + '-t" filterUnits="userSpaceOnUse" x="' + fmt(x) + '" y="' + fmt(y) + '" width="' + fmt(w) + '" height="' + fmt(h) + '" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="' + round(1 / tile, 6) + '" numOctaves="3" seed="' + bg.seed + '" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 ' + fmt(rgb[0]) + ' 0 0 0 0 ' + fmt(rgb[1]) + ' 0 0 0 0 ' + fmt(rgb[2]) + ' .3333 .3333 .3334 0 0"/><feComponentTransfer><feFuncA type="linear" slope="' + fmt(bg.strength * 3) + '" intercept="' + fmt(-bg.strength) + '"/></feComponentTransfer></filter>';
			return '<g data-rapier-background="texture"><defs>' + defs + '</defs>' + box + ' fill="' + ground + '"/>' + box + ' fill="' + ink + '" filter="url(#' + id + '-t)"/></g>';
		}
		const tiles = {dots: '<circle cx="8" cy="8" r="1.25"/>', lines: '<path d="M0 8H16" fill="none" stroke-width=".7"/>', grid: '<path d="M0 8H16M8 0V16" fill="none" stroke-width=".5"/>',
			linen: '<path d="M0 3H16M0 11H16M5 0V16M13 0V16" fill="none" stroke-width=".65"/><path d="M0 6H16M8 0V16" opacity=".32" fill="none" stroke-width=".4"/>',
			weave: '<path d="M0 4H16M0 12H16M4 0V16M12 0V16" fill="none" stroke-width=".6" opacity=".35"/><path d="M1 4H7M9 12H15M12 1V7M4 9V15" fill="none" stroke-width="2.2"/><path d="M1 3H7M9 11H15M11 1V7M3 9V15" fill="none" stroke-width=".45" opacity=".5"/>'};
		defs = '<pattern id="' + id + '-t" patternUnits="userSpaceOnUse" x="' + fmt(x) + '" y="' + fmt(y) + '" width="' + fmt(tile) + '" height="' + fmt(tile) + '" viewBox="0 0 16 16"><g fill="' + ink + '" stroke="' + ink + '" opacity="' + fmt(bg.strength) + '">' + tiles[bg.texture] + '</g></pattern>';
		return '<g data-rapier-background="texture"><defs>' + defs + '</defs>' + box + ' fill="' + ground + '"/>' + box + ' fill="url(#' + id + '-t)"/></g>';
	}
	if (bg.kind === 'solid') return '<g data-rapier-background="solid">' + box + ' fill="' + c(bg.color) + '"/></g>';
	if (bg.kind === 'linear') {
		const at = (u, v) => [x + u * w, y + v * h];
		const [x1, y1] = at(bg.x1, bg.y1), [x2, y2] = at(bg.x2, bg.y2);
		return '<g data-rapier-background="linear"><defs><linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + fmt(x1) + '" y1="' + fmt(y1) + '" x2="' + fmt(x2) + '" y2="' + fmt(y2) + '">' + curveStops(flip(bg.stops)) + '</linearGradient></defs>' + box + ' fill="url(#' + id + ')"/></g>';
	}
	// Wave: the linear gradient's bands bent by one smooth, low-frequency turbulence (the flowing look the gradient
	// studios are loved for). The gradient is laid past every edge so the displacement never pulls in emptiness,
	// then clipped to the rectangle. Its frequency is in rectangle units, so the waves keep their shape at any size.
	if (bg.kind === 'wave') {
		const m = Math.max(w, h), pad = m * 0.5, at = (u, v) => [x + u * w, y + v * h];
		const [x1, y1] = at(bg.x1, bg.y1), [x2, y2] = at(bg.x2, bg.y2);
		const freq = (0.4 + 2.6 * bg.size) / m, amount = m * (0.05 + 0.55 * bg.flow);
		return '<g data-rapier-background="wave"><defs><linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + fmt(x1) + '" y1="' + fmt(y1) + '" x2="' + fmt(x2) + '" y2="' + fmt(y2) + '">' + curveStops(flip(bg.stops)) + '</linearGradient>'
			+ '<clipPath id="' + id + '-c"><rect x="' + fmt(x) + '" y="' + fmt(y) + '" width="' + fmt(w) + '" height="' + fmt(h) + '"/></clipPath>'
			+ '<filter id="' + id + '-f" filterUnits="userSpaceOnUse" x="' + fmt(x - pad) + '" y="' + fmt(y - pad) + '" width="' + fmt(w + 2 * pad) + '" height="' + fmt(h + 2 * pad) + '" color-interpolation-filters="sRGB">'
			+ '<feTurbulence type="fractalNoise" baseFrequency="' + round(freq, 6) + '" numOctaves="2" seed="' + bg.seed + '" result="n"/>'
			+ '<feDisplacementMap in="SourceGraphic" in2="n" scale="' + fmt(amount) + '" xChannelSelector="R" yChannelSelector="G"/></filter></defs>'
			+ '<g clip-path="url(#' + id + '-c)"><rect x="' + fmt(x - pad) + '" y="' + fmt(y - pad) + '" width="' + fmt(w + 2 * pad) + '" height="' + fmt(h + 2 * pad) + '" fill="url(#' + id + ')" filter="url(#' + id + '-f)"/></g></g>';
	}
	// Rails: glowing lines, real vector paths computed here (no filter does the geometry), coloured by the gradient
	// laid across them, each drawn twice: a wide soft glow and a bright core. Forms: parallel lines bent by a sine,
	// a fan from the focus, a spiral of arms round it, a burst of rays. The ground is the paper's own darkest or
	// lightest tone of the first colour, so they glow on black and print as ink on white; the rails keep their own colours
	// on either paper, since light on a dark ground is what this kind is for.
	if (bg.kind === 'rails') return railsSVG(bg, rect, id, dark, stops => stops);
	if (bg.kind === 'bloom' || bg.kind === 'ribbon' || bg.kind === 'echo' || bg.kind === 'rays' || bg.kind === 'glyphs' || bg.kind === 'grid' || bg.kind === 'flow' || bg.kind === 'topo' || bg.kind === 'aurora') return shapesSVG(bg, rect, id, dark);
	// Radii are fractions of the rectangle's half diagonal, so a circle stays a circle on any canvas shape.
	const half = Math.hypot(w, h) / 2;
	if (bg.kind === 'radial') {
		return '<g data-rapier-background="radial"><defs><radialGradient id="' + id + '" gradientUnits="userSpaceOnUse" cx="' + fmt(x + bg.cx * w) + '" cy="' + fmt(y + bg.cy * h) + '" r="' + fmt(bg.r * half) + '">' + curveStops(flip(bg.stops)) + '</radialGradient></defs>' + box + ' fill="url(#' + id + ')"/></g>';
	}
	// Free-form: the base is the OKLab mean of the points unless the person set one; each point is a glow whose
	// alpha falls off smoothly (smoothstep in OKLab-mixed colour against the base, never a hard ring).
	const labs = bg.points.map(p => hexToOklab(p.color));
	const mean = labs.reduce((acc, l) => acc.map((v, i) => v + l[i] / labs.length), [0, 0, 0]);
	const base = bg.base || rgbHex(oklabToRgb(mean));
	let defs = '', glows = '';
	bg.points.forEach((p, i) => {
		const gid = id + '-p' + i, colour = c(p.color), r = p.spread * half;
		let stops = '';
		for (let k = 0; k <= 8; k++) { const t = k / 8, a = 1 - t * t * (3 - 2 * t); stops += '<stop offset="' + fmt(t) + '" stop-color="' + colour + '" stop-opacity="' + fmt(a) + '"/>'; }
		defs += '<radialGradient id="' + gid + '" gradientUnits="userSpaceOnUse" cx="' + fmt(x + p.x * w) + '" cy="' + fmt(y + p.y * h) + '" r="' + fmt(r) + '">' + stops + '</radialGradient>';
		glows += box + ' fill="url(#' + gid + ')"/>';
	});
	return '<g data-rapier-background="freeform"><defs>' + defs + '</defs>' + box + ' fill="' + c(base) + '"/>' + glows + '</g>';
}

function railsSVG(bg, rect, id, dark, flip) {
	const {x, y, w, h} = rect, n = bg.count, cx = x + bg.cx * w, cy = y + bg.cy * h, diag = Math.hypot(w, h);
	const paths = [];
	const poly = pts => 'M' + pts.map(([px, py]) => fmg(px) + ' ' + fmg(py)).join('L');
	for (let i = 0; i < n; i++) {
		const t = n === 1 ? 0.5 : i / (n - 1), pts = [];
		if (bg.form === 'lines') {
			// Vertical rails across the width, each bowed by a sine that grows toward the focus row.
			const px = x + (i + 0.5) / n * w;
			for (let k = 0; k <= 48; k++) { const v = k / 48, py = y + v * h; pts.push([px + Math.sin(v * Math.PI * 2 + t * 3) * bg.bend * w / n * 2.5 * Math.exp(-(((py - cy) / h) ** 2) * 3), py]); }
		} else if (bg.form === 'fan') {
			const a = -Math.PI * (0.15 + 0.7 * t);
			for (let k = 0; k <= 32; k++) { const r = k / 32 * diag, bendA = a + bg.bend * 0.6 * (k / 32) ** 2; pts.push([cx + Math.cos(bendA) * r, cy + Math.sin(bendA) * r * 1.0]); }
		} else if (bg.form === 'spiral') {
			const start = t * Math.PI * 2, turns = 0.6 + bg.bend * 1.6;
			for (let k = 0; k <= 96; k++) { const u = k / 96, r = u * diag * 0.75, a = start + u * turns * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
		} else {
			const a = t * Math.PI * 2 * (1 - 1 / n);
			for (let k = 0; k <= 12; k++) { const r = (0.04 + k / 12) * diag, wob = a + Math.sin(k / 12 * Math.PI) * bg.bend * 0.25; pts.push([cx + Math.cos(wob) * r, cy + Math.sin(wob) * r]); }
		}
		paths.push(poly(pts));
	}
	const first = hexToOklab(bg.stops[0].color);
	const ground = rgbHex(oklabToRgb(dark ? [0.13, first[1] * 0.35, first[2] * 0.35] : [0.97, first[1] * 0.15, first[2] * 0.15]));
	const width = Math.max(w, h) / n, core = width * (0.12 + 0.3 * bg.glow), halo = width * (0.5 + 1.0 * bg.glow);
	const d = paths.join('');
	// Rails run across the gradient's axis: lines across the width, the others outward from the focus.
	const axis = bg.form === 'lines' ? [x, cy, x + w, cy] : [cx, cy, cx + diag * 0.7071, cy + diag * 0.7071];
	return '<g data-rapier-background="rails"><defs><linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + fmg(axis[0]) + '" y1="' + fmg(axis[1]) + '" x2="' + fmg(axis[2]) + '" y2="' + fmg(axis[3]) + '">' + curveStops(flip(bg.stops)) + '</linearGradient>'
		+ '<filter id="' + id + '-g" filterUnits="userSpaceOnUse" x="' + fmg(x) + '" y="' + fmg(y) + '" width="' + fmg(w) + '" height="' + fmg(h) + '"><feGaussianBlur stdDeviation="' + fmg(halo / 2.5) + '"/></filter>'
		+ '<clipPath id="' + id + '-c"><rect x="' + fmg(x) + '" y="' + fmg(y) + '" width="' + fmg(w) + '" height="' + fmg(h) + '"/></clipPath></defs>'
		+ '<g clip-path="url(#' + id + '-c)"><rect x="' + fmg(x) + '" y="' + fmg(y) + '" width="' + fmg(w) + '" height="' + fmg(h) + '" fill="' + ground + '"/>'
		+ (bg.glow > 0 ? '<path d="' + d + '" fill="none" stroke="url(#' + id + ')" stroke-width="' + fmg(halo) + '" stroke-linecap="round" opacity="' + fmg(0.25 + 0.6 * bg.glow) + '" filter="url(#' + id + '-g)"/>' : '')
		+ '<path d="' + d + '" fill="none" stroke="url(#' + id + ')" stroke-width="' + fmg(core) + '" stroke-linecap="round"/></g></g>';
}

// The colour the authored curve has at t, as hex (the shaped kinds colour each band or layer from it).
function curveAt(stops, t) { return rgbHex(sampleStops(stops, t)); }
function groundFor(stops, dark) {
	const first = hexToOklab(stops[0].color);
	return rgbHex(oklabToRgb(dark ? [0.13, first[1] * 0.35, first[2] * 0.35] : [0.97, first[1] * 0.15, first[2] * 0.15]));
}
// Smooth value noise in 0..1 from a seed: deterministic, so a saved background redraws the same everywhere.
function noise2(seed) {
	const hash = (i, j) => { let v = (i * 374761393 + j * 668265263 + seed * 2246822519) | 0; v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };
	const smooth = t => t * t * t * (t * (t * 6 - 15) + 10);
	const one = (x, y) => { const i = Math.floor(x), j = Math.floor(y), fx = smooth(x - i), fy = smooth(y - j); const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1); return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy; };
	return (x, y) => (one(x, y) * 0.65 + one(x * 2.03 + 17, y * 2.03 - 9) * 0.25 + one(x * 4.1 - 5, y * 4.1 + 3) * 0.1);
}
// Bloom, ribbon and echo: shapes the gradient colours band by band, drawn as plain filled or stroked paths with one
// soft blur for the glow. Like rails they keep their colours on either paper; the ground follows the paper.
function shapesSVG(bg, rect, id, dark) {
	const {x, y, w, h} = rect, diag = Math.hypot(w, h), m = Math.min(w, h);
	const clip = '<clipPath id="' + id + '-c"><rect x="' + fmg(x) + '" y="' + fmg(y) + '" width="' + fmg(w) + '" height="' + fmg(h) + '"/></clipPath>';
	const blur = sd => '<filter id="' + id + '-g" filterUnits="userSpaceOnUse" x="' + fmg(x) + '" y="' + fmg(y) + '" width="' + fmg(w) + '" height="' + fmg(h) + '"><feGaussianBlur stdDeviation="' + fmg(sd) + '"/></filter>';
	const ground = '<rect x="' + fmg(x) + '" y="' + fmg(y) + '" width="' + fmg(w) + '" height="' + fmg(h) + '" fill="' + groundFor(bg.stops, dark) + '"/>';
	const path = pts => 'M' + pts.map(([px, py]) => fmg(px) + ' ' + fmg(py)).join('L') + 'Z';
	let body = '', glowSD = m * 0.02;
	if (bg.kind === 'bloom') {
		const cx = x + bg.cx * w, cy = y + bg.cy * h, k = bg.petals, n = bg.layers, R = (0.2 + 0.8 * bg.size) * diag * 0.5;
		const layer = i => {
			const s = R * (1 - i / n), rot = bg.twist * Math.PI * 2 / k * i, pts = [];
			for (let j = 0; j < 240; j++) {
				const a = j / 240 * Math.PI * 2, petal = Math.abs(Math.cos(k * (a - rot) / 2)) ** 1.4;
				const r = s * (0.18 + 0.82 * petal);
				pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
			}
			return path(pts);
		};
		for (let i = 0; i < n; i++) body += '<path d="' + layer(i) + '" fill="' + curveAt(bg.stops, n === 1 ? 0 : i / (n - 1)) + '"/>';
		if (bg.glow > 0) body = '<path d="' + layer(0) + '" fill="' + curveAt(bg.stops, 0) + '" filter="url(#' + id + '-g)" opacity="' + fmg(0.3 + 0.7 * bg.glow) + '"/>' + body;
		glowSD = R * (0.03 + 0.1 * bg.glow);
	} else if (bg.kind === 'ribbon') {
		// A Catmull-Rom curve through the points; the ribbon is its bands, each a strip between two offsets.
		const P = bg.points.map(p => [x + p.x * w, y + p.y * h]), pts = [];
		const ext = [P[0], ...P, P.at(-1)];
		for (let i = 1; i < ext.length - 2; i++) for (let k = 0; k < 24; k++) {
			const t = k / 24, [p0, p1, p2, p3] = [ext[i - 1], ext[i], ext[i + 1], ext[i + 2]];
			const c = j => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t * t * t);
			pts.push([c(0), c(1)]);
		}
		pts.push(P.at(-1));
		const normals = pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; });
		const W = (0.08 + 0.6 * bg.width) * m, n = bg.bands;
		const offset = o => pts.map((p, i) => [p[0] + normals[i][0] * o, p[1] + normals[i][1] * o]);
		const strip = (a, b) => { const A = offset(a), B = offset(b).reverse(); return path(A.concat(B)); };
		for (let i = 0; i < n; i++) body += '<path d="' + strip(-W / 2 + i * W / n, -W / 2 + (i + 1.04) * W / n) + '" fill="' + curveAt(bg.stops, n === 1 ? 0 : i / (n - 1)) + '"/>';
		if (bg.glow > 0) body = '<path d="' + strip(-W / 2, W / 2) + '" fill="' + curveAt(bg.stops, 0.5) + '" filter="url(#' + id + '-g)" opacity="' + fmg(0.25 + 0.65 * bg.glow) + '"/>' + body;
		glowSD = W * (0.05 + 0.25 * bg.glow);
	} else if (bg.kind === 'rays') {
		// Rays: banded wedges from a waist. Each band is the strip between two neighbouring rays; a ray leaves the
		// waist at its angle and bends outward by `curve`. Hourglass mirrors a fan above and below; perspective is
		// one fan from a point on the top edge.
		const cx = x + bg.cx * w, cy = y + bg.cy * h, n = bg.count, L = diag * 1.2, open = 0.25 + 1.1 * bg.spread;
		const waist = w * 0.05 * (1 - bg.curve * 0.5);
		const ray = (a, dir) => { const pts = []; for (let k = 0; k <= 24; k++) { const t = k / 24, bend = a * (1 + bg.curve * 2.2 * t * t); pts.push([cx + a / open * waist + Math.sin(bend) * L * t, cy + dir * Math.cos(bend) * L * t]); } return pts; };
		const fan = dir => { let out = ''; for (let i = 0; i < n; i++) { const a0 = -open / 2 + open * i / n, a1 = -open / 2 + open * (i + 1) / n; out += '<path d="' + path(ray(a0, dir).concat(ray(a1, dir).reverse())) + '" fill="' + curveAt(bg.stops, Math.abs((i + 0.5) / n * 2 - 1)) + '"/>'; } return out; };
		const half = bg.form === 'perspective' ? fan(1) : bg.form === 'hourglass' ? fan(1) + fan(-1) : fan(-1);
		body = ((bg.glow ?? 0.5) > 0 ? '<use href="#' + id + '-k" filter="url(#' + id + '-g)" opacity="' + fmg(1.2 * (bg.glow ?? 0.5)) + '"/>' : '') + '<g id="' + id + '-k">' + half + '</g>';
		glowSD = m * 0.012;
	} else if (bg.kind === 'flow') {
		// A flow field: streamlines seeded on a jittered grid and walked through the angle a smooth noise gives,
		// `swirl` turning the field from gentle drift to curls. Each line is coloured by where it started along the
		// curve, so colour flows with the strands.
		const N = noise2(bg.seed), sc = 1.2 + 5 * bg.scale, n = bg.lines, step = m * 0.012, len = 40 + Math.round(60 * bg.scale);
		const groups = new Map(), cols = Math.ceil(Math.sqrt(n * w / h)), rows = Math.ceil(n / cols);
		let k = 0;
		for (let r = 0; r < rows; r++) for (let c = 0; c < cols && k < n; c++, k++) {
			let px = x + (c + 0.5 + (N(c * 3.1, r * 1.7) - 0.5)) / cols * w, py = y + (r + 0.5 + (N(r * 2.3, c * 4.9) - 0.5)) / rows * h;
			const t = N(px / w * 1.3 + 7, py / h * 1.3 - 3), pts = [[px, py]];
			for (let i = 0; i < len; i++) {
				const a = (N((px - x) / m * sc, (py - y) / m * sc) * 2 - 0.5) * Math.PI * (1 + 3 * bg.swirl);
				px += Math.cos(a) * step; py += Math.sin(a) * step;
				if (px < x - step || px > x + w + step || py < y - step || py > y + h + step) break;
				pts.push([px, py]);
			}
			if (pts.length < 3) continue;
			const colour = curveAt(bg.stops, Math.min(1, Math.max(0, (t - 0.25) * 2)));
			// Relative steps after the first point: small numbers, a fraction of the bytes; every second sample is
			// enough for a line this smooth.
			let seg = 'M' + fmg(pts[0][0]) + ' ' + fmg(pts[0][1]) + 'l', [lx, ly] = pts[0];
			for (let q = 2; q < pts.length; q += 2) { const [qx, qy] = pts[q], dx = round(qx - lx, 1), dy = round(qy - ly, 1); seg += dx + ' ' + dy + ' '; lx += dx; ly += dy; }
			groups.set(colour, (groups.get(colour) || '') + seg.trimEnd());
		}
		const sw = m * (0.0015 + 0.008 * bg.weight);
		let lines = '';
		for (const [colour, d] of groups) lines += '<path d="' + d + '" fill="none" stroke="' + colour + '" stroke-width="' + fmg(sw) + '" stroke-linecap="round" stroke-linejoin="round"/>';
		body = (bg.glow > 0 ? '<use href="#' + id + '-k" filter="url(#' + id + '-g)" opacity="' + fmg(0.3 + 0.7 * bg.glow) + '"/>' : '') + '<g id="' + id + '-k">' + lines + '</g>';
		glowSD = sw * 3;
	} else if (bg.kind === 'topo') {
		// Contours of a noise landscape by marching squares: `lines` levels, each coloured along the curve by its
		// height, so the map reads from valley to ridge. The heavier every fifth line, as on a survey map.
		const N = noise2(bg.seed), sc = 1 + 4 * bg.scale, G = 96, gw = w / G, gh = h / G, levels = Math.max(4, Math.round(bg.lines / 8));
		const field = [];
		for (let j = 0; j <= G; j++) { const row = []; for (let i = 0; i <= G; i++) { const u = i / G * w / m * sc, v = j / G * h / m * sc; row.push(N(u + Math.sin(v * bg.swirl * 3) * bg.swirl, v)); } field.push(row); }
		const sw = m * (0.0012 + 0.004 * bg.weight);
		let lines = '';
		for (let L = 1; L < levels; L++) {
			const iso = 0.15 + 0.7 * L / levels;
			let d = '';
			for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
				const a = field[j][i], b = field[j][i + 1], c = field[j + 1][i + 1], e = field[j + 1][i];
				const idx = (a > iso ? 8 : 0) | (b > iso ? 4 : 0) | (c > iso ? 2 : 0) | (e > iso ? 1 : 0);
				if (idx === 0 || idx === 15) continue;
				const X = x + i * gw, Y = y + j * gh, lerp = (p, q) => (iso - p) / (q - p || 1e-9);
				const top = [X + gw * lerp(a, b), Y], right = [X + gw, Y + gh * lerp(b, c)], bottom = [X + gw * lerp(e, c), Y + gh], left = [X, Y + gh * lerp(a, e)];
				const segs = {1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]], 4: [[top, right]], 5: [[left, top], [bottom, right]], 6: [[top, bottom]], 7: [[left, top]], 8: [[left, top]], 9: [[top, bottom]], 10: [[left, bottom], [top, right]], 11: [[top, right]], 12: [[left, right]], 13: [[bottom, right]], 14: [[left, bottom]]}[idx];
				for (const [p, q] of segs) d += 'M' + fmg(p[0]) + ' ' + fmg(p[1]) + 'l' + fmg(q[0] - p[0]) + ' ' + fmg(q[1] - p[1]);
			}
			if (d) lines += '<path d="' + d + '" fill="none" stroke="' + curveAt(bg.stops, L / levels) + '" stroke-width="' + fmg(L % 5 === 0 ? sw * 2.2 : sw) + '" stroke-linecap="round"/>';
		}
		body = (bg.glow > 0 ? '<use href="#' + id + '-k" filter="url(#' + id + '-g)" opacity="' + fmg(0.3 + 0.7 * bg.glow) + '"/>' : '') + '<g id="' + id + '-k">' + lines + '</g>';
		glowSD = sw * 2;
	} else if (bg.kind === 'aurora') {
		// Aurora: curtains of light hung on a wavering hem, brightest at the hem and fading upward into the sky,
		// combed by fine vertical rays of uneven length. Each curtain is a row of narrow panels, each panel lit by
		// one bounding-box gradient, so the light follows the hem wherever it bends; the panel joins read as the
		// curtain's own striations. Colours run along the curve from the front curtain to the back one.
		const N = noise2(bg.seed), n = bg.curtains, H = h * (0.15 + 0.5 * bg.height), S = 64;
		let defs = '', curtains = '', rays = '';
		for (let c = n - 1; c >= 0; c--) {
			const t = n === 1 ? 0 : c / (n - 1), colour = curveAt(bg.stops, t), gid = id + '-a' + c;
			const lab = hexToOklab(colour), hem = rgbHex(oklabToRgb([Math.min(0.97, lab[0] + 0.18), lab[1] * 0.8, lab[2] * 0.8]));
			const base = y + h * (0.38 + 0.34 * (1 - t)), amp = h * (0.03 + 0.2 * bg.sway);
			const edge = u => base + (N(u * (1.5 + 2.5 * bg.sway) + c * 3.7, c * 1.9) - 0.5) * 2 * amp;
			const top = u => edge(u) - H * (0.5 + 0.9 * N(u * 4.3 - c * 2.1, c * 5.3 + 11));
			defs += '<linearGradient id="' + gid + '" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="' + hem + '" stop-opacity="0.95"/><stop offset="0.06" stop-color="' + colour + '" stop-opacity="0.85"/><stop offset="0.3" stop-color="' + colour + '" stop-opacity="0.35"/><stop offset="1" stop-color="' + colour + '" stop-opacity="0"/></linearGradient>';
			let panels = '';
			for (let k = 0; k < S; k++) {
				const u0 = k / S, u1 = (k + 1) / S, x0 = x + u0 * w, x1 = x + u1 * w;
				panels += '<path d="M' + fmg(x0) + ' ' + fmg(edge(u0)) + 'L' + fmg(x1) + ' ' + fmg(edge(u1)) + 'L' + fmg(x1) + ' ' + fmg(top(u1)) + 'L' + fmg(x0) + ' ' + fmg(top(u0)) + 'Z"/>';
			}
			curtains += '<g fill="url(#' + gid + ')" opacity="' + fmg(0.5 + 0.5 * (1 - t)) + '">' + panels + '</g>';
			const K = Math.round(24 + 260 * bg.rays);
			let d = '';
			for (let k = 0; k < K; k++) { const u = (k + N(k * 0.73, c * 7.1)) / K, ey = edge(u), len = (ey - top(u)) * (0.3 + 0.7 * N(k * 1.31 + c, 3.3)); d += 'M' + fmg(x + u * w) + ' ' + fmg(ey) + 'v' + fmg(-len); }
			rays += '<path d="' + d + '" fill="none" stroke="' + hem + '" stroke-width="' + fmg(Math.max(0.5, w / K * 0.25)) + '" opacity="' + fmg(0.12 + 0.18 * (1 - t)) + '"/>';
		}
		let stars = '';
		if (bg.stars > 0) {
			const count = Math.round(20 + 380 * bg.stars);
			let d = '';
			for (let k = 0; k < count; k++) { const sx = x + ((k * 0.6180339887 + bg.seed * 0.137) % 1) * w, sy = y + N(k * 0.917, 5.1) ** 1.6 * h * 0.85; d += 'M' + fmg(sx) + ' ' + fmg(sy) + 'h0'; }
			stars = '<path d="' + d + '" stroke="' + (dark ? '#ffffff' : curveAt(bg.stops, 1)) + '" stroke-width="' + fmg(m * 0.0044) + '" stroke-linecap="round" opacity="' + (dark ? '0.8' : '0.45') + '"/>';
		}
		const g0 = groundFor(bg.stops, dark), horizon = rgbHex(sampleStops([{at: 0, color: g0}, {at: 1, color: curveAt(bg.stops, 0)}], dark ? 0.18 : 0.08));
		const sky = '<linearGradient id="' + id + '-y" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + g0 + '"/><stop offset="1" stop-color="' + horizon + '"/></linearGradient>';
		body = '<rect x="' + fmg(x) + '" y="' + fmg(y) + '" width="' + fmg(w) + '" height="' + fmg(h) + '" fill="url(#' + id + '-y)"/>' + stars
			+ (bg.glow > 0 ? '<use href="#' + id + '-k" filter="url(#' + id + '-g)" opacity="' + fmg(0.4 + 0.6 * bg.glow) + '"/>' : '') + '<g id="' + id + '-k">' + curtains + rays + '</g>';
		return '<g data-rapier-background="aurora"><defs>' + clip + blur(m * (0.01 + 0.03 * bg.glow)) + defs + sky + '</defs><g clip-path="url(#' + id + '-c)">' + body + '</g></g>';
	} else if (bg.kind === 'grid') {
		// The horizon grid: a floor of lines converging on a vanishing point at the horizon, crossing lines packed
		// toward it by perspective, a haze where floor meets sky, and an optional striped sun sitting on the line.
		// Colours: the curve's start is the floor lines, its end the sky haze and the sun.
		const hy = y + h * (0.25 + 0.5 * bg.horizon), vx = x + w / 2, n = bg.lines, floor = curveAt(bg.stops, 0), sky = curveAt(bg.stops, 1);
		const sw = m * 0.004, lines = [];
		for (let i = -n; i <= n; i++) { const bx = vx + i / n * w * (1.4 + bg.tilt); lines.push('M' + fmg(vx) + ' ' + fmg(hy) + 'L' + fmg(bx) + ' ' + fmg(y + h)); }
		for (let k = 1; k <= n; k++) { const t = (k / n) ** 2.2, ly = hy + (y + h - hy) * t; lines.push('M' + fmg(x) + ' ' + fmg(ly) + 'H' + fmg(x + w)); }
		const d = lines.join('');
		const fade = '<linearGradient id="' + id + '-f" gradientUnits="userSpaceOnUse" x1="0" y1="' + fmg(hy) + '" x2="0" y2="' + fmg(y + h) + '"><stop offset="0" stop-color="#fff" stop-opacity="0.15"/><stop offset="0.35" stop-color="#fff" stop-opacity="1"/></linearGradient><mask id="' + id + '-m"><rect x="' + fmg(x) + '" y="' + fmg(hy) + '" width="' + fmg(w) + '" height="' + fmg(y + h - hy) + '" fill="url(#' + id + '-f)"/></mask>';
		const haze = '<linearGradient id="' + id + '-h" gradientUnits="userSpaceOnUse" x1="0" y1="' + fmg(y) + '" x2="0" y2="' + fmg(hy) + '"><stop offset="0" stop-color="' + sky + '" stop-opacity="0"/><stop offset="1" stop-color="' + sky + '" stop-opacity="' + fmg(0.25 + 0.5 * bg.glow) + '"/></linearGradient>';
		let sun = '';
		if (bg.sun > 0) {
			const R = m * (0.12 + 0.25 * bg.sun), sid = id + '-u';
			let bars = ''; for (let k = 0; k < 6; k++) { const by = hy - R * 0.55 + k * R * 0.11, bh = R * 0.02 * (k + 1); bars += '<rect x="' + fmg(vx - R) + '" y="' + fmg(by) + '" width="' + fmg(2 * R) + '" height="' + fmg(bh) + '" fill="#000"/>'; }
			sun = '<mask id="' + sid + '"><rect x="' + fmg(vx - R) + '" y="' + fmg(hy - 2 * R) + '" width="' + fmg(2 * R) + '" height="' + fmg(2 * R) + '" fill="#fff"/>' + bars + '</mask>'
				+ '<linearGradient id="' + sid + '-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + curveAt(bg.stops, 1) + '"/><stop offset="1" stop-color="' + curveAt(bg.stops, 0.5) + '"/></linearGradient>';
			sun = { defs: sun, body: '<circle cx="' + fmg(vx) + '" cy="' + fmg(hy) + '" r="' + fmg(R) + '" fill="url(#' + sid + '-g)" mask="url(#' + sid + ')"/>' };
		}
		const defs = clip + blur(m * (0.006 + 0.02 * bg.glow)) + fade + haze + (sun ? sun.defs : '');
		body = '<rect x="' + fmg(x) + '" y="' + fmg(y) + '" width="' + fmg(w) + '" height="' + fmg(hy - y) + '" fill="url(#' + id + '-h)"/>' + (sun ? sun.body : '')
			+ '<g mask="url(#' + id + '-m)">' + (bg.glow > 0 ? '<path d="' + d + '" fill="none" stroke="' + floor + '" stroke-width="' + fmg(sw * 3) + '" filter="url(#' + id + '-g)" opacity="' + fmg(0.3 + 0.7 * bg.glow) + '"/>' : '') + '<path d="' + d + '" fill="none" stroke="' + floor + '" stroke-width="' + fmg(sw) + '"/></g>';
		return '<g data-rapier-background="grid"><defs>' + defs + '</defs><g clip-path="url(#' + id + '-c)">' + ground + body + '</g></g>';
	} else if (bg.kind === 'glyphs') {
		// A glyph field: a grid of small marks (ring, plus, bar, dot), the mark at each cell chosen by a hash of the
		// seed, its colour the authored curve at the cell's place along the axis, bent by a slow wave. Marks are paths,
		// not text, so the field needs no font and stays exact at any size.
		const cols = bg.cols, cell = w / cols, rows = Math.ceil(h / cell), ax = bg.x2 - bg.x1, ay = bg.y2 - bg.y1, len2 = ax * ax + ay * ay || 1;
		const hash = (i, j) => { let v = (i * 374761393 + j * 668265263 + bg.seed * 2246822519) >>> 0; v = Math.imul(v ^ (v >>> 13), 1274126177) >>> 0; return (v ^ (v >>> 16)) / 4294967296; };
		const r = cell * 0.32, sw = cell * 0.12, groups = new Map();
		for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
			const u = (i + 0.5) / cols, v = Math.min(1, (j + 0.5) * cell / h), hsh = hash(i, j);
			if (hsh > 0.25 + 0.75 * bg.density) continue;
			let t = ((u - bg.x1) * ax + (v - bg.y1) * ay) / len2;
			t += bg.wobble * 0.18 * Math.sin(u * 7.1 + bg.seed) * Math.cos(v * 5.3 - bg.seed * 0.7);
			t = Math.min(1, Math.max(0, t));
			const colour = curveAt(bg.stops, t), px = x + (i + 0.5) * cell, py = y + (j + 0.5) * cell, kind = Math.floor(hash(j, i) * 4);
			const style = bg.style || 'marks';
			let mark;
			if (style === 'halftone') { const rr = r * (0.25 + 1.1 * (0.5 + 0.5 * Math.sin(t * Math.PI * 3 + hsh))); mark = 'M' + fmg(px - 0.01) + ' ' + fmg(py) + 'H' + fmg(px + 0.01); groups.set(colour + '|' + fmg(rr), (groups.get(colour + '|' + fmg(rr)) || '') + mark); continue; }
			if (style === 'blocks') { const level = Math.floor(hash(j, i) * 4); const hh = cell * (0.25 + level * 0.25); mark = 'M' + fmg(px - cell * 0.45) + ' ' + fmg(py + cell * 0.45 - hh) + 'h' + fmg(cell * 0.9) + 'v' + fmg(hh) + 'h' + fmg(-cell * 0.9) + 'Z'; groups.set(colour + '|fill', (groups.get(colour + '|fill') || '') + mark); continue; }
			if (style === 'rain') { const period = 9 + Math.floor(hash(i, 3) * 14), len = 3 + Math.floor(hash(i, 7) * (period - 3)), k = (j + Math.floor(hash(i, 5) * period)) % period; if (k >= len) continue; const fade = (0.15 + 0.85 * (k + 1) / len).toFixed(2), head = k === len - 1; mark = head ? 'M' + fmg(px - r * 0.6) + ' ' + fmg(py) + 'h' + fmg(r * 1.2) + 'M' + fmg(px) + ' ' + fmg(py - r * 0.6) + 'v' + fmg(r * 1.2) : 'M' + fmg(px) + ' ' + fmg(py - r) + 'V' + fmg(py + r * (kind === 0 ? 0.2 : 1)); const key = (head ? '#ffffff' : colour) + '|a' + fade; groups.set(key, (groups.get(key) || '') + mark); continue; }
			if (style === 'circuit') { const dir = kind; mark = 'M' + fmg(px) + ' ' + fmg(py) + (dir === 0 ? 'h' + fmg(cell) : dir === 1 ? 'v' + fmg(cell) : dir === 2 ? 'l' + fmg(cell) + ' ' + fmg(cell) : 'h' + fmg(cell * 0.5) + 'v' + fmg(cell * 0.5)) + (hsh < 0.15 ? 'M' + fmg(px - r * 0.5) + ' ' + fmg(py) + 'a' + fmg(r * 0.5) + ' ' + fmg(r * 0.5) + ' 0 1 0 ' + fmg(r) + ' 0a' + fmg(r * 0.5) + ' ' + fmg(r * 0.5) + ' 0 1 0 ' + fmg(-r) + ' 0' : ''); groups.set(colour, (groups.get(colour) || '') + mark); continue; }
			mark = kind === 0 ? 'M' + fmg(px - r) + ' ' + fmg(py) + 'a' + fmg(r) + ' ' + fmg(r) + ' 0 1 0 ' + fmg(2 * r) + ' 0a' + fmg(r) + ' ' + fmg(r) + ' 0 1 0 ' + fmg(-2 * r) + ' 0'
				: kind === 1 ? 'M' + fmg(px - r) + ' ' + fmg(py) + 'H' + fmg(px + r) + 'M' + fmg(px) + ' ' + fmg(py - r) + 'V' + fmg(py + r)
				: kind === 2 ? 'M' + fmg(px) + ' ' + fmg(py - r) + 'V' + fmg(py + r)
				: 'M' + fmg(px - 0.01) + ' ' + fmg(py) + 'H' + fmg(px + 0.01);
			groups.set(colour, (groups.get(colour) || '') + mark);
		}
		let halo = '';
		for (const [key, d] of groups) {
			// Group keys carry the style's extra: '|fill' (solid blocks), '|<n>' (a halftone dot's radius), '|a<n>' (a rain trail's fade).
			const [colour, extra = ''] = key.split('|');
			let core, wide;
			if (extra === 'fill') { core = '<path d="' + d + '" fill="' + colour + '"/>'; wide = core; }
			else if (extra[0] === 'a') { const a = extra.slice(1); core = '<path d="' + d + '" fill="none" stroke="' + colour + '" stroke-width="' + fmg(sw * 1.4) + '" stroke-linecap="round" opacity="' + a + '"/>'; wide = core.replace('stroke-width="' + fmg(sw * 1.4) + '"', 'stroke-width="' + fmg(sw * 4) + '"'); }
			else if (extra) { core = '<path d="' + d + '" fill="none" stroke="' + colour + '" stroke-width="' + fmg(Number(extra) * 2) + '" stroke-linecap="round"/>'; wide = core; }
			else { core = '<path d="' + d + '" fill="none" stroke="' + colour + '" stroke-width="' + fmg(sw) + '" stroke-linecap="round" stroke-linejoin="round"/>'; wide = '<path d="' + d + '" fill="none" stroke="' + colour + '" stroke-width="' + fmg(sw * 3) + '" stroke-linecap="round"/>'; }
			body += core;
		}
		// The neon: each mark's own colour blurred wide under it, and a faint scanline over the whole field.
		const scan = '<pattern id="' + id + '-s" patternUnits="userSpaceOnUse" width="' + fmg(cell) + '" height="' + fmg(cell / 3) + '"><rect width="' + fmg(cell) + '" height="' + fmg(cell / 6) + '" fill="' + (dark ? '#ffffff' : '#000000') + '" opacity="0.05"/></pattern>';
		return '<g data-rapier-background="glyphs"><defs>' + clip + blur(cell * 0.35) + scan + '</defs><g clip-path="url(#' + id + '-c)">' + ground
			+ ((bg.glow ?? 0.7) > 0 ? '<use href="#' + id + '-k" filter="url(#' + id + '-g)" opacity="' + fmg((dark ? 1.25 : 0.65) * (bg.glow ?? 0.7)) + '"/>' : '') + '<g id="' + id + '-k">' + body + '</g>'
			+ ((bg.glow ?? 0.7) > 0 ? '<rect x="' + fmg(x) + '" y="' + fmg(y) + '" width="' + fmg(w) + '" height="' + fmg(h) + '" fill="url(#' + id + '-s)"/>' : '') + '</g></g>';
	} else {
		// Echo: one rounded box repeated from one place to another, each a thin outline coloured along the way.
		const n = bg.count, size = (0.15 + 0.7 * bg.size) * m;
		for (let i = 0; i < n; i++) {
			const t = n === 1 ? 0 : i / (n - 1), px = x + (bg.x1 + (bg.x2 - bg.x1) * t) * w, py = y + (bg.y1 + (bg.y2 - bg.y1) * t) * h;
			const s = size * (1 - 0.35 * t), r = s * 0.5 * bg.round, a = bg.turn * 90 * t;
			body += '<rect x="' + fmg(px - s / 2) + '" y="' + fmg(py - s / 2) + '" width="' + fmg(s) + '" height="' + fmg(s) + '" rx="' + fmg(r) + '" fill="none" stroke="' + curveAt(bg.stops, t) + '" stroke-width="' + fmg(m * 0.004) + '" transform="rotate(' + fmg(a) + ' ' + fmg(px) + ' ' + fmg(py) + ')"/>';
		}
		return '<g data-rapier-background="echo"><defs>' + clip + '</defs><g clip-path="url(#' + id + '-c)">' + ground + body + '</g></g>';
	}
	return '<g data-rapier-background="' + bg.kind + '"><defs>' + clip + blur(glowSD) + '</defs><g clip-path="url(#' + id + '-c)">' + ground + body + '</g></g>';
}

// Sample the authored OKLab curve of a linear or radial background at t (0..1) as 8-bit sRGB: what the row checks
// the emitted native stops against.
export function sampleStops(stops, t) {
	const s = admitStops(stops); if (!s) return null;
	if (t <= s[0].at) return oklabToRgb(hexToOklab(s[0].color));
	for (let i = 0; i < s.length - 1; i++) {
		const a = s[i], b = s[i + 1];
		if (t <= b.at) { const u = b.at === a.at ? 1 : (t - a.at) / (b.at - a.at); return oklabToRgb(mix(hexToOklab(a.color), hexToOklab(b.color), ease(a.ease, u))); }
	}
	return oklabToRgb(hexToOklab(s.at(-1).color));
}

// A few starting points for the panel, chosen by eye on white and black paper.
export const BACKGROUND_PRESETS = [
	{kind: 'texture', texture: 'weave', scale: 0.025, strength: 0.6, seed: 1},
	{kind: 'texture', texture: 'grain', scale: 0.004, strength: 0.45, seed: 3},
	{kind: 'texture', texture: 'linen', scale: 0.025, strength: 0.7, seed: 1, color: '#8a6d4b'},
	{kind: 'texture', texture: 'dots', scale: 0.05, strength: 0.55, seed: 1},
	{kind: 'aurora', seed: 3, curtains: 3, height: 0.6, sway: 0.5, rays: 0.6, stars: 0.5, glow: 0.4, stops: [{at: 0, color: '#3dffb0'}, {at: 0.55, color: '#19c8ff'}, {at: 1, color: '#b45cff'}]},
	{kind: 'flow', seed: 4, lines: 220, scale: 0.35, swirl: 0.4, weight: 0.3, glow: 0, stops: [{at: 0, color: '#ff7a59'}, {at: 0.5, color: '#ffd166'}, {at: 1, color: '#3a86ff'}]},
	{kind: 'topo', seed: 8, lines: 96, scale: 0.4, swirl: 0.3, weight: 0.3, glow: 0, stops: [{at: 0, color: '#2a9d8f'}, {at: 0.5, color: '#e9c46a'}, {at: 1, color: '#e76f51'}]},
	{kind: 'glyphs', style: 'rain', cols: 36, seed: 11, x1: 0.5, y1: 0, x2: 0.5, y2: 1, density: 0.9, wobble: 0.6, stops: [{at: 0, color: '#d6ffe4'}, {at: 0.4, color: '#22ff88'}, {at: 1, color: '#0a5c36'}]},
	{kind: 'glyphs', style: 'circuit', cols: 22, seed: 5, x1: 0, y1: 0, x2: 1, y2: 1, density: 0.7, wobble: 0.5, stops: [{at: 0, color: '#19e6ff'}, {at: 1, color: '#b16bff'}]},
	{kind: 'glyphs', style: 'halftone', cols: 30, seed: 2, x1: 0, y1: 0.5, x2: 1, y2: 0.5, density: 1, wobble: 0.7, stops: [{at: 0, color: '#ff3ea5'}, {at: 1, color: '#ffb347'}]},
	{kind: 'glyphs', style: 'blocks', cols: 26, seed: 9, x1: 0, y1: 1, x2: 1, y2: 0, density: 0.75, wobble: 0.8, stops: [{at: 0, color: '#3d7bff'}, {at: 1, color: '#19e6ff'}]},
	{kind: 'grid', lines: 20, horizon: 0.35, sun: 0.6, glow: 0.7, tilt: 0.3, stops: [{at: 0, color: '#19e6ff'}, {at: 0.5, color: '#ff3ea5'}, {at: 1, color: '#ffb347'}]},
	{kind: 'glyphs', cols: 28, seed: 3, x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.9, density: 0.8, wobble: 0.9, stops: [{at: 0, color: '#19e6ff'}, {at: 0.5, color: '#3d7bff'}, {at: 1, color: '#ff3ea5'}]},
	{kind: 'rays', form: 'hourglass', count: 26, cx: 0.5, cy: 0.5, spread: 0.85, curve: 0.6, stops: [{at: 0, color: '#1d4fa8'}, {at: 0.4, color: '#2ef0a8'}, {at: 0.7, color: '#f2ffd2'}, {at: 1, color: '#1d7a8a'}]},
	{kind: 'rays', form: 'perspective', count: 14, cx: 0.5, cy: 0, spread: 0.8, curve: 0.2, stops: [{at: 0, color: '#141a5a'}, {at: 0.6, color: '#8a7aa8'}, {at: 1, color: '#3f6ef0'}]},
	{kind: 'bloom', petals: 8, layers: 7, cx: 0.5, cy: 0.5, size: 0.75, twist: 0.08, glow: 0.6, stops: [{at: 0, color: '#8fb4ff'}, {at: 0.35, color: '#5a7cf0'}, {at: 0.6, color: '#d9c8ff'}, {at: 1, color: '#ffd6ea'}]},
	{kind: 'ribbon', points: [{x: -0.05, y: 0.15}, {x: 0.35, y: 0.3}, {x: 0.45, y: 0.6}, {x: 1.05, y: 0.9}], width: 0.5, bands: 9, glow: 0.5, stops: [{at: 0, color: '#1f5fbf'}, {at: 0.4, color: '#2be3a0'}, {at: 0.7, color: '#f4ffd0'}, {at: 1, color: '#2bbfa0'}]},
	{kind: 'echo', x1: 0.62, y1: 0.85, x2: 0.45, y2: 0.25, count: 36, size: 0.7, round: 0.35, turn: 0.1, stops: [{at: 0, color: '#3d6bff'}, {at: 1, color: '#c9a8ff'}]},
	{kind: 'rails', form: 'spiral', count: 28, glow: 0.5, bend: 0.4, cx: 0.4, cy: 0.45, stops: [{at: 0, color: '#1a4fd6'}, {at: 0.5, color: '#c9b6ff'}, {at: 1, color: '#ffd3e3'}]},
	{kind: 'rails', form: 'lines', count: 22, glow: 0.6, bend: 0.5, cx: 0.5, cy: 0.5, stops: [{at: 0, color: '#2a5cf0'}, {at: 0.5, color: '#ffc8dd'}, {at: 1, color: '#2a5cf0'}]},
	{kind: 'rails', form: 'fan', count: 18, glow: 0.4, bend: 0.5, cx: 0.1, cy: 0.95, stops: [{at: 0, color: '#ff9a3c'}, {at: 1, color: '#7b2ff7'}]},
	{kind: 'rails', form: 'burst', count: 24, glow: 0.5, bend: 0.3, cx: 0.5, cy: 0.5, stops: [{at: 0, color: '#ffe066'}, {at: 1, color: '#ff4d6d'}]},
	{kind: 'wave', x1: 0, y1: 0.2, x2: 1, y2: 0.8, flow: 0.7, size: 0.15, seed: 7, stops: [{at: 0, color: '#8d5b9a'}, {at: 0.45, color: '#ee8f9a'}, {at: 0.7, color: '#2f5fb5'}, {at: 1, color: '#e7f1fb'}]},
	{kind: 'linear', x1: 0, y1: 0, x2: 1, y2: 1, stops: [{at: 0, color: '#ffd6a5'}, {at: 1, color: '#bdb2ff', ease: 'smooth'}]},
	{kind: 'linear', x1: 0.5, y1: 0, x2: 0.5, y2: 1, stops: [{at: 0, color: '#8ecae6'}, {at: 1, color: '#fefae0'}]},
	{kind: 'radial', cx: 0.5, cy: 0.45, r: 1, stops: [{at: 0, color: '#fff3b0'}, {at: 1, color: '#e09f3e', ease: 'out'}]},
	{kind: 'freeform', points: [{x: 0.15, y: 0.2, color: '#ff99c8', spread: 0.9}, {x: 0.85, y: 0.25, color: '#a9def9', spread: 0.9}, {x: 0.5, y: 0.9, color: '#e4c1f9', spread: 1}]},
	{kind: 'freeform', points: [{x: 0.2, y: 0.8, color: '#14a38b', spread: 0.8}, {x: 0.8, y: 0.2, color: '#ffd166', spread: 0.8}, {x: 0.9, y: 0.9, color: '#118ab2', spread: 0.6}]},
];
