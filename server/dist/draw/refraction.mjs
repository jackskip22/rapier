// SPDX-License-Identifier: AGPL-3.0-only
import {refractionRenditionMarkup} from './refraction-rendition.mjs';
const DEFAULTS = Object.freeze({ strength: 1, amount: 3000, blur: 20, bump: 4, angle: 0,
	amountX: 1, amountY: 1, red: .5, blue: 1, samples: 100, edge: 'reflect', adaptive: true, whiteBalance: true,
	crop: true, lens: 'source', matteSource: 'none' });
const RANGES = Object.freeze({ strength: [0, 1], amount: [-10000, 10000], blur: [0, 80],
	bump: [0, 20], angle: [-180, 180], amountX: [0, 4], amountY: [0, 4], red: [-2, 2],
	blue: [-2, 2], samples: [3, 100] });
const KEYS = new Set(['type', 'version', 'preset', ...Object.keys(DEFAULTS)]);
const SOURCE = /^shape:([A-Za-z0-9_-]{1,64})$/;
const SOURCE_KEYS = ['lens', 'matteSource'];

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
		Object.keys(raw).some(key => !KEYS.has(key)) || !['reflect', 'tile', 'transparent', 'clamp'].includes(raw.edge)) return null;
	if (typeof raw.adaptive !== 'boolean' || typeof raw.whiteBalance !== 'boolean' || typeof raw.crop !== 'boolean') return null;
	for (const key of SOURCE_KEYS) if (typeof raw[key] !== 'string' || raw[key] !== 'source' && !(key === 'matteSource' && raw[key] === 'none') && !SOURCE.test(raw[key])) return null;
	const out = refractionPreset(raw.preset);
	if (!out) return null;
	for (const [key, [min, max]] of Object.entries(RANGES)) {
		const value = raw[key];
		if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || key === 'samples' && !Number.isInteger(value)) return null;
		out[key] = value;
	}
	out.edge = raw.edge;
	out.adaptive = raw.adaptive; out.whiteBalance = raw.whiteBalance; out.crop = raw.crop;
	for (const key of SOURCE_KEYS) out[key] = raw[key];
	return out;
}

export function refractionSourceReferences(effect) {
	if (effect?.type !== 'refraction') return [];
	return SOURCE_KEYS.flatMap(key => {
		const match = typeof effect[key] === 'string' && SOURCE.exec(effect[key]);
		return match ? [{key, id: match[1]}] : [];
	});
}

export function remapRefractionSources(effect, ids) {
	let out = effect;
	for (const {key, id} of refractionSourceReferences(effect)) if (ids.has(id)) {
		const next = ids.get(id), value = next == null ? DEFAULTS[key] : 'shape:' + next;
		if (value !== effect[key]) out = {...out, [key]: value};
	}
	return out;
}

export function remapRefractionRecipeSources(recipe, ids) {
	if (recipe.effect) recipe.effect = remapRefractionSources(recipe.effect, ids);
	for (const shape of recipe.shapes) if (shape?.effect) shape.effect = remapRefractionSources(shape.effect, ids);
	return recipe;
}

export function refractionBounds(_effect, box) { return { ...box }; }

const fmt = n => String(Math.round(n * 1e7) / 1e7);

export function refractionMarkup(effect, body, box, key, scene = false, renderOptions = {}) {
	const e = admitRefraction(effect);
	if (!e) throw new TypeError('Invalid refracted light effect');
	if (!e.strength || !e.amount || !e.bump || !e.amountX && !e.amountY || !e.red && !e.blue) return body;
	const scope = String(key).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
	const sourceMark = scene ? ' data-rapier-effect-scene=""' : '';
	const plainWrapper = '<g data-rapier-effect="refraction" data-refraction-scope="' + scope + '" data-refraction-box="' + [box.minX, box.minY, box.maxX, box.maxY].map(fmt).join(' ') + '">';
	if (renderOptions.sourceOnly) return plainWrapper + '<g data-refraction-source=""' + sourceMark + '>' + body + '</g></g>';
	if (renderOptions.rendition) return plainWrapper + refractionRenditionMarkup(renderOptions.rendition, '<g' + sourceMark + '>' + body + '</g>') + '</g>';
	return plainWrapper + '<g data-refraction-source=""' + sourceMark + '>' + body + '</g></g>';
}
