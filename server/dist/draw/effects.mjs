// SPDX-License-Identifier: AGPL-3.0-only
// A copier consumes SourceGraphic, whether its ink came from paths, type or retained paint.
// The file keeps the source and the filter, never a flattened substitute or a screen-size cache.
import { REFRACTION_PRESETS, refractionPreset, fillRefraction, admitRefraction, refractionBounds, refractionMarkup } from './refraction.mjs';
import { LIQUID_PRESETS, LIQUID_PALETTES, liquidPreset, fillLiquid, admitLiquid, liquidBounds, liquidMarkup } from './liquid.mjs';
export { REFRACTION_PRESETS, refractionPreset, admitRefraction, LIQUID_PRESETS, LIQUID_PALETTES, liquidPreset, admitLiquid };

export function effectPreset(type = 'copier', preset, seed) {
	return type === 'refraction' ? refractionPreset(preset) : type === 'liquid' ? liquidPreset(preset, seed) : type === 'copier' ? copierPreset(preset, seed) : null;
}
export function fillEffect(raw) {
	return raw?.type === 'refraction' ? fillRefraction(raw) : raw?.type === 'liquid' ? fillLiquid(raw) : fillCopier(raw);
}
export function admitEffect(raw) {
	return raw?.type === 'refraction' ? admitRefraction(raw) : raw?.type === 'liquid' ? admitLiquid(raw) : admitCopier(raw);
}
export function effectBounds(effect, box) {
	return effect?.type === 'refraction' ? refractionBounds(effect, box) : effect?.type === 'liquid' ? liquidBounds(effect, box) : copierBounds(effect, box);
}
export function effectMarkup(effect, body, box, key, scene = false) {
	return effect?.type === 'refraction' ? refractionMarkup(effect, body, box, key, scene) : effect?.type === 'liquid' ? liquidMarkup(effect, body, box, key, scene) : copierMarkup(effect, body, box, key, scene);
}

export const COPIER_PRESETS = Object.freeze([
	['photocopy', 'Photocopy', {}],
	['show-through', 'Show-through', { copies: 2, drift: 5, angle: 175, fade: .72, toner: .78, paper: .9 }],
	['tired-drum', 'Tired drum', { banding: .85, wear: .55, toner: .72, grain: .5 }],
	['lid-open', 'Lid open', { edge: .85, exposure: .15, paper: 1, warmth: .3 }],
	['light-bomb', 'Light bomb', { exposure: .6, contrast: 2.3, edge: .65, scatter: .5 }],
	['bad-scan', 'Bad scan', { jitter: .8, banding: .75, wear: .65, scatter: .45 }],
	['nine-copies', 'Nine copies', { copies: 9, drift: 7, angle: 55, fade: .18, jitter: .15, smear: .2 }],
	['fax', 'Fax', { contrast: 3.5, grain: .55, banding: .35, wear: .2, toner: 1, warmth: 0 }],
	['overexposed', 'Overexposed', { exposure: .5, contrast: 1.8, toner: .8, edge: .05 }],
	['underinked', 'Underinked', { toner: .46, grain: .8, scatter: .35, wear: .3 }],
	['newsprint', 'Newsprint', { grain: .75, contrast: 1.7, toner: .85, warmth: .7, paper: 1 }],
	['blueprint', 'Blueprint', { contrast: 1.7, exposure: .08, grain: .25, warmth: 0, paper: 1 }],
	['cyan-drift', 'Cyan drift', { copies: 3, drift: 3.5, angle: 15, fade: .3, grain: .2, jitter: .15 }],
	['clean-feed', 'Clean feed', { grain: .05, scatter: .02, banding: 0, wear: 0, edge: .02, warmth: 0, toner: 1 }],
].map(([id, name, values]) => Object.freeze({ id, name, values: Object.freeze(values) })));

const DEFAULTS = Object.freeze({ strength: 1, exposure: 0, contrast: 1.35, toner: .92, grain: .32,
	scatter: .18, banding: .18, wear: .12, copies: 1, drift: 8, angle: 45, fade: .25,
	smear: 0, jitter: 0, paper: 1, warmth: .12, edge: .12 });
