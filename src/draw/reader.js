// SPDX-License-Identifier: AGPL-3.0-only
const {refractionSourceReferences, refractionSourceShapes, remapRefractionSources, remapRefractionRecipeSources} = globalThis.RapierDrawCore;
const {_rapierDrawMergeAgentRecipe,_rapierDrawAssetGeneration,_rapierDrawReadRecipeFromSVGText,GARDEN_COLOURS,_rapierDrawShapePaintedBBoxIn,_rapierDrawInkView,_rapierDrawRouteChanges,_rapierDrawUnionView,_rapierDrawDarkRules,_rapierDrawUsedColours,RAPIER_DRAW_PAINT_INK_FILTER,_rapierDrawTextLayout,_rapierDrawShapeContours,RAPIER_DRAW_LABEL_MAX,_rapierDrawSetLineGeometry,_rapierDrawSceneMarkup,_rapierDrawEscapeAttr,RAPIER_DRAW_NIB_DEFAULT,RAPIER_DRAW_NIB_MAX,RAPIER_DRAW_NIB_MIN,RAPIER_DRAW_SMOOTH_DEFAULT,RAPIER_DRAW_VERSION,_rapierDrawAdmitRecipe,_rapierDrawApplyShapesPatch,_rapierDrawAnchorFrame,_rapierDrawArcEndpoints,_rapierDrawArrowParts,_rapierDrawArrowRoutePoints,_rapierDrawBBox,RAPIER_DRAW_RASTER_MAX,_rapierDrawBrushMarkup,_rapierDrawBrushesFor,_rapierDrawBuildSVG,_rapierDrawTextAlternative,_rapierDrawClamp,_rapierDrawClosestOnSeg,_rapierDrawDefaultStyle,_rapierDrawDist,_rapierDrawEdgeSnapPoint,_rapierDrawEllipseEdgePoint,_rapierDrawFmt,_rapierDrawInterpolatePoint,_rapierDrawIsClosedStroke,_rapierDrawNextAssetName,_rapierDrawNibLevel,_rapierDrawPaintPad,_rapierDrawPenPathD,_rapierDrawPerimeter,_rapierDrawPointInPolygon,_rapierDrawRDP,_rapierDrawRDPClosed,_rapierDrawRectPolygon,_rapierDrawRelaxStroke,_rapierDrawRerouteBoundArrows,_rapierDrawResamplePolyline,_rapierDrawShapeBBoxIn,_rapierDrawShapeInk,_rapierDrawShapeMarkup,_rapierDrawShapeNib,_rapierDrawShapePaintsInk,_rapierDrawShapePolygon,_rapierDrawShapePolyline,_rapierDrawShapeStroke,_rapierDrawSmoothLevel,_rapierDrawSmoothPathD,_rapierDrawSmoothPlan,_rapierDrawStreamlineStroke,_rapierDrawStrokeHalf,_rapierDrawStrokeHasPressure,_rapierDrawStrokeSamples,_rapierDrawDashActive,_rapierDrawBorderActive,_rapierDrawGrowPolygon,_rapierDrawRDPWeighted,_rapierDrawEffectiveWidth,RAPIER_DRAW_INK_WIDTH} = globalThis.RapierDrawCore;
const {_rapierDrawTranslateGeom,_rapierDrawTranslateShape,_rapierDrawReleaseBindings,_rapierDrawRotatePt,_rapierDrawResizeShape,_rapierDrawResizeShapeLocal,_rapierDrawRotateShape,_rapierDrawBindAnchorFor,_rapierDrawPruneUnusedStrokes,anchorResize:_rapierDrawAnchorResize,anchorResizeLocal:_rapierDrawAnchorResizeLocal,selectionFrame:_rapierDrawSelectionFrame,editDrawing:_rapierDrawEdit,selectionIds:_rapierDrawGroupSelection,snapMove:_rapierDrawSnapMove,snapResize:_rapierDrawSnapResize} = globalThis.RapierDrawEdit;
function _rapierDrawReadSVGRecipe(text) {
	return _rapierDrawReadRecipeFromSVGText(text);
}
function _rapierDrawHasContent(recipe) { return !!(recipe && (recipe.shapes.length || recipe.background && recipe.background.kind !== 'paper')); }
function _rapierDrawImageDataUrl(imageEl) {
	if (!imageEl) return null;
	const id = imageEl.getAttribute('data-rapier-asset') || imageEl.getAttribute('data-rapier-image-url');
	if (!id) return null;
	const local = _rapierEmbedAssetSource(id);
	if (local) return local;
	const assets = globalThis.RapierImageAssets;
	if (assets.dataImage(id)) return id;
	const record = globalThis.RapierEmbeddedImages.index().index.assets.get(assets.normalizeLabel(id));
	return record ? record.url : null;
}
const _rapierDrawRecipeCache = new WeakMap();
function _rapierDrawAdoptInspection(resources) {
	for (const row of resources?.letters || []) globalThis.RapierDrawLetters?.keepLetterGlyph(row.set, row.letter, row.path);
	for (const row of resources?.stills || []) globalThis.RapierDrawCore?.liquidStillPut(row.key, row.href);
}
function _rapierDrawPrimeImageRecipe(imageEl, url, recipe, error, resources) {
	if (!imageEl) return null;
	_rapierDrawAdoptInspection(resources);
	const cached = _rapierDrawRecipeCache.get(imageEl), record = cached?.url === url ? cached : {url, pending: null};
	Object.assign(record, {recipe: recipe || null, error: error ? Object.assign(new Error(error.message || String(error)), {code: error.code}) : null, ready: true});
	_rapierDrawRecipeCache.set(imageEl, record);
	return record;
}
function _rapierDrawImageRecipe(imageEl) {
	if (!imageEl) return null;
	const url = _rapierDrawImageDataUrl(imageEl), cached = _rapierDrawRecipeCache.get(imageEl);
	if (cached?.url === url) return cached;
	const prepared = globalThis.RapierEmbeddedImages?.cachedDrawing?.(url);
	if (prepared) return _rapierDrawPrimeImageRecipe(imageEl, url, prepared.recipe, prepared.recipeError, prepared.resources);
	const record = {url, recipe: null, error: null, pending: null, ready: false};
	_rapierDrawRecipeCache.set(imageEl, record);
	const inspect = globalThis.RapierImageInspection?.inspectDrawing;
	if (!/^data:image\/svg\+xml(?:;base64)?,/i.test(url || '') || !inspect) return record;
	record.pending = inspect(url, {kind: 'recipe'}).then(value => {
		if (!record.ready && _rapierDrawRecipeCache.get(imageEl) === record && _rapierDrawImageDataUrl(imageEl) === url)
			_rapierDrawPrimeImageRecipe(imageEl, url, value?.recipe, null, value?.resources);
	}, error => {
		if (!record.ready && _rapierDrawRecipeCache.get(imageEl) === record && _rapierDrawImageDataUrl(imageEl) === url)
			_rapierDrawPrimeImageRecipe(imageEl, url, null, error);
	}).finally(() => {
		record.pending = null;
		if (_rapierDrawRecipeCache.get(imageEl) !== record || _rapierDrawImageDataUrl(imageEl) !== url) return;
		globalThis.RapierImageFlow?.invalidate();
		if (typeof _rapierRefreshImageTools === 'function' && _rapierImageRuntime.image === imageEl) _rapierRefreshImageTools();
	});
	return record;
}
function _rapierDrawRecipeFromImage(imageEl) { return _rapierDrawImageRecipe(imageEl)?.recipe || null; }
function _rapierDrawImageIsOurs(imageEl) { const record = _rapierDrawImageRecipe(imageEl); return !!(record?.recipe || record?.error || record?.pending); }
function _rapierDrawRoundProfile(cx, cy, rx, ry) {
	return { spanAt(t) { const dy = (t - cy) / ry; if (Math.abs(dy) >= 1) return null; const dx = rx * Math.sqrt(1 - dy * dy); return [cx - dx, cx + dx]; } };
}
const RAPIER_DRAW_BANDS = 48;
const _rapierDrawBrushBoxes = new Map();
function _rapierDrawBrushRoot(markup) {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('style', 'position:absolute;visibility:hidden;width:0;height:0;');
	const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
	group.innerHTML = markup;
	svg.appendChild(group);
	return {svg, group};
}
function _rapierDrawBrushBox(group) {
	const b = group.getBBox();
	return b.width >= 0 && b.height >= 0 ? { minX: b.x, minY: b.y, maxX: b.x + b.width, maxY: b.y + b.height } : null;
}
function _rapierDrawBrushExtent(shape, recipe) {
	if (!shape.brush || shape.brush === 'ink') return null;
	if (typeof document === 'undefined' || !document.body) return null;
	let markup;
	try { markup = _rapierDrawBrushMarkup(shape, recipe); } catch (_) { return null; }
	if (!markup) return null;
	if (_rapierDrawBrushBoxes.has(markup)) return _rapierDrawBrushBoxes.get(markup);
	if (_rapierDrawBrushBoxes.size >= 64) _rapierDrawBrushBoxes.delete(_rapierDrawBrushBoxes.keys().next().value);
	let svg, box = null;
	try {
		svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('style', 'position:absolute;visibility:hidden;width:0;height:0;');
		const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		group.innerHTML = markup;
		svg.appendChild(group);
		document.body.appendChild(svg);
		const b = group.getBBox();
		if (b.width >= 0 && b.height >= 0) box = { minX: b.x, minY: b.y, maxX: b.x + b.width, maxY: b.y + b.height };
	} catch (_) { box = null; }
	finally { svg?.remove(); }
	_rapierDrawBrushBoxes.set(markup, box);
	return box;
}
function _rapierDrawBrushCoverBatch(covers) {
	let cache = null, jobs = [], pending = [];
	const extent = (shape, recipe) => {
		const empty = {box: null};
		if (!shape.brush || shape.brush === 'ink' || typeof document === 'undefined' || !document.body) return empty;
		let markup;
		try { markup = _rapierDrawBrushMarkup(shape, recipe); } catch (_) { return empty; }
		if (!markup) return empty;
		cache ||= new Map([..._rapierDrawBrushBoxes].map(([key, box]) => [key, {box}]));
		if (cache.has(markup)) return cache.get(markup);
		if (cache.size >= 64) cache.delete(cache.keys().next().value);
		const value = {box: null};
		cache.set(markup, value); jobs.push({markup, value});
		return value;
	};
	const flush = () => {
		if (!pending.length) return;
		if (jobs.length) {
			const roots = [];
			let fragment;
			try { fragment = document.createDocumentFragment(); } catch (_) {}
			for (const job of jobs) {
				try {
					const root = _rapierDrawBrushRoot(job.markup);
					roots.push({...root, value: job.value});
					fragment?.appendChild(root.svg);
				} catch (_) { fragment = null; }
			}
			let together = false;
			try { if (fragment) { document.body.appendChild(fragment); together = true; } } catch (_) {}
			if (together) {
				try {
					for (const root of roots) {
						try { root.value.box = _rapierDrawBrushBox(root.group); } catch (_) { root.value.box = null; }
					}
				} finally { for (const root of roots) root.svg.remove(); }
			} else {
				for (const root of roots) root.svg.remove();
				for (const root of roots) {
					try { document.body.appendChild(root.svg); root.value.box = _rapierDrawBrushBox(root.group); }
					catch (_) { root.value.box = null; }
					finally { root.svg.remove(); }
				}
			}
			_rapierDrawBrushBoxes.clear();
			for (const [markup, value] of cache) _rapierDrawBrushBoxes.set(markup, value.box);
		}
		const ready = pending;
		cache = null; jobs = []; pending = [];
		for (const finish of ready) {
			let cover = null;
			try { cover = typeof finish === 'function' ? finish() : finish; } catch (_) {}
			if (cover) covers.push(...(Array.isArray(cover) ? cover : [cover]));
		}
	};
	return {extent, flush, add(shape, recipe) {
		let finish = null;
		try { finish = _rapierDrawShapeCover(shape, recipe, extent); } catch (_) {}
		pending.push(finish);
		if (pending.length >= 64) flush();
	}};
}
function _rapierDrawCoverPad(shape, recipe, box, brush = _rapierDrawBrushExtent(shape, recipe)) {
	const pad = _rapierDrawPaintPad(shape, recipe);
	return brush && box ? Math.max(pad, brush.maxX - box.maxX, box.minX - brush.minX, brush.maxY - box.maxY, box.minY - brush.minY) : pad;
}
function _rapierDrawRoundReach(shape, recipe, cx, cy, rx, ry) {
	const brush = _rapierDrawBrushExtent(shape, recipe), pad = _rapierDrawPaintPad(shape, recipe);
	return { rx: Math.max(rx + pad, brush ? Math.max(brush.maxX - cx, cx - brush.minX) + pad : 0), ry: Math.max(ry + pad, brush ? Math.max(brush.maxY - cy, cy - brush.minY) + pad : 0) };
}
const RAPIER_DRAW_OPEN_HALF = 4;
function _rapierDrawShapeCover(shape, recipe, deferredExtent = null) {
	if (!shape || typeof shape !== 'object') return null;
	if (shape.effect?.strength) {
		const b = _rapierDrawShapePaintedBBoxIn(shape, recipe);
		return { poly: [[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY]] };
	}
	if (shape.recognized === 'text') return { poly: _rapierDrawTextLayout(shape, recipe).polygon };
	const contours = _rapierDrawShapeContours(shape, recipe).filter(points => points.length > 1);
	if (!contours.length) return [];
	const firstBox = _rapierDrawBBox(contours[0]);
	const finish = brush => contours.map((points, index) => {
		const pad = _rapierDrawCoverPad(shape, recipe, index ? _rapierDrawBBox(points) : firstBox, brush);
		const closed = !_rapierDrawShapePaintsInk(shape, recipe) ? ['circle', 'ellipse'].includes(shape.recognized) || !!_rapierDrawShapePolygon(shape, recipe) : _rapierDrawIsClosedStroke(points);
		return closed ? { poly: _rapierDrawGrowPolygon(_rapierDrawDist(points[0], points.at(-1)) < .01 ? points.slice(0, -1) : points, pad) } : { line: points, half: Math.max(RAPIER_DRAW_OPEN_HALF, pad) };
	});
	if (!deferredExtent) return finish(_rapierDrawBrushExtent(shape, recipe));
	const value = deferredExtent(shape, recipe);
	return () => finish(value.box);
}
function _rapierDrawMeasureLabelBox(text) {
	if (typeof document !== 'undefined' && document.body) {
		let host = null;
		try {
			host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			host.setAttribute('style', 'position:absolute;left:-99999px;top:0;visibility:hidden');
			const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			t.setAttribute('font-family', 'system-ui, sans-serif');
			t.setAttribute('font-size', '14');
			t.textContent = text;
			host.appendChild(t);
			document.body.append(host);
			const box = t.getBBox();
			if (box.width >= 0 && box.height >= 0) return { width: box.width, top: box.y, bottom: box.y + box.height };
		} catch (_) {   }
		finally { host?.remove(); }
	}
	return { width: Math.max(1, text.length) * 8.2, top: -12, bottom: 4 };
}
function _rapierDrawLabelBox(shape, recipe) {
	return shape?.label || shape?.recognized === 'text' ? _rapierDrawTextLayout(shape, recipe).bounds : null;
}
function _rapierDrawMergeRuns(lists, gap = .5) {
	const runs = [];
	for (const list of lists) if (list) runs.push(...list);
	if (!runs.length) return null;
	runs.sort((one, two) => one[0] - two[0]);
	const merged = [[runs[0][0], runs[0][1]]];
	for (let i = 1; i < runs.length; i++) {
		const last = merged[merged.length - 1];
		if (runs[i][0] <= last[1] + gap) last[1] = Math.max(last[1], runs[i][1]);
		else merged.push(runs[i].slice());
	}
	return merged;
}
function _rapierDrawRunsAtY(covers, y) {
	const runs = [];
	for (const cover of covers) {
		if (cover.poly) {
			const poly = cover.poly, xs = [];
			for (let i = 0; i < poly.length; i++) {
				const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
				if ((y1 <= y) === (y2 <= y)) continue;
				xs.push([x1 + (y - y1) / (y2 - y1) * (x2 - x1), y2 > y1 ? 1 : -1]);
			}
			xs.sort((a, b) => a[0] - b[0]);
			let winding = 0, start = 0;
			for (const [x, turn] of xs) {
				if (!winding) start = x;
				winding += turn;
				if (!winding) runs.push([start, x]);
			}
			continue;
		}
		const pts = cover.line, half = cover.half ?? RAPIER_DRAW_OPEN_HALF;
		for (let i = 1; i < pts.length; i++) {
			const [x1, y1] = pts[i - 1], [x2, y2] = pts[i];
			if (y < Math.min(y1, y2) - half || y > Math.max(y1, y2) + half) continue;
			let a, b;
			if (Math.abs(y2 - y1) < 1e-6) { a = Math.min(x1, x2); b = Math.max(x1, x2); }
			else {
				const t0 = _rapierDrawClamp((y - half - y1) / (y2 - y1), 0, 1);
				const t1 = _rapierDrawClamp((y + half - y1) / (y2 - y1), 0, 1);
				const xa = x1 + (x2 - x1) * t0, xb = x1 + (x2 - x1) * t1;
				a = Math.min(xa, xb); b = Math.max(xa, xb);
			}
			runs.push([a - half, b + half]);
		}
	}
	if (!runs.length) return null;
	runs.sort((one, two) => one[0] - two[0]);
	const merged = [[runs[0][0], runs[0][1]]];
	for (let i = 1; i < runs.length; i++) {
		const last = merged[merged.length - 1];
		if (runs[i][0] <= last[1] + .5) { if (runs[i][1] > last[1]) last[1] = runs[i][1]; }
		else merged.push([runs[i][0], runs[i][1]]);
	}
	return merged;
}
function _rapierDrawBandProfile(bands) {
	const at = t => bands[_rapierDrawClamp(Math.floor(t * bands.length), 0, bands.length - 1)];
	return { spanAt(t) { const runs = at(t); return runs?.length ? [runs[0][0], runs[runs.length - 1][1]] : null; }, runsAt: t => at(t) || null };
}
function _rapierDrawShapeProfileFor(recipe, glyphs) {
	const w = recipe?.canvas?.w, h = recipe?.canvas?.h;
	if (!_rapierDrawHasContent(recipe) || !(w > 0) || !(h > 0)) return null;
	const saved = recipe.view;
	const view = saved && saved.w > 0 && saved.h > 0
		? { x: +saved.x || 0, y: +saved.y || 0, w: +saved.w, h: +saved.h } : { x: 0, y: 0, w, h };
	if (recipe.effect?.strength || recipe.background) return { spanAt() { return [0, 1]; }, runsAt() { return [[0, 1]]; } };

	if (recipe.shapes.length === 1 && recipe.shapes[0] && typeof recipe.shapes[0] === 'object' && !recipe.shapes[0].label && !recipe.shapes[0].effect?.strength) {
		const shape = recipe.shapes[0], g = shape.geom || {};

		if (!_rapierDrawShapePaintsInk(shape, recipe)) {

			if (shape.recognized === 'circle' && g.r > 0) {
				const reach = _rapierDrawRoundReach(shape, recipe, g.cx, g.cy, g.r, g.r);
				return _rapierDrawRoundProfile((g.cx - view.x) / view.w, (g.cy - view.y) / view.h, reach.rx / view.w, reach.ry / view.h);
			}
			if (shape.recognized === 'ellipse' && g.rx > 0 && g.ry > 0 && !g.rot) {
				const reach = _rapierDrawRoundReach(shape, recipe, g.cx, g.cy, g.rx, g.ry);
				return _rapierDrawRoundProfile((g.cx - view.x) / view.w, (g.cy - view.y) / view.h, reach.rx / view.w, reach.ry / view.h);
			}

		}
	}
	const covers = [];
	let brushBatch = null;
	try { for (const shape of recipe.shapes) {
		if (glyphs && !shape.effect?.strength && (shape.recognized === 'text' || shape.recognized === 'paint')) continue;
		if (shape && typeof shape === 'object' && !shape.effect?.strength && !shape.label && !shape.len && !shape.angle &&
				!['text', 'paint', 'ornament', 'line', 'arrow'].includes(shape.recognized)) {
			(brushBatch ||= _rapierDrawBrushCoverBatch(covers)).add(shape, recipe);
			continue;
		}
		brushBatch?.flush();
		let cover = null;

		try { cover = _rapierDrawShapeCover(shape, recipe); } catch (_) { cover = null; }
		if (cover) covers.push(...(Array.isArray(cover) ? cover : [cover]));
		if (shape.geom && !_rapierDrawShapePaintsInk(shape, recipe) && (shape.recognized === 'arrow' || shape.recognized === 'line')) {
			const parts = _rapierDrawArrowParts(shape, recipe);
			for (const head of [parts.headStart, parts.headEnd]) if (head) covers.push({ poly: _rapierDrawGrowPolygon(head.poly, 1) });
		}

		if (shape.geom && !shape.asDrawn) {
			const g = shape.geom, box = (x, y, w, h) => ({ poly: [[x - w, y - h], [x + w, y - h], [x + w, y + h], [x - w, y + h]] });
			if (shape.angle) for (const p of shape.recognized === 'triangle' ? g.p : [[g.x1, g.y1]]) covers.push(box(p[0], p[1], 40, 40));
			if (shape.len) {
				const angle = Math.atan2(g.y2 - g.y1, g.x2 - g.x1), text = String(Math.round(Math.hypot(g.x2 - g.x1, g.y2 - g.y1)));
				const measure = _rapierDrawMeasureLabelBox(text);
				covers.push(box((g.x1 + g.x2) / 2 - Math.sin(angle) * 12, (g.y1 + g.y2) / 2 + Math.cos(angle) * 12 - 5, measure.width / 2 + 2, 11));
			}
		}
		let labelBox = null;
		try { labelBox = _rapierDrawLabelBox(shape, recipe); } catch (_) { labelBox = null; }
		if (labelBox && !glyphs) covers.push({ poly: _rapierDrawTextLayout(shape, recipe).polygon });
	} } finally { brushBatch?.flush(); }
	if (!covers.length && !glyphs) return null;
	const bands = [];
	let any = false;
	for (let i = 0; i < RAPIER_DRAW_BANDS; i++) {

		const top = view.y + i / RAPIER_DRAW_BANDS * view.h;
		const bottom = view.y + (i + 1) / RAPIER_DRAW_BANDS * view.h;
		const runs = _rapierDrawMergeRuns([
			_rapierDrawRunsAtY(covers, top), _rapierDrawRunsAtY(covers, (top + bottom) / 2), _rapierDrawRunsAtY(covers, bottom)]);
		const scaled = (runs || []).map(([a, b]) => [
			_rapierDrawClamp((a - view.x) / view.w, 0, 1),
			_rapierDrawClamp((b - view.x) / view.w, 0, 1)]).filter(([a, b]) => b > a);
		const merged = _rapierDrawMergeRuns([scaled, glyphs?.runsAt((i + .5) / RAPIER_DRAW_BANDS)], .001);
		if (merged?.length) any = true;
		bands.push(merged);
	}
	return any ? _rapierDrawBandProfile(bands) : null;
}
function _rapierDrawShapeProfile(imageEl) {
	const recipe = _rapierDrawRecipeFromImage(imageEl);
	const glyphs = recipe?.shapes.some(shape => shape.recognized === 'text' || shape.recognized === 'paint' || shape.label) ? globalThis.RapierImageLayout.alphaProfile(imageEl) : null;
	return _rapierDrawShapeProfileFor(recipe, glyphs);
}
