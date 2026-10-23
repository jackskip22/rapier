// SPDX-License-Identifier: AGPL-3.0-only
import {_rapierDrawAdmitRecipe, _rapierDrawBuildSVG, _rapierDrawShapeMarkup, refractionSourceShapes} from './core.mjs';
import {renderRefraction} from './refraction-render.mjs';
import {hasRefraction, refractionRecipeKey, currentRefractionRenditions} from './refraction-rendition.mjs';
import {createPaintPNGCodec} from './paint-png.mjs';
import {decodePaintRaster, rasterizeSVG} from '../images/paint-raster.mjs';

export {hasRefraction, refractionRecipeKey};
const png = createPaintPNGCodec(), ns = 'http://www.w3.org/2000/svg';
const check = options => options.signal?.throwIfAborted();
const fail = message => Object.assign(new Error(message), {code: 'drawing_work_limit'});
const parse = svg => {
	const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
	if (document.querySelector('parsererror') || document.documentElement.localName !== 'svg') throw new Error('The refracted source is not a drawing.');
	return document.documentElement;
};
const scopeNodes = root => [...root.querySelectorAll('[data-rapier-effect="refraction"][data-refraction-scope]')];
const effectFor = (recipe, scope) => scope === 'canvas' ? recipe.effect : recipe.shapes.find(shape => shape.id === scope.slice(scope.indexOf(':') + 1))?.effect;

function grid(node, ratio) {
	const box = (node.getAttribute('data-refraction-box') || '').split(' ').map(Number);
	if (box.length !== 4 || !box.every(Number.isFinite)) throw new Error('The refracted source has no frame.');
	const [left, top, right, bottom] = box;
	const x = Math.floor(left), y = Math.floor(top), w = Math.max(1, Math.ceil(right) - x), h = Math.max(1, Math.ceil(bottom) - y);
	const width = Math.max(1, Math.ceil(w * ratio)), height = Math.max(1, Math.ceil(h * ratio));
	if (width > 16384 || height > 16384 || width * height > png.pixelLimit) throw fail('This refracted picture exceeds the full-quality pixel limit.');
	return {view: {x, y, w, h}, width, height};
}

function imageNode(root, url, frame) {
	const image = root.ownerDocument.createElementNS(ns, 'image');
	for (const [key, value] of Object.entries({x: frame.view.x, y: frame.view.y, width: frame.view.w, height: frame.view.h, preserveAspectRatio: 'none', href: url})) image.setAttribute(key, String(value));
	return image;
}

async function readable(root, options) {
	const twins = new Map();
	for (const image of root.querySelectorAll('image')) {
		const url = image.getAttribute('href') || image.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
		if (!url?.startsWith('data:image/jxl;base64,')) continue;
		check(options);
		let shown = twins.get(url) || options.displayRaster?.(url);
		if (!shown) {
			const pixels = await decodePaintRaster(url, options);
			if (!pixels) {
				const environment = globalThis.RapierPlatform?.environment;
				throw new Error((environment?.here || 'This browser') + ' cannot decode the editable JPEG XL source. ' +
					(environment?.updateEngine || 'Open it in a browser with JPEG XL support.'));
			}
			shown = png.encode(pixels); twins.set(url, shown);
		}
		image.setAttribute('href', shown);
	}
}

async function raster(svg, width, height, options) {
	check(options);
	const root = parse(svg);
	root.setAttribute('width', String(width)); root.setAttribute('height', String(height));
	await readable(root, options);
	const canvas = await rasterizeSVG(root.outerHTML, width, height, options);
	const pixels = canvas.getContext('2d').getImageData(0, 0, width, height);
	return {width, height, data: pixels.data, canvas};
}

function sourceSVG(root, body, frame) {
	const defs = [...root.querySelectorAll('defs')].filter(node => !node.closest('[data-rapier-effect]') || node.querySelector('style[data-rapier-font]')).map(node => node.outerHTML).join('');
	return '<svg xmlns="' + ns + '" color="#121212" viewBox="' + [frame.view.x, frame.view.y, frame.view.w, frame.view.h].join(' ') + '">' + defs + body + '</svg>';
}

async function sourcePixels(root, body, frame, options) {
	const svg = sourceSVG(root, body, frame), cache = options.cache;
	const key = frame.width + 'x' + frame.height + ':' + svg;
	let pixels = cache?.get(key);
	if (!pixels) {
		pixels = await raster(svg, frame.width, frame.height, options);
		if (cache) {
			if (cache.size >= 4) cache.delete(cache.keys().next().value);
			cache.set(key, pixels);
		}
	}
	return pixels;
}

