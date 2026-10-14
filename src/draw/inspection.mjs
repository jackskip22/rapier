// SPDX-License-Identifier: AGPL-3.0-only
import {dataImage, decodeDataImageBytes, imageDimensions} from '../images/assets.mjs';
import {_rapierDrawReadRecipeFromSVGText} from './core.mjs';
import {createPaintPNGCodec} from './paint-png.mjs';

export async function inspectDrawingSource(url, {kind = 'recipe'} = {}) {
	if (dataImage(url)?.codec !== 'image/svg+xml') return null;
	const {bytes} = decodeDataImageBytes(url), size = imageDimensions(bytes, 'image/svg+xml');
	const text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
	if (kind === 'paint' && (!text.includes('data-rapier-paint=') || !text.includes('data:image/png;'))) return null;
	if (kind === 'liquid' && !text.includes('data-rapier-effect="liquid"')) return null;
	const letters = new Map(), stills = new Map();
	const recipe = _rapierDrawReadRecipeFromSVGText(text, {
		letter: (set, letter, path) => { const key = set + ':' + letter; if (!letters.has(key)) letters.set(key, {set, letter, path}); },
		still: (key, href) => stills.set(key, {key, href}),
	});
	if (!recipe) return null;
	let paintPixels;
	if (kind === 'paint') {
		const waiting = recipe.shapes.filter(shape => shape.recognized === 'paint' && shape.raster?.startsWith('data:image/png;'));
		if (!waiting.length) return null;
		const png = createPaintPNGCodec(); paintPixels = [];
		for (const shape of waiting) {
			if (!png.isOwn(shape.raster)) return null;
			const pixels = await png.decode(shape.raster).catch(() => null);
			if (!pixels) return null;
			paintPixels.push({id: shape.id, raster: shape.raster, ...pixels});
		}
	}
	const resources = letters.size || stills.size ? {letters: [...letters.values()], stills: [...stills.values()]} : null;
	return {recipe, size, ...(resources ? {resources} : {}), ...(kind === 'recipe' ? {} : {text}), ...(paintPixels ? {paintPixels} : {})};
}
