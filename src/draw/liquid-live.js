// SPDX-License-Identifier: AGPL-3.0-only
// Liquid light in Draw: each liquid group shows a live GPU canvas in its own z-slot, and Done
// writes the deterministic still. Only the still becomes drawing data.
// tier: how many times the loop has shrunk because this device could not hold 30 frames a second; it lasts until the page reloads.
const _rapierLiquid = { live: new Map(), frame: 0, last: 0, watcher: null, bound: false, tier: 0, gaps: [] };

// The effect a liquid group names: the drawing's, or one object's or painting's.
function _rapierDrawLiquidEffect(key) {
	const state = _rapierDrawState, hex = String(key || '').replace(/^rapier-liquid-/, '');
	let text;
	try { text = String.fromCodePoint(...hex.split('-').map(part => parseInt(part, 16))); } catch (_) { return null; }
	const effect = text === 'canvas' ? state.recipe?.effect : state.recipe?.shapes.find(shape => shape.id === text.slice(text.indexOf(':') + 1))?.effect;
	return effect?.type === 'liquid' ? effect : null;
}
// The picture under one liquid group, rasterized at its own frame.
async function _rapierDrawLiquidRaster(markup, frame, width, height, defs = _rapierDrawState.svgRoot?.querySelector('defs')?.innerHTML || '') {
	const view = [frame.x, frame.y, frame.w, frame.h].map(n => _rapierDrawFmt(n)).join(' ');
	const svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + width + '" height="' + height + '" viewBox="' + view +
		'" preserveAspectRatio="none" color="' + _rapierDrawShapeInk() + '"><defs>' + defs + '</defs>' + markup + '</svg>';
	const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
	try {
		const img = new Image();
		img.src = url;
		await img.decode();
		const canvas = document.createElement('canvas');
		canvas.width = width; canvas.height = height;
		const context = canvas.getContext('2d', { willReadFrequently: true });
		context.drawImage(img, 0, 0, width, height);
		return context.getImageData(0, 0, width, height).data;
	} finally { URL.revokeObjectURL(url); }
}
function _rapierDrawLiquidWatch() {
	if (_rapierLiquid.bound) return;
	_rapierLiquid.bound = true;
	document.addEventListener('visibilitychange', () => _rapierDrawLiquidRun());
	matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => { for (const live of _rapierLiquid.live.values()) live.settled = false; _rapierDrawLiquidRun(); });
	_rapierLiquid.watcher = new IntersectionObserver(entries => {
		for (const entry of entries) for (const live of _rapierLiquid.live.values()) if (live.canvas === entry.target) live.visible = entry.isIntersecting;
		_rapierDrawLiquidRun();
	});
}
function _rapierDrawLiquidDrop(live) {
	_rapierLiquid.live.delete(live.key);
	_rapierLiquid.watcher?.unobserve(live.canvas);
	live.mount?.remove();
	try { live.renderer?.destroy(); } catch (_) {}
	live.renderer = null; live.dropped = true;
}
function _rapierDrawLiquidStop() {
	for (const live of [..._rapierLiquid.live.values()]) _rapierDrawLiquidDrop(live);
	if (_rapierLiquid.frame) cancelAnimationFrame(_rapierLiquid.frame);
	_rapierLiquid.frame = 0; _rapierLiquid.last = 0;
}
async function _rapierDrawLiquidStart(live) {
	try {
		const renderer = await globalThis.RapierDrawLiquid?.createLiquidRenderer(live.canvas);
		if (live.dropped) { renderer?.destroy(); return; }
		// A lost GPU leaves the still in place of the fluid: the loop sees renderer.lost.
		if (renderer) { live.renderer = renderer; live.canvas.dataset.liquidRenderer = renderer.kind; } else live.failed = true;
	} catch (error) { live.failed = true; console.warn('[rapier] liquid light', error); }
	_rapierDrawLiquidSync();
}
// Reads the picture again after the source settles, so a drag does not rasterize every frame.
function _rapierDrawLiquidSource(live) {
	clearTimeout(live.sourceTimer);
	live.sourceTimer = setTimeout(async () => {
		const signature = live.signature, size = live.size;
		if (!live.renderer || !size || live.dropped) return;
		try {
			const rgba = await _rapierDrawLiquidRaster(live.markup, live.frame, size.w, size.h);
			if (live.dropped || live.signature !== signature || live.size !== size) return;
			live.renderer.setSource(rgba, size.w, size.h); live.settled = false; live.ready = true;
			_rapierDrawLiquidShow(live); _rapierDrawLiquidRun();
		} catch (error) { console.warn('[rapier] liquid light source', error); }
	}, live.ready ? 120 : 0);
}
// The live canvas when it runs; otherwise the still, or the source itself.
function _rapierDrawLiquidShow(live) {
	const state = _rapierDrawState, group = live.group, source = group.querySelector(':scope > [data-rapier-liquid-source]'), still = group.querySelector(':scope > [data-rapier-liquid-still]');
	// Original compares with the source; painting needs the source it paints on.
	live.plain = !!state.effectsCompare || ['paint', 'water'].includes(_rapierDrawTool());
	const running = !live.plain && !!live.renderer && !!live.ready, showStill = !live.plain && !running && !!still;
	if (source) source.style.display = running || showStill ? 'none' : 'inline';
	if (still) still.style.display = showStill ? 'inline' : 'none';
	if (live.mount) live.mount.style.display = running ? 'inline' : 'none';
}
function _rapierDrawLiquidSync() {
	const state = _rapierDrawState;
	if (!state.open || !state.svg) { _rapierDrawLiquidStop(); return; }
	_rapierDrawLiquidWatch();
	const keep = new Set(), groups = [...state.svg.querySelectorAll('[data-rapier-effect="liquid"]')];
	// Each group's frame in CSS pixels, from the drawing's own transform to the screen.
	const shown = groups.map(group => {
		const frame = (group.dataset.liquidFrame || '0 0 0 0').split(' ').map(Number), m = group.getScreenCTM();
		return { group, rect: { width: Math.abs((frame[2] - frame[0]) * (m?.a || 1)), height: Math.abs((frame[3] - frame[1]) * (m?.d || 1)) } };
	});
	let area = 0;
	for (const { rect } of shown) area += rect.width * rect.height;
	for (const { group, rect } of shown) {
		const key = group.dataset.effectFilter, effect = _rapierDrawLiquidEffect(key), frameText = group.dataset.liquidFrame;
		if (!effect || !frameText || keep.has(key)) continue;
		keep.add(key);
		const [x0, y0, x1, y1] = frameText.split(' ').map(Number);
		let live = _rapierLiquid.live.get(key);
		if (!live) {
			live = { key, canvas: document.createElement('canvas'), visible: true };
			live.canvas.setAttribute('aria-hidden', 'true');
			_rapierLiquid.live.set(key, live); _rapierLiquid.watcher.observe(live.canvas);
			void _rapierDrawLiquidStart(live);
		}
		live.group = group; live.effect = effect; live.frame = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
		if (!live.failed) {
			// The canvas lives in the group, so the liquid keeps the source's place in the paint order.
			if (!live.mount || live.mount.parentNode !== group) {
				live.mount?.remove();
				live.mount = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
				live.mount.setAttribute('data-rapier-liquid-live', '');
				group.append(live.mount);
			}
			for (const [name, value] of [['x', x0], ['y', y0], ['width', x1 - x0], ['height', y1 - y0]]) live.mount.setAttribute(name, _rapierDrawFmt(value));
			if (live.canvas.parentNode !== live.mount) { live.canvas.style.cssText = 'display:block;width:100%;height:100%'; live.mount.append(live.canvas); }
		}
		if (live.renderer) {
			live.renderer.setEffect(effect);
			// A share of the pixel budget in proportion to what this group covers on screen.
			const share = area > 0 ? rect.width * rect.height / area : 1, ratio = Math.min(devicePixelRatio || 1, 3) * Math.sqrt(share);
			const sizes = globalThis.RapierDrawLiquid.liquidSizes(Math.max(1, rect.width), Math.max(1, rect.height), ratio, .78 ** _rapierLiquid.tier);
			const changed = !live.size || Math.abs(Math.log(sizes.w / live.size.w)) > .4;
			if (changed) { live.renderer.resize(sizes.w, sizes.h, sizes.outW, sizes.outH); live.size = sizes; live.ready = false; }
			const source = group.querySelector(':scope > [data-rapier-liquid-source]'), markup = source ? source.innerHTML : '';
			const signature = markup.length + ':' + frameText + ':' + markup;
			if (changed || signature !== live.signature) { live.signature = signature; live.markup = markup; _rapierDrawLiquidSource(live); }
		}
		_rapierDrawLiquidShow(live);
	}
	for (const live of [..._rapierLiquid.live.values()]) if (!keep.has(live.key)) _rapierDrawLiquidDrop(live);
	_rapierDrawLiquidRun();
	_rapierDrawLiquidPrefetch();
}
// One animation loop for every visible group. It sleeps when nothing on screen moves.
function _rapierDrawLiquidRun() {
	if (_rapierLiquid.frame) return;
	const tick = now => {
		_rapierLiquid.frame = 0;
		if (!_rapierDrawState.open) { _rapierDrawLiquidStop(); return; }
		const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, gap = _rapierLiquid.last ? now - _rapierLiquid.last : 0, dt = gap ? gap / 1000 : 1 / 60;
		let moving = false;
		for (const live of _rapierLiquid.live.values()) {
			if (!live.renderer || !live.ready || live.plain) continue;
			if (live.renderer.lost) { live.renderer = null; live.failed = true; _rapierDrawLiquidShow(live); continue; }
			try {
				if (reduced) { if (!live.settled) { live.renderer.settle(live.effect.time); live.settled = true; } continue; }
				if (document.hidden || !live.visible) continue;
				live.renderer.frame(dt); moving = true;
			} catch (error) { console.warn('[rapier] liquid light frame', error); _rapierDrawLiquidDrop(live); }
		}
		_rapierLiquid.last = moving ? now : 0;
		if (moving) { _rapierLiquid.frame = requestAnimationFrame(tick); _rapierDrawLiquidGovern(gap); }
	};
	_rapierLiquid.frame = requestAnimationFrame(tick);
}