async function auxiliary(root, recipe, choice, frame, options) {
	if (!choice || ['source', 'none'].includes(choice)) return null;
	const shapes = refractionSourceShapes(recipe, choice);
	if (!shapes?.length) throw new Error('The effect source no longer exists.');
	const body = shapes.map(shape => _rapierDrawShapeMarkup({...shape, effect: undefined}, recipe, {sourceOnly: true})).join('');
	return sourcePixels(root, body, frame, options);
}

async function renderScopes(root, recipe, options = {}) {
	const ratio = options.pixelRatio ?? 1, renditions = [], key = options.key || refractionRecipeKey(recipe);
	const nodes = scopeNodes(root).reverse();
	for (let at = 0; at < nodes.length; at++) {
		check(options);
		const node = nodes[at], scope = node.getAttribute('data-refraction-scope'), effect = effectFor(recipe, scope);
		const source = [...node.querySelectorAll('[data-refraction-source]')].find(source => source.closest('[data-rapier-effect="refraction"]') === node);
		if (!source || effect?.type !== 'refraction') throw new Error('The effect and its editable source disagree.');
		const frame = grid(node, ratio), pixels = await sourcePixels(root, source.innerHTML, frame, options);
		const lens = await auxiliary(root, recipe, effect.lens, frame, options);
		const matte = effect.matteSource === 'source' ? pixels : await auxiliary(root, recipe, effect.matteSource, frame, options);
		const result = await renderRefraction(pixels, effect, {...options, pixelRatio: ratio, lens, matte,
			onProgress: () => options.progress?.((at + .25) / Math.max(1, nodes.length))});
		check(options);
		const shown = png.encode(result);
		let jxl;
		if (!options.preview) {
			const input = {width: result.width, height: result.height, data: new Uint8Array(result.data), options: {lossless: true}};
			const work = {signal: options.signal, progress: fraction => options.progress?.((at + .5 + fraction * .5) / nodes.length)};
			const out = options.encodeJxl ? await options.encodeJxl(input, work) : await globalThis.RapierEmbeddedImages.codec('encode', input, work);
			check(options); jxl = 'data:image/jxl;base64,' + (out.bytes || out).toBase64();
		}
		renditions.push({scope, key, width: result.width, height: result.height, view: frame.view, png: shown, ...(jxl ? {jxl} : {})});
		node.replaceChildren(imageNode(root, shown, frame));
		options.onScope?.({scope, ...result});
		options.progress?.((at + 1) / Math.max(1, nodes.length));
	}
	return renditions.reverse();
}

export async function renderSVG(svg, recipe, options = {}) {
	const root = parse(svg);
	const view = root.getAttribute('viewBox').split(/\s+/).map(Number), width = options.width || Math.ceil(view[2]), height = options.height || Math.ceil(view[3]);
	if (width * height > png.pixelLimit) throw fail('The preview exceeds its pixel limit.');
	let renderer = 'identity';
	const key = refractionRecipeKey(recipe), previewScale = options.previewScale === .5 ? .5 : 1;
	const pixelRatio = Math.min(1, width / view[2]) * previewScale;
	await renderScopes(root, recipe, {...options, key, preview: true, pixelRatio, onScope: result => { renderer = result.renderer; options.onScope?.(result); }});
	const result = await raster(root.outerHTML, width, height, options);
	return {...result, renderer, key, previewScale, pixelRatio};
}

export async function prepare(input, options = {}) {
	check(options);
	const recipe = _rapierDrawAdmitRecipe(input, true);
	if (!recipe) throw new Error('The complete drawing could not be prepared.');
	if (!hasRefraction(recipe)) return recipe;
	const root = parse(_rapierDrawBuildSVG(recipe, undefined, true, {sourceOnly: true}));
	const scopes = scopeNodes(root).map(node => node.getAttribute('data-refraction-scope'));
	const kept = currentRefractionRenditions(recipe);
	if (kept.length === scopes.length && scopes.every(scope => kept.some(row => row.scope === scope))) return recipe;
	const renditions = await renderScopes(root, recipe, {...options, preview: false, backend: 'webgpu', pixelRatio: 1});
	const result = _rapierDrawAdmitRecipe({...recipe, renditions}, true);
	if (!result || result.renditions?.length !== renditions.length && renditions.length) throw new Error('The finished effect could not be kept beside its source.');
	return result;
}