const RANGES = Object.freeze({ strength: [0, 1], exposure: [-1, 1], contrast: [.5, 4], toner: [0, 1],
	grain: [0, 1], scatter: [0, 1], banding: [0, 1], wear: [0, 1], copies: [1, 24],
	drift: [0, 32], angle: [-180, 180], fade: [0, 1], smear: [0, 1], jitter: [0, 1],
	paper: [0, 1], warmth: [0, 1], edge: [0, 1] });
const KEYS = new Set(['type', 'version', 'preset', 'seed', ...Object.keys(DEFAULTS)]);

export function copierPreset(id = 'photocopy', seed = 1337) {
	const preset = COPIER_PRESETS.find(row => row.id === id);
	if (!preset) return null;
	return { type: 'copier', version: 1, preset: id, seed, ...DEFAULTS, ...preset.values };
}

// A caller that names a preset and leaves numbers out is given the preset's own for them: `{preset: 'fax'}` is a whole effect. What it
// sends stands as sent and is admitted as sent; a caller that names no preset is not completed.
export function fillCopier(input) {
	if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.preset !== 'string') return input;
	const start = copierPreset(input.preset, input.seed);
	return start ? { ...start, ...input } : input;
}

// Unknown or malformed author data is refused, not silently removed at Save.
export function admitCopier(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.type !== 'copier' || raw.version !== 1 ||
		Object.keys(raw).some(key => !KEYS.has(key)) || !Number.isInteger(raw.seed) || raw.seed < 0 || raw.seed > 2147483646) return null;
	const out = copierPreset(raw.preset, raw.seed);
	if (!out) return null;
	for (const [key, [min, max]] of Object.entries(RANGES)) {
		const value = raw[key];
		if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || key === 'copies' && !Number.isInteger(value)) return null;
		out[key] = value;
	}
	return out;
}

// Transient slider preview only. The authored effect, including smear, is what Save, history and recovery keep.
export function copierPreviewEffect(effect) {
const admitted = admitCopier(effect);
if (!admitted) return null;
return { ...admitted, smear: 0 };
}

const fmt = n => String(Math.round(n * 100000) / 100000);
function noise(seed, index) {
	let n = Math.imul(seed ^ index, 0x45d9f3b); n = Math.imul(n ^ n >>> 16, 0x45d9f3b);
	return ((n ^ n >>> 16) >>> 0) / 4294967295 - .5;
}
// Each copy's offset in user units, copy 1 first: the GPU display reads the same numbers.
export function copierOffsets(effect) { return Array.from({ length: Math.max(0, effect.copies - 1) }, (_, i) => offset(effect, i + 1)); }
function offset(e, i) {
	const angle = e.angle * Math.PI / 180;
	return [i * e.drift * Math.cos(angle) + noise(e.seed, i * 2) * e.jitter * 16,
		i * e.drift * Math.sin(angle) + noise(e.seed, i * 2 + 1) * e.jitter * 16];
}

// The same reach owns filter regions, exported crops and the live content bounds. getBBox()
// omits filter output, so trusting it would cut off a saved stack or smear without touching its recipe.
export function copierBounds(effect, box) {
	if (!effect?.strength) return { ...box };
	const pad = 3 + effect.scatter * 3 + effect.jitter * 9 + effect.smear * 48;
	let minX = box.minX - pad, minY = box.minY - pad, maxX = box.maxX + pad, maxY = box.maxY + pad;
	for (let i = 1; i < effect.copies; i++) {
		const [x, y] = offset(effect, i);
		minX = Math.min(minX, box.minX + x - pad); minY = Math.min(minY, box.minY + y - pad);
		maxX = Math.max(maxX, box.maxX + x + pad); maxY = Math.max(maxY, box.maxY + y + pad);
	}
	return { minX, minY, maxX, maxY };
}