// A device that cannot hold 30 frames a second gets a smaller loop: each step takes 22% off each side of the picture and the shade.
// A window is 40 frames; its first 10 settle after a start or a resize, and its median must exceed 40 ms to count. A pause, a stall
// or a gesture on the canvas or the panel starts the window again, so only the loop's own pace is judged. Steps never reverse within a page's life.
function _rapierDrawLiquidGovern(gap) {
	const state = _rapierDrawState, gaps = _rapierLiquid.gaps;
	if (!gap || gap > 1500 || state.gesture || state.effectsGesture || state.effectsPendingChange || [..._rapierLiquid.live.values()].some(live => !live.ready)) { gaps.length = 0; return; }
	gaps.push(gap);
	if (gaps.length < 40) return;
	const median = gaps.slice(10).sort((a, b) => a - b)[15];
	gaps.length = 0;
	if (median <= 40 || _rapierLiquid.tier >= 3) return;
	_rapierLiquid.tier++;
	for (const live of _rapierLiquid.live.values()) { live.size = null; live.canvas.dataset.liquidTier = String(_rapierLiquid.tier); }
	_rapierDrawLiquidSync();
}

// ---- The still Done writes: the reference renderer over the saved source, as JPEG XL. ----

// The reference steps in a worker; the page's own thread only when no worker starts.
function _rapierDrawLiquidSteps(effect, rgba, width, height, work) {
	const source = globalThis.RapierDrawLiquidWorker?.workerSource;
	if (!_rapierLiquid.worker && source && !_rapierLiquid.noWorker) {
		try {
			const url = URL.createObjectURL(new Blob([source()], { type: 'text/javascript' }));
			_rapierLiquid.worker = new Worker(url); URL.revokeObjectURL(url);
			_rapierLiquid.calls = new Map(); _rapierLiquid.call = 0;
			_rapierLiquid.worker.onmessage = ({ data }) => {
				const call = _rapierLiquid.calls.get(data.id);
				if (!call) return;
				if (data.progress != null) { call.work?.progress?.(data.progress * .9); return; }
				_rapierLiquid.calls.delete(data.id);
				if (data.pixels) call.resolve(data.pixels); else call.reject(new Error(data.error || 'Liquid light still failed'));
			};
		} catch (_) { _rapierLiquid.noWorker = true; }
	}
	if (_rapierLiquid.worker) return new Promise((resolve, reject) => {
		const id = ++_rapierLiquid.call;
		_rapierLiquid.calls.set(id, { resolve, reject, work });
		_rapierLiquid.worker.postMessage({ id, effect, rgba, width, height }, [rgba.buffer]);
	});
	return (async () => {
		const steps = globalThis.RapierDrawCore.liquidStillSteps(effect, rgba, width, height);
		let next = steps.next(), last = performance.now();
		while (!next.done) {
			work?.progress?.(next.value * .9);
			if (performance.now() - last > 24) { await new Promise(resolve => setTimeout(resolve, 0)); last = performance.now(); }
			next = steps.next();
		}
		return next.value;
	})();
}
async function _rapierDrawLiquidStill(job, work, defs) {
	const core = globalThis.RapierDrawCore, { width, height } = core.liquidStillSize(job.box);
	const frame = { x: job.box.minX, y: job.box.minY, w: job.box.maxX - job.box.minX, h: job.box.maxY - job.box.minY };
	// Display twins carry the same pixels as the kept paint, in a form every browser decodes.
	const rgba = new Uint8ClampedArray(await _rapierDrawLiquidRaster(_rapierDrawDisplayMarkup(job.body), frame, width, height, defs));
	if (work?.signal?.aborted) throw Object.assign(new Error('Saving cancelled'), { code: 'DRAW_KEEP_GIVEN_UP' });
	const pixels = await _rapierDrawLiquidSteps(job.effect, rgba, width, height, work);
	const out = await globalThis.RapierEmbeddedImages.codec('encode', { width, height, data: new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength), options: { lossless: false, quality: 90 } });
	core.liquidStillPut(job.key, 'data:image/jxl;base64,' + RapierBundleIO.toBase64(out.bytes || out));
}
// Every still the drawing's saved form needs, rendered before it is written.
async function _rapierDrawLiquidStills(recipe, work = null, defs = undefined) {
	const core = globalThis.RapierDrawCore;
	if (recipe?.effect?.type !== 'liquid' && !recipe?.shapes?.some(shape => shape.effect?.type === 'liquid')) return;
	// The writer names the stills it lacks; the same recipe then finds each one.
	core.liquidStillsWanted();
	_rapierDrawBuildSVG(recipe, undefined, true);
	const jobs = core.liquidStillsWanted().filter(job => !core.liquidStillHas(job.key));
	_rapierLiquid.flights ??= new Map();
	for (const [index, job] of jobs.entries()) {
		const part = work && { signal: work.signal, progress: fraction => work.progress?.((index + fraction) / jobs.length) };
		// A still already rendering (the settled view asked for it) is awaited, not rendered twice.
		let flight = _rapierLiquid.flights.get(job.key);
		if (!flight) {
			flight = _rapierDrawLiquidStill(job, part, defs).finally(() => _rapierLiquid.flights.delete(job.key));
			_rapierLiquid.flights.set(job.key, flight);
		}
		await flight;
	}
	return jobs.length;
}
// A settled liquid drawing starts its still in the worker, so Done usually finds it ready.
function _rapierDrawLiquidPrefetch() {
	clearTimeout(_rapierLiquid.prefetch);
	const state = _rapierDrawState;
	if (!_rapierLiquid.live.size || state.finishing) return;
	_rapierLiquid.prefetch = setTimeout(() => {
		if (!state.open || state.finishing || state.effectsGesture || !globalThis.RapierDrawLiquidWorker) return;
		const session = state.session;
		// Without a GPU the still is what Draw shows; a new one is shown once it exists.
		void _rapierDrawLiquidStills(state.recipe).then(made => { if (made && state.open && state.session === session && [..._rapierLiquid.live.values()].some(live => live.failed)) _rapierDrawRenderAll(); })
			.catch(error => console.warn('[rapier] liquid light still', error));
	}, 1500);
}

