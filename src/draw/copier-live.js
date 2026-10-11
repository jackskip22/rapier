// SPDX-License-Identifier: AGPL-3.0-only
// Copy machine in Draw's display: the GPU draws each copier group once per change, in the group's
// own place, and the camera moves that picture. The file keeps its SVG filter. Without WebGL2,
// with too many pixels, during Original or while painting, the filter draws as before.
const _rapierCopier = { live: new Map(), timer: 0 };

function _rapierDrawCopierEffect(key) {
	const state = _rapierDrawState, hex = String(key || '').replace(/^rapier-copy-/, '');
	let text;
	try { text = String.fromCodePoint(...hex.split('-').map(part => parseInt(part, 16))); } catch (_) { return null; }
	const effect = text === 'canvas' ? state.recipe?.effect : state.recipe?.shapes.find(shape => shape.id === text.slice(text.indexOf(':') + 1))?.effect;
	return effect?.type === 'copier' ? effect : null;
}
// True when Draw shows Copy machine through the GPU, so a held slider needs no raster preview.
function _rapierDrawCopierLive() { return !!globalThis.RapierDrawCopier && typeof WebGL2RenderingContext === 'function' && !_rapierCopier.failed; }
function _rapierDrawCopierDrop(live) {
	_rapierCopier.live.delete(live.key);
	live.mount?.remove();
	if (live.group) { live.group.style.removeProperty('filter'); live.group.style.removeProperty('visibility'); }
	try { live.gpu?.destroy(); } catch (_) {}
	live.dropped = true;
}
function _rapierDrawCopierStop() { for (const live of [..._rapierCopier.live.values()]) _rapierDrawCopierDrop(live); clearTimeout(_rapierCopier.timer); }
// The filter draws this group again: Original, painting, no GPU or too large a picture.
function _rapierDrawCopierPlain(live) {
	if (live.mount) live.mount.style.display = 'none';
	live.group.style.removeProperty('filter'); live.group.style.removeProperty('visibility');
}
async function _rapierDrawCopierRender(live, ticket) {
	const { region, width, height, markup } = ticket;
	try {
		if (ticket.source !== live.sourceDrawn) {
			const view = [region.minX, region.minY, region.maxX - region.minX, region.maxY - region.minY].map(n => _rapierDrawFmt(n)).join(' ');
			const defs = _rapierDrawState.svgRoot?.querySelector('defs')?.innerHTML || '';
			const svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + width + '" height="' + height + '" viewBox="' + view +
				'" preserveAspectRatio="none" color="' + _rapierDrawShapeInk() + '"><defs>' + defs + '</defs>' + _rapierDrawDisplayMarkup(markup) + '</svg>';
			const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
			try {
				const img = new Image();
				img.src = url;
				await img.decode();
				if (live.dropped || live.ticket !== ticket) return;
				live.gpu.resize(width, height); live.gpu.setSource(img);
			} finally { URL.revokeObjectURL(url); }
			live.sourceDrawn = ticket.source;
		}
		if (live.dropped || live.ticket !== ticket) return;
		live.gpu.render(ticket.effect, region);
		live.drawn = ticket; _rapierDrawCopierShow(live);
	} catch (error) {
		console.warn('[rapier] copy machine GPU', error);
		_rapierCopier.failed = true; _rapierDrawCopierStop(); _rapierDrawRenderAll();
	}
}
function _rapierDrawCopierShow(live) {
	if (live.plain || !live.drawn) return;
	const { region } = live.drawn;
	for (const [name, value] of [['x', region.minX], ['y', region.minY], ['width', region.maxX - region.minX], ['height', region.maxY - region.minY]]) live.mount.setAttribute(name, _rapierDrawFmt(value));
	live.mount.style.display = 'inline'; live.mount.style.visibility = 'visible';
}
function _rapierDrawCopierSync() {
	const state = _rapierDrawState;
	if (!state.open || !state.svg || !_rapierDrawCopierLive()) { _rapierDrawCopierStop(); return; }
	const groups = [...state.svg.querySelectorAll('[data-rapier-effect="copier"]')], keep = new Set();
	const plain = !!state.effectsCompare || ['paint', 'water'].includes(_rapierDrawTool()) || groups.length > 8;
	for (const group of groups) {
		const key = group.dataset.effectFilter, effect = _rapierDrawCopierEffect(key), filter = key && state.svg.querySelector('filter[id="' + CSS.escape(key) + '"]');
		if (!effect || !filter || keep.has(key)) continue;
		keep.add(key);
		let live = _rapierCopier.live.get(key);
		if (!live) {
			const canvas = document.createElement('canvas'), gpu = globalThis.RapierDrawCopier.CopierGPU.create(canvas);
			if (!gpu) { _rapierCopier.failed = true; _rapierDrawCopierStop(); return; }
			canvas.setAttribute('aria-hidden', 'true'); canvas.style.cssText = 'display:block;width:100%;height:100%';
			// A lost context leaves a blank canvas: the filter draws again for the rest of the session.
			canvas.addEventListener('webglcontextlost', () => { _rapierCopier.failed = true; _rapierDrawCopierStop(); if (_rapierDrawState.open) _rapierDrawRenderAll(); }, { once: true });
			live = { key, canvas, gpu };
			_rapierCopier.live.set(key, live);
		}
		live.group = group;
		if (!live.mount || live.mount.parentNode !== group) {
			live.mount?.remove();
			live.mount = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
			live.mount.setAttribute('data-rapier-copier-live', ''); live.mount.style.display = 'none';
			live.mount.append(live.canvas); group.append(live.mount);
		}
		const number = name => Number(filter.getAttribute(name));
		const region = { minX: number('x'), minY: number('y'), maxX: number('x') + number('width'), maxY: number('y') + number('height') };
		// A held slider draws at half resolution, as the filter preview did; release draws it whole.
		const m = group.getScreenCTM(), scale = Math.abs(m?.a || 1) * Math.min(devicePixelRatio || 1, 3) * (state.effectsGesture ? .5 : 1);
		const width = Math.max(1, Math.ceil((region.maxX - region.minX) * scale)), height = Math.max(1, Math.ceil((region.maxY - region.minY) * scale));
		live.plain = plain || width * height > globalThis.RapierDrawCopier.COPIER_GPU_PIXELS;
		if (live.plain) { _rapierDrawCopierPlain(live); continue; }
		// The GPU picture stands for the group: the filter and the source stay out of the paint.
		group.style.filter = 'none'; group.style.visibility = 'hidden';
		const markup = [...group.childNodes].filter(node => node !== live.mount).map(node => node.outerHTML ?? '').join('');
		const source = markup.length + ':' + width + 'x' + height + ':' + markup;
		const drawn = live.drawn;
		// A camera that only zoomed a little keeps the picture it has; the next settled view draws again.
		const scaled = drawn && drawn.markup === markup && Math.abs(Math.log(width / drawn.width)) < .7 && JSON.stringify(drawn.effect) === JSON.stringify(effect) && JSON.stringify(drawn.region) === JSON.stringify(region);
		if (scaled && drawn.width === width) { _rapierDrawCopierShow(live); continue; }
		if (scaled) { _rapierDrawCopierShow(live); clearTimeout(_rapierCopier.timer); _rapierCopier.timer = setTimeout(() => _rapierDrawCopierSync(), 220); continue; }
		const ticket = { effect, region, width, height, markup, source: source };
		live.ticket = ticket;
		void _rapierDrawCopierRender(live, ticket);
	}
	for (const live of [..._rapierCopier.live.values()]) if (!keep.has(live.key)) _rapierDrawCopierDrop(live);
}