export function copierMarkup(effect, body, box, key, scene = false) {
	const e = admitCopier(effect);
	if (!e) throw new TypeError('Invalid copy machine effect');
	if (!e.strength) return body;
	// Shape ids are admitted by core; encode the key here too, so this writer has no markup door.
	const id = 'rapier-copy-' + Array.from(String(key), c => c.codePointAt(0).toString(16)).join('-');
	const b = copierBounds(e, box), w = b.maxX - b.minX, h = b.maxY - b.minY;
	const region = ' x="' + fmt(b.minX) + '" y="' + fmt(b.minY) + '" width="' + fmt(w) + '" height="' + fmt(h) + '"';
	const blueprint = e.preset === 'blueprint', cyan = e.preset === 'cyan-drift', fax = e.preset === 'fax', news = e.preset === 'newsprint';
	const ink = blueprint ? '#e1edf4' : '#191919';
	const matrix = (input, values, result) => '<feColorMatrix in="' + input + '" type="matrix" values="' + values + '" result="' + result + '"/>';
	const alpha = (input, slope, intercept, result) => '<feComponentTransfer in="' + input + '" result="' + result + '"><feFuncA type="linear" slope="' + fmt(slope) + '" intercept="' + fmt(intercept) + '"/></feComponentTransfer>';
	let filter = '<feTurbulence type="fractalNoise" baseFrequency=".013 .19" numOctaves="2" seed="' + e.seed + '" result="scan"/>' +
		'<feDisplacementMap in="SourceGraphic" in2="scan" scale="' + fmt(e.jitter * 18) + '" xChannelSelector="R" yChannelSelector="G" result="source"/>';
	// Convert luminance into toner coverage, then restore source alpha: transparent RGB never
	// turns into black ink, and the embedded paint's original alpha is still stored untouched.
	filter += matrix('source', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -.2126 -.7152 -.0722 0 1', 'luma') +
		'<feComposite in="luma" in2="source" operator="in" result="coverage"/>';
	const curve = Array.from({ length: 33 }, (_, i) => {
		let v = Math.max(0, Math.min(1, (i / 32 - .5) * e.contrast + .5 - e.exposure * .65));
		if (fax) v = v < .48 ? 0 : 1;
		return fmt(v);
	}).join(' ');
	filter += '<feComponentTransfer in="coverage" result="density"><feFuncA type="table" tableValues="' + curve + '"/></feComponentTransfer>' +
		'<feTurbulence type="fractalNoise" baseFrequency="' + (news ? '.32' : fax ? '.7 .35' : '.83') + '" numOctaves="' + (news || fax ? 1 : 3) + '" seed="' + (e.seed % 100000 + 17) + '" result="tooth"/>' +
		matrix('tooth', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0', 'grain') +
		'<feComposite in="density" in2="grain" operator="arithmetic" k2="1" k3="' + fmt(e.grain * 2) + '" k4="' + fmt(-e.grain * 1.08) + '" result="broken"/>' +
		'<feComposite in="broken" in2="source" operator="in" result="toner"/>' +
		'<feTurbulence type="fractalNoise" baseFrequency=".00001 .025" numOctaves="3" seed="' + (e.seed % 100000 + 29) + '" result="drum"/>' +
		matrix('drum', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ' + fmt(e.banding * 1.6) + ' 0 0 0 ' + fmt(1 - e.banding * 1.5), 'bands') +
		'<feComposite in="toner" in2="bands" operator="in" result="banded"/>' +
		'<feTurbulence type="turbulence" baseFrequency=".001 .38" numOctaves="1" seed="' + (e.seed % 100000 + 43) + '" result="scratches"/>' +
		matrix('scratches', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ' + fmt(e.wear * 3) + ' 0 0 0 ' + fmt(1 - e.wear * 2), 'wear') +
		'<feComposite in="banded" in2="wear" operator="in" result="worn"/>' +
		'<feDisplacementMap in="worn" in2="tooth" scale="' + fmt(e.scatter * 5) + '" xChannelSelector="R" yChannelSelector="G" result="edge"/>' + alpha('edge', e.toner, 0, 'charged');
	if (e.smear) {
		filter += '<feGaussianBlur in="charged" stdDeviation="' + fmt(.6 + e.smear * 1.5) + '" result="drag"/>';
		const tail = [];
		// Integrate exposure along the feed direction: a tapered moving impression, not an
		// axis-aligned soft shadow. These are filter buffers, never extra copies of source data.
		for (let i = 12; i > 0; i--) {
			const reach = e.smear * 42 * i / 12;
			filter += alpha('drag', e.smear * (1 - i / 13) * .12, 0, 'faded') +
				'<feOffset in="faded" dx="' + fmt(Math.cos(e.angle * Math.PI / 180) * reach) + '" dy="' + fmt(Math.sin(e.angle * Math.PI / 180) * reach) + '" result="drag' + i + '"/>';
			tail.push('drag' + i);
		}
		filter += '<feMerge result="impression">' + tail.map(input => '<feMergeNode in="' + input + '"/>').join('') + '<feMergeNode in="charged"/></feMerge>';
	}
	const impression = e.smear ? 'impression' : 'charged';
	filter += '<feFlood flood-color="' + ink + '" result="ink"/><feComposite in="ink" in2="' + impression + '" operator="in" result="original"/>';
	const stack = [];
	for (let i = e.copies - 1; i > 0; i--) {
		const [dx, dy] = offset(e, i), tint = cyan ? (i % 2 ? '#1595b5' : '#8466a2') : ink;
		filter += '<feFlood flood-color="' + tint + '" flood-opacity="' + fmt(Math.pow(1 - e.fade, i) * .8) + '" result="tint"/>' +
			'<feComposite in="tint" in2="' + impression + '" operator="in" result="copy"/>' +
			'<feOffset in="copy" dx="' + fmt(dx) + '" dy="' + fmt(dy) + '" result="copy' + i + '"/>';
		stack.push('copy' + i);
	}
	// Three scales of paper: the sheet's mottling, the long fibres, and the fine tooth shared
	// with toner. All seeds are author data. No animation or fresh randomness on reopening.
	filter += '<feTurbulence type="fractalNoise" baseFrequency=".012" numOctaves="3" seed="' + (e.seed % 100000 + 61) + '" result="sheet"/>' +
		'<feTurbulence type="fractalNoise" baseFrequency=".12 .018" numOctaves="2" seed="' + (e.seed % 100000 + 73) + '" result="fibres"/>' +
		'<feBlend in="sheet" in2="fibres" mode="multiply" result="paperGrain"/>';
	const base = blueprint ? [.075, .19, .34] : [.99, .985 - e.warmth * .05, .97 - e.warmth * .13];
	filter += matrix('paperGrain', base.map(v => [-(.035 + e.grain * .13), 0, 0, 0, v].map(fmt).join(' ')).join(' ') + ' 0 0 0 0 ' + fmt(e.paper), 'paper');
	const rim = Math.min(w, h) * .04;
	filter += '<feFlood x="' + fmt(b.minX + rim) + '" y="' + fmt(b.minY + rim) + '" width="' + fmt(w - rim * 2) + '" height="' + fmt(h - rim * 2) + '" flood-color="#ffffff" result="bed"/>' +
		'<feGaussianBlur in="bed" stdDeviation="' + fmt(Math.max(.5, rim * .7)) + '" result="bedSoft"/>' +
		'<feComposite in="paper" in2="bedSoft" operator="out" result="rim"/>' +
		'<feFlood flood-color="#30291e" flood-opacity="' + fmt(e.edge * .75) + '" result="shadow"/>' +
		'<feComposite in="shadow" in2="rim" operator="in" result="shade"/>' +
		'<feMerge result="print"><feMergeNode in="paper"/><feMergeNode in="shade"/>' + stack.map(s => '<feMergeNode in="' + s + '"/>').join('') + '<feMergeNode in="original"/></feMerge>';
	if (e.strength < 1) filter += alpha('print', e.strength, 0, 'mixed') + alpha('SourceGraphic', 1 - e.strength, 0, 'under') + '<feComposite in="mixed" in2="under" operator="arithmetic" k2="1" k3="1"/>';
	return '<defs><filter id="' + id + '" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse"' + region + ' color-interpolation-filters="sRGB">' + filter + '</filter></defs>' +
		'<g data-rapier-effect="copier"' + (scene ? ' data-rapier-effect-scene=""' : '') + ' data-effect-filter="' + id + '" filter="url(#' + id + ')">' + body + '</g>';
}