// A drawing whose file lacks its still (an agent's, or one written without Draw) gets one behind
// the document, the way a kept painting is finished: the same recipe, rewritten with its still.
async function _rapierDrawLiquidResume() {
	const assets = globalThis.RapierImageAssets, embedded = globalThis.RapierEmbeddedImages, core = globalThis.RapierDrawCore, state = _rapierDrawState;
	const running = _rapierDrawLiquidResume, scope = rapier.identity.authority;
	if (running.busy || !assets || !embedded?.canFinishLater?.()) return;
	running.busy = true;
	try {
		for (const label of [...assets.documentAssets(_rapierSourceText()).assets.keys()]) {
			await new Promise(resolve => setTimeout(resolve, 0));
			if (scope !== rapier.identity.authority || state.open) return;
			const record = assets.documentAssets(_rapierSourceText()).assets.get(label);
			if (record?.codec !== 'image/svg+xml') continue;
			let text, recipe, size;
			try {
				const bytes = assets.decodeDataImage(record.url);
				text = new TextDecoder().decode(bytes);
				if (!text.includes('data-rapier-effect="liquid"')) continue;
				recipe = _rapierDrawReadRecipeFromSVGText(text);
				size = assets.imageDimensions(bytes, 'image/svg+xml');
			} catch (_) { continue; }
			if (!recipe) continue;
			core.liquidStillsWanted();
			_rapierDrawBuildSVG(recipe, undefined, true);
			if (!core.liquidStillsWanted().length) continue;
			const spelled = /^\[([^\]]+)\]/.exec(record.source)?.[1], defs = /<defs>([\s\S]*?)<\/defs>/.exec(text)?.[1] || '';
			if (!spelled) continue;
			await embedded.finishLater({
				asset: { ...record, label: spelled, ...size }, title: record.title, resumed: true, busy: () => state.open,
				final: async report => {
					await _rapierDrawLiquidStills(recipe, { progress: report }, defs);
					const next = _rapierDrawBuildSVG(recipe, undefined, true);
					return next && next.includes('data-rapier-liquid-still') && new TextEncoder().encode(next).length <= _rapierDrawAssetBudget() ? next : null;
				},
			});
		}
	} catch (error) { console.warn('[rapier] liquid light still', error); }
	finally { running.busy = false; }
}
