// SPDX-License-Identifier: AGPL-3.0-only
const _rapierEffects = globalThis.RapierDrawCore;
const RAPIER_COPY_CONTROLS = [
	['copy', 'copies', 'Copies', 1, 24, 1], ['copy', 'drift', 'Drift', 0, 32, .5],
	['copy', 'angle', 'Direction', -180, 180, 1], ['copy', 'fade', 'Copy fade', 0, 1, .01],
	['copy', 'smear', 'Smear', 0, 1, .01], ['copy', 'jitter', 'Scan movement', 0, 1, .01],
	['toner', 'strength', 'Strength', 0, 1, .01], ['toner', 'exposure', 'Exposure', -1, 1, .01],
	['toner', 'contrast', 'Contrast', .5, 4, .05], ['toner', 'toner', 'Toner', 0, 1, .01],
	['toner', 'grain', 'Grain', 0, 1, .01], ['toner', 'scatter', 'Edge scatter', 0, 1, .01],
	['toner', 'banding', 'Drum bands', 0, 1, .01], ['toner', 'wear', 'Wear', 0, 1, .01],
	['paper', 'paper', 'Paper', 0, 1, .01], ['paper', 'warmth', 'Warmth', 0, 1, .01],
	['paper', 'edge', 'Scanner edge', 0, 1, .01],
];
const RAPIER_REFRACTION_CONTROLS = [
	['lens', 'strength', 'Strength', 0, 1, .01], ['lens', 'amount', 'Refraction', -10000, 10000, 10],
	['lens', 'blur', 'Lens softness', 0, 80, .5], ['lens', 'bump', 'Sensitivity', 0, 20, .1],
	['spectrum', 'red', 'Red end', -2, 2, .01], ['spectrum', 'blue', 'Blue end', -2, 2, .01],
	['spectrum', 'samples', 'Samples', 3, 100, 1],
	['direction', 'angle', 'Direction', -180, 180, 1], ['direction', 'amountX', 'Horizontal', 0, 4, .05],
	['direction', 'amountY', 'Vertical', 0, 4, .05],
];
const RAPIER_LIQUID_CONTROLS = [
	['flow', 'swirl', 'Swirl', -1, 1, .01], ['flow', 'turbulence', 'Turbulence', 0, 1, .01], ['flow', 'scale', 'Eddy size', 0, 1, .01],
	['flow', 'curl', 'Curl', 0, 1, .01], ['flow', 'speed', 'Speed', 0, 2, .01], ['flow', 'detail', 'Detail', 0, 1, .01],
	['feedback', 'refresh', 'Return', 0, 1, .01], ['feedback', 'focus', 'Focus', 0, 1, .01], ['feedback', 'zoom', 'Bloom', -1, 1, .01],
	['feedback', 'spin', 'Spin', -1, 1, .01], ['feedback', 'x', 'Center across', 0, 1, .01], ['feedback', 'y', 'Center down', 0, 1, .01],
	['light', 'dispersion', 'Dispersion', 0, 1, .01], ['light', 'refract', 'Refraction', 0, 1, .01], ['light', 'iridescence', 'Iridescence', 0, 1, .01],
	['light', 'film', 'Film', 0, 1, .01], ['light', 'sheen', 'Sheen', 0, 1, .01],
	['colour', 'tint', 'Tint', 0, 1, .01], ['colour', 'bands', 'Bands', 0, 1, .01], ['colour', 'cycle', 'Color rings', 0, 1, .01],
	['colour', 'fill', 'Fill', 0, 1, .01], ['colour', 'strength', 'Strength', 0, 1, .01], ['colour', 'time', 'Saved moment', 0, 12, .1],
];
const RAPIER_EFFECT_SECTIONS = { copier: [['copy', 'Copies'], ['toner', 'Toner'], ['paper', 'Paper']], refraction: [['lens', 'Lens'], ['spectrum', 'Spectrum'], ['direction', 'Direction']],
	liquid: [['flow', 'Flow'], ['feedback', 'Feedback'], ['light', 'Light'], ['colour', 'Color']] };
const RAPIER_EFFECT_CONTROLS = { copier: RAPIER_COPY_CONTROLS, refraction: RAPIER_REFRACTION_CONTROLS, liquid: RAPIER_LIQUID_CONTROLS };
const RAPIER_EFFECT_TITLES = { copier: 'Copy machine', refraction: 'Refracted light', liquid: 'Liquid light' };
const RAPIER_EFFECT_ACTIONS = { copier: 'copyMachine', refraction: 'refractedLight', liquid: 'liquidLight' };

function _rapierDrawEffectsType() { return Object.hasOwn(RAPIER_EFFECT_TITLES, _rapierDrawState.effectsType) ? _rapierDrawState.effectsType : 'copier'; }
function _rapierDrawEffectsTitle(type = _rapierDrawEffectsType()) { return RAPIER_EFFECT_TITLES[type]; }

function _rapierDrawEffectsTargets() {
	const state = _rapierDrawState;
	if (!state.recipe) return [];
	if (state.effectsScope === 'drawing') return state.recipe.shapes.length ? [state.recipe] : [];
	const layer = state.effectsScope === 'layer' && state.recipe.shapes.find(shape => shape.id === state.effectsLayer && shape.recognized === 'paint');
	if (layer?.paint?.group) return state.recipe.shapes.filter(shape => shape.recognized === 'paint' && shape.paint?.group === layer.paint.group);
	const ids = state.effectsScope === 'layer' ? [layer?.id] : state.effectsSelection || [];
	return state.recipe.shapes.filter(shape => ids.includes(shape.id));
}
function _rapierDrawEffectsEnter() {
	const state = _rapierDrawState, ids = _rapierDrawSelection();
	state.effectsSelection = ids;
	state.effectsLayer = state.recipe.shapes.find(shape => ids.includes(shape.id) && shape.recognized === 'paint')?.id || state.paintChosenId || null;
	state.effectsScope = ids.length ? 'selection' : state.tool === 'paint' && state.effectsLayer ? 'layer' : 'drawing';
	state.effectsSweep = null; state.effectsCompare = false;
	state.effectsGesture = null; state.effectsPendingChange = null;
	state.effectsChangeEpoch = (state.effectsChangeEpoch || 0) + 1;
}
function _rapierDrawEffectsChange(effect, continuous = false) {
	const state = _rapierDrawState, targets = _rapierDrawEffectsTargets();
	if (!state.open || state.finishing || !targets.length || targets.some(target => target.locked)) return false;
	const next = effect === null ? null : _rapierEffects.admitEffect(effect);
	if (effect !== null && !next) return false;
	const whole = state.effectsScope === 'drawing', layerScope = state.effectsScope === 'layer', ids = new Set(targets.map(target => target.id));
	const prior = new Map(targets.map(target => [target.id, JSON.stringify(target.effect || null)]));
	const pieces = shape => JSON.stringify(shape.paint?.group ? state.recipe.shapes.filter(row => row.recognized === 'paint' && row.paint?.group === shape.paint.group).map(row => row.id).sort() : [shape.id]);
	const selectedPaint = state.effectsScope === 'selection' ? new Map(targets.filter(target => target.recognized === 'paint').map(target => [target.id, pieces(target)])) : new Map();
	const request = { next, recipe: state.recipe, session: state.session, scope: state.effectsScope, type: _rapierDrawEffectsType(),
		layer: state.effectsLayer, selection: JSON.stringify(state.effectsSelection || []),
		epoch: state.effectsChangeEpoch = (state.effectsChangeEpoch || 0) + 1, gesture: continuous ? state.effectsGesture : null };
	state.effectsPendingChange = request;
	state.effectsCompare = false; _rapierDrawEffectsCompare();
	const owns = () => state.open && !state.finishing && state.session === request.session && state.effectsChangeEpoch === request.epoch &&
		state.effectsScope === request.scope && _rapierDrawEffectsType() === request.type && _rapierDrawTool() === 'effects' &&
		(request.scope !== 'layer' || state.effectsLayer === request.layer) && (request.scope !== 'selection' || JSON.stringify(state.effectsSelection || []) === request.selection);
	let anchorId = null;
	const currentTargets = () => {
		if (!state.recipe) return [];
		if (whole) return [state.recipe];
		if (!layerScope) return state.recipe.shapes.filter(shape => ids.has(shape.id));
		const retained = state.recipe.shapes.filter(shape => ids.has(shape.id) && shape.recognized === 'paint');
		const layer = retained.find(shape => shape.id === request.layer) || retained[0];
		anchorId = layer?.id;
		return !layer ? [] : layer.paint?.group ? state.recipe.shapes.filter(shape => shape.recognized === 'paint' && shape.paint?.group === layer.paint.group) : [layer];
	};
	const samePieces = () => Array.from(selectedPaint, ([id, before]) => {
		const shape = state.recipe?.shapes.find(row => row.id === id && row.recognized === 'paint');
		return !!shape && pieces(shape) === before;
	}).every(Boolean);
	const current = (cloned = false) => {
		if (!owns() || !cloned && state.recipe !== request.recipe || !samePieces()) return false;
		const now = currentTargets();
		if (!now.length || !layerScope && now.length !== targets.length) return false;
		if (layerScope && state.recipe.shapes.some(shape => ids.has(shape.id) && !now.includes(shape))) return false;
		return now.every(target => !target.locked && (prior.has(target.id) ? prior.get(target.id) : prior.get(anchorId)) === JSON.stringify(target.effect || null));
	};
	const finish = ok => {
		if (state.effectsPendingChange === request) state.effectsPendingChange = null;
		if (!owns()) return false;
		if (ok && layerScope) state.effectsLayer = anchorId;
		if (ok && request.gesture) {
			request.gesture.entry = state.undoStack.at(-1); request.gesture.changed = true;
			if (state.effectsGesture === request.gesture) state.effectsSweep = request.gesture.entry;
		}
		if (ok && state.effectsPreviewHold) { _rapierDrawEffectsPreviewSchedule(request.gesture); _rapierDrawRenderHistory(); }
		else if (ok) _rapierDrawRenderAll();
		_rapierDrawEffectsSync(); _rapierPaintSyncPaper();
		return ok;
	};
	const apply = () => {
		if (!current()) {
			if (owns() && state.recipe === request.recipe && !samePieces()) showToast('The painting changed while its pixels were being kept. Select it again to apply the effect.', 'info');
			return finish(false);
		}
		const waiting = _rapierPaintFlushRevision();
		if (waiting) return waiting.then(apply);
		if (currentTargets().every(target => JSON.stringify(target.effect || null) === JSON.stringify(next))) return finish(false);
		const sweeping = request.gesture?.entry && request.gesture.entry === state.undoStack.at(-1);
		const undo = state.undoStack.slice(), redo = state.redoStack.slice();
		const sameHistory = () => state.undoStack.length === undo.length && state.redoStack.length === redo.length &&
			undo.every((entry, i) => state.undoStack[i] === entry) && redo.every((entry, i) => state.redoStack[i] === entry);
		let changed = false;
		const result = _rapierDrawCommand(() => {
			if (!sameHistory() || !current(true)) return;
			for (const target of currentTargets()) { if (next) target.effect = { ...next }; else delete target.effect; }
			changed = true;
		}, !sweeping, false);
		return result?.then ? result.then(ok => finish(ok && changed)) : finish(result && changed);
	};
	const failed = error => { if (owns()) showToast(String(error.message || error), 'error'); return finish(false); };
	try {
		const result = apply();
		if (result?.then) { request.promise = result.catch(failed); return request.promise; }
		return result;
	}
	catch (error) { return failed(error); }
}
function _rapierDrawEffectsFlush() {
	const state = _rapierDrawState, session = state.session;
	const pending = () => {
		const request = state.effectsPendingChange;
		return state.open && state.session === session && request?.session === session && request.epoch === state.effectsChangeEpoch &&
			request.type === _rapierDrawEffectsType() && request.scope === state.effectsScope ? request.promise : null;
	};
	let waiting = pending();
	if (!waiting) return null;
	return (async () => { while (waiting) { await waiting; waiting = pending(); } })();
}

function _rapierDrawEffectsPreviewSource(recipe = _rapierDrawState.recipe) {
	const state = _rapierDrawState;
	if (!recipe) return '';
	const display = JSON.parse(JSON.stringify(recipe));
	const defer = effect => { if (effect?.type === 'copier') effect.smear = 0; };
	defer(display.effect);
	for (const shape of display.shapes || []) defer(shape.effect);
	const root = state.svgRoot, defs = root.querySelector('defs')?.innerHTML || '', dark = root.querySelector('.rapier-draw-dark')?.textContent || '';
	return '<svg xmlns="http://www.w3.org/2000/svg" class="rapier-draw-canvas" viewBox="' + root.getAttribute('viewBox') + '" color="' + _rapierDrawShapeInk() + '"><defs>' + defs + '</defs><style>' + dark + '</style>' + _rapierDrawDisplayMarkup(_rapierDrawSceneMarkup(display, true, true, {sourceOnly: true})) + '</svg>';
}
function _rapierDrawEffectsPreviewPlace(canvas) {
	const state = _rapierDrawState, host = state.svgRoot?.parentElement;
	if (!host) return false;
	let node = state.effectsPreviewNode;
	if (!node) {
		node = document.createElement('canvas');
		node.className = 'rapier-draw-copy-preview';
		node.setAttribute('aria-hidden', 'true');
		node.style.position = 'absolute';
		node.style.pointerEvents = 'none';
		node.style.zIndex = '2';
		host.append(node);
		state.effectsPreviewNode = node;
	}
	const rect = state.svgRoot.getBoundingClientRect(), parent = host.getBoundingClientRect();
	node.style.left = (rect.left - parent.left) + 'px';
	node.style.top = (rect.top - parent.top) + 'px';
	node.style.width = rect.width + 'px';
	node.style.height = rect.height + 'px';
	node.width = canvas.width;
	node.height = canvas.height;
	node.getContext('2d').drawImage(canvas, 0, 0);
	node.hidden = false;
	return true;
}
function _rapierDrawEffectsPreviewHideLive() {
	const svg = _rapierDrawState.svg;
	if (svg) svg.style.visibility = 'hidden';
}
function _rapierDrawEffectsPreviewWanted() {
	const state = _rapierDrawState;
	return state.open && !state.finishing && !state.effectsCompare && !state.gesture &&
		(state.effectsPreviewHold || globalThis.RapierDrawRefraction.hasRefraction(state.recipe));
}
async function _rapierDrawEffectsPreviewRaster() {
	const state = _rapierDrawState;
	const session = state.session, epoch = state.effectsPreviewEpoch, liveRecipe = state.recipe, root = state.svgRoot;
	const view = root?.getAttribute('viewBox'), rect = root?.getBoundingClientRect();
	if (!view || !rect?.width || !rect.height) return;
	const refracted = globalThis.RapierDrawRefraction.hasRefraction(liveRecipe);
	const gesture = refracted && _rapierDrawEffectsType() === 'refraction' && state.effectsPreviewHold && state.effectsGesture?.previewKey ? state.effectsGesture : null;
	const recipe = gesture ? JSON.parse(JSON.stringify(liveRecipe)) : liveRecipe;
	const source = _rapierDrawEffectsPreviewSource(recipe);
	const scope = state.effectsScope, layer = state.effectsLayer, selection = JSON.stringify(state.effectsSelection || []);
	const ids = gesture && new Set(_rapierDrawEffectsTargets().map(target => target.id));
	const sourceKey = current => {
		if (!gesture) return globalThis.RapierDrawRefraction.refractionRecipeKey(current);
		const mask = effect => effect && {...effect, [gesture.previewKey]: 0};
		return globalThis.RapierDrawRefraction.refractionRecipeKey({...current,
			effect: scope === 'drawing' ? mask(current.effect) : current.effect,
			shapes: current.shapes.map(shape => scope !== 'drawing' && ids.has(shape.id) ? {...shape, effect: mask(shape.effect)} : shape)});
	};
	const capturedSource = gesture ? sourceKey(recipe) : null;
	const owner = gesture ? {gesture, owns: () => {
		if (state.effectsPreviewOwner !== owner || state.effectsGesture !== gesture || !state.effectsPreviewHold ||
			state.session !== session || state.effectsPreviewEpoch !== epoch || state.effectsScope !== scope || state.effectsLayer !== layer ||
			JSON.stringify(state.effectsSelection || []) !== selection || _rapierDrawEffectsType() !== 'refraction' || _rapierDrawTool() !== 'effects' ||
			state.svgRoot !== root || root.getAttribute('viewBox') !== view) return false;
		const now = root.getBoundingClientRect();
		return now.width === rect.width && now.height === rect.height && now.left === rect.left && now.top === rect.top;
	}} : null;
	state.effectsPreviewOwner = owner;
	const width = Math.max(1, Math.round(rect.width / (refracted ? 1 : 2))), height = Math.max(1, Math.round(rect.height / (refracted ? 1 : 2)));
	const controller = new AbortController(); state.effectsPreviewController = controller;
	let canvas, rendered;
	if (refracted) {
		if (state.effectsPreviewCacheSession !== session) { state.effectsPreviewCache = new Map(); state.effectsPreviewCacheSession = session; }
		rendered = await globalThis.RapierDrawRefraction.renderSVG(source, recipe, {width, height, previewScale: gesture ? .5 : 1, signal: controller.signal, cache: state.effectsPreviewCache});
		canvas = rendered.canvas;
	} else {
		const imageSource = source.replace('<svg ', '<svg width="' + width + '" height="' + height + '" ');
		canvas = await globalThis.RapierDrawAgentPaint.rasterizeSVG(imageSource, width, height, {signal: controller.signal});
	}
	if (!_rapierDrawEffectsPreviewWanted() || state.session !== session || state.effectsPreviewEpoch !== epoch ||
		state.svgRoot !== root || root.getAttribute('viewBox') !== view) return;
	if (gesture ? !owner.owns() || sourceKey(state.recipe) !== capturedSource : state.recipe !== recipe || rendered && sourceKey(state.recipe) !== rendered.key) return;
	const now = root.getBoundingClientRect();
	if (now.width !== rect.width || now.height !== rect.height || now.left !== rect.left || now.top !== rect.top) return;
	if (_rapierDrawEffectsPreviewPlace(canvas)) {
		const node = state.effectsPreviewNode;
		if (rendered) {
			node.dataset.rapierRefractionPreview = ''; node.dataset.refractionRenderer = rendered.renderer; node.dataset.refractionKey = rendered.key;
			node.dataset.refractionScale = String(rendered.previewScale);
			if (gesture || state.effectsPreviewPending || state.recipe !== recipe) node.dataset.refractionPending = '';
			else delete node.dataset.refractionPending;
		}
		_rapierDrawEffectsPreviewHideLive();
	}
}
function _rapierDrawEffectsPreviewSchedule(gesture = null) {
	const state = _rapierDrawState;
	if (!_rapierDrawEffectsPreviewWanted()) return;
	if (!gesture || state.effectsPreviewOwner?.gesture !== gesture || !state.effectsPreviewOwner.owns()) {
		state.effectsPreviewController?.abort();
		state.effectsPreviewEpoch = (state.effectsPreviewEpoch || 0) + 1;
	}
	state.effectsPreviewPending = true;
	if (state.effectsPreviewNode) state.effectsPreviewNode.dataset.refractionPending = '';
	if (state.effectsPreviewFlight) return;
	const run = async () => {
		while (_rapierDrawEffectsPreviewWanted() && state.effectsPreviewPending) {
			state.effectsPreviewPending = false;
			const job = _rapierDrawEffectsPreviewRaster(); state.effectsPreviewFlight = job;
			try { await job; }
			catch (error) {
				if (error.name !== 'AbortError' && !state.effectsPreviewPending && _rapierDrawEffectsPreviewWanted()) {
					_rapierDrawEffectsPreviewRelease(false);
					showToast('The effect preview could not be rendered: ' + String(error.message || error), 'error');
				}
			}
			if (state.effectsPreviewFlight === job) { state.effectsPreviewFlight = null; state.effectsPreviewOwner = null; }
		}
	};
	void run();
}
function _rapierDrawEffectsPreviewRelease(render = true, keepPreview = false) {
	const state = _rapierDrawState;
	state.effectsPreviewHold = false;
	state.effectsPreviewPending = false;
	state.effectsPreviewOwner = null;
	state.effectsPreviewController?.abort();
	state.effectsPreviewEpoch = (state.effectsPreviewEpoch || 0) + 1;
	if (keepPreview && render && state.open && !state.finishing && globalThis.RapierDrawRefraction.hasRefraction(state.recipe) && state.effectsPreviewNode) {
		state.effectsPreviewNode.dataset.refractionPending = '';
	} else {
		if (state.effectsPreviewNode) { state.effectsPreviewNode.remove(); state.effectsPreviewNode = null; }
		if (state.svg) state.svg.style.visibility = '';
	}
	if (render && state.open && state.recipe) _rapierDrawRenderAll();
}
function _rapierDrawEffectsValue() {
	const state = _rapierDrawState, targets = _rapierDrawEffectsTargets(), type = _rapierDrawEffectsType(), pending = state.effectsPendingChange;
	if (pending?.next && pending.session === state.session && pending.epoch === state.effectsChangeEpoch && pending.scope === state.effectsScope && pending.type === type) return pending.next;
	return targets.find(target => target.effect?.type === type)?.effect || _rapierEffects.effectPreset(type);
}
function _rapierDrawEffectsOpen(type = 'copier') {
	if (!Object.hasOwn(RAPIER_EFFECT_TITLES, type)) return;
	const state = _rapierDrawState, panel = state.surface?.querySelector('[data-draw-effects-panel]');
	if (!panel) return;
	const changed = type !== _rapierDrawEffectsType(), open = panel.hidden || changed, action = RAPIER_EFFECT_ACTIONS[type];
	_rapierDrawEffectsPreviewRelease(false);
	state.effectsCompare = false; state.effectsSweep = null; state.effectsGesture = null; state.settingEdit = null;
	if (changed) { state.effectsChangeEpoch = (state.effectsChangeEpoch || 0) + 1; state.effectsPendingChange = null; state.effectsSection = null; }
	state.effectsType = type; panel.dataset.drawPanel = action;
	_rapierDrawCloseSettingPanels(open ? action : '');
	panel.hidden = !open;
	for (const name of Object.values(RAPIER_EFFECT_ACTIONS)) state.surface.querySelector('[data-draw-act="' + name + '"]')?.setAttribute('aria-expanded', String(open && name === action));
	if (open && !_rapierDrawEffectsTargets().some(target => target.effect?.type === type)) _rapierDrawEffectsChange(_rapierEffects.effectPreset(type));
	_rapierDrawEffectsSync();
	_rapierDrawEffectsPreviewSchedule();
}
function _rapierDrawEffectsCompare() {
	const state = _rapierDrawState, ns = 'http://www.w3.org/2000/svg';
	if (state.effectsCompare && state.effectsPreviewNode) _rapierDrawEffectsPreviewRelease(false);
	for (const node of state.svg?.querySelectorAll('[data-effect-original]') || []) node.remove();
	const filters = new Map(Array.from(state.svg?.querySelectorAll('filter[id]') || [], filter => [filter.id, filter]));
	if (state.effectsCompare) for (const group of state.svg?.querySelectorAll('[data-effect-filter]') || []) {
		const filter = filters.get(group.dataset.effectFilter);
		if (!filter) continue;
		const merge = document.createElementNS(ns, 'feMerge'); merge.setAttribute('data-effect-original', '');
		for (const input of group.dataset.rapierEffect === 'copier' ? ['paper', 'SourceGraphic'] : ['SourceGraphic']) { const node = document.createElementNS(ns, 'feMergeNode'); node.setAttribute('in', input); merge.append(node); }
		filter.append(merge);
	}
	_rapierDrawLiquidSync(); _rapierDrawCopierSync();
}
function _rapierDrawEffectsWord(effect, key) {
	const value = effect[key];
	if (key === 'copies' || key === 'samples') return String(value);
	if (effect.type === 'liquid' && key === 'time') return Number(value.toFixed(1)) + ' s';
	if (effect.type === 'liquid' && key === 'speed') return Number(value.toFixed(2)) + '×';
	if (key === 'angle') return value + '°';
	if (key === 'drift' || key === 'amount' || key === 'blur') return value + ' px';
	if (key === 'contrast' || effect.type === 'refraction' && ['bump', 'amountX', 'amountY', 'red', 'blue'].includes(key)) return Number(value.toFixed(2)) + '×';
	return Math.round(value * 100) + '%';
}
function _rapierDrawEffectsSourceChoices(input, recipe, selected) {
	const choices = input.dataset.effectKey === 'lens' ? [['source', 'Artwork']] : [['none', 'None'], ['source', 'Artwork']];
	const groups = new Set(), current = recipe.shapes.find(shape => 'shape:' + shape.id === selected);
	for (const [index, shape] of recipe.shapes.entries()) {
		const group = shape.recognized === 'paint' && shape.paint?.group;
		if (group && groups.has(group)) continue;
		if (group) groups.add(group);
		const kind = shape.recognized === 'paint' ? shape.paint?.mode === 'water' ? 'Water layer' : 'Paint layer' : shape.recognized;
		const name = shape.label?.trim().replace(/\s+/g, ' ').slice(0, 36) || kind.charAt(0).toUpperCase() + kind.slice(1);
		const id = group && current?.paint?.group === group ? current.id : shape.id;
		choices.push(['shape:' + id, name + ' · ' + (index + 1)]);
	}
	const key = JSON.stringify(choices);
	if (input.rapierSourceChoices === key) return;
	input.rapierSourceChoices = key;
	input.replaceChildren(...choices.map(([value, title]) => { const option = document.createElement('option'); option.value = value; option.textContent = title; return option; }));
}
function _rapierDrawEffectsSync() {
	const state = _rapierDrawState, panel = state.surface?.querySelector('[data-draw-effects-panel]');
	if (!panel || !state.recipe) return;
	const type = _rapierDrawEffectsType(), targets = _rapierDrawEffectsTargets(), effect = _rapierDrawEffectsValue(), locked = targets.some(target => target.locked);
	const disabled = !targets.length || locked;
	const sections = RAPIER_EFFECT_SECTIONS[type], section = sections.some(([id]) => id === state.effectsSection) ? state.effectsSection : sections[0][0];
	state.effectsSection = section;
	panel.setAttribute('aria-label', _rapierDrawEffectsTitle(type) + ' settings');
	panel.querySelector('[data-effect-tabs]').setAttribute('aria-label', _rapierDrawEffectsTitle(type) + ' controls');
	for (const node of panel.querySelectorAll('[data-effect-type]')) node.hidden = node.dataset.effectType !== type || node.hasAttribute('data-effect-section') && node.dataset.effectSection !== section;
	for (const tab of panel.querySelectorAll('[data-effect-tab]')) {
		const chosen = tab.dataset.effectType === type && tab.dataset.effectTab === section;
		tab.setAttribute('aria-selected', String(chosen)); tab.tabIndex = chosen ? 0 : -1;
	}
	const scopes = panel.querySelector('[data-effect-scope]'); scopes.value = state.effectsScope || 'drawing';
	for (const option of scopes.options) {
		if (option.value === 'selection') option.disabled = !state.effectsSelection?.some(id => state.recipe.shapes.some(shape => shape.id === id));
		if (option.value === 'layer') option.disabled = !state.recipe.shapes.some(shape => shape.id === state.effectsLayer && shape.recognized === 'paint');
	}
	const presets = panel.querySelector('[data-effect-preset]');
	if (presets.dataset.effectPreset !== type) {
		presets.replaceChildren(); presets.dataset.effectPreset = type;
		for (const preset of type === 'refraction' ? _rapierEffects.REFRACTION_PRESETS : type === 'liquid' ? _rapierEffects.LIQUID_PRESETS : _rapierEffects.COPIER_PRESETS) {
			const option = document.createElement('option'); option.value = preset.id; option.textContent = preset.name; presets.append(option);
		}
		panel.querySelector('[data-effect-preset-title]').textContent = _rapierDrawEffectsTitle(type);
	}
	presets.value = effect.preset; presets.disabled = disabled;
	for (const input of panel.querySelectorAll('[data-effect-key]')) {
		const group = input.closest('[data-effect-type]'), active = group.dataset.effectType === type, key = input.dataset.effectKey;
		input.disabled = disabled || !active;
		if (!active) continue;
		if (input.tagName === 'BUTTON') {
			input.setAttribute('aria-checked', String(effect[key]));
			input.querySelector('[data-effect-state]').textContent = effect[key] ? 'On' : 'Off';
			continue;
		}
		if (key === 'lens' || key === 'matteSource') _rapierDrawEffectsSourceChoices(input, state.recipe, effect[key]);
		input.value = String(effect[key]);
		if (input.tagName === 'SELECT') continue;
		const word = _rapierDrawEffectsWord(effect, key);
		input.setAttribute('aria-valuetext', word); group.querySelector('[data-effect-output="' + key + '"]').textContent = word;
		_rapierDrawSeekSync(input);
	}
	const has = targets.some(target => target.effect), mixed = targets.some(target => JSON.stringify(target.effect) !== JSON.stringify(targets[0]?.effect));
	panel.querySelector('[data-effect-status]').textContent = !targets.length ? 'Select artwork with Select, then open Effects.' : locked ? 'Unlock the selection to change its effects.' : mixed ? 'Mixed settings · changes apply to each selected object' : has ? 'Original artwork stays editable' : 'Choose a preset or Apply to begin';
	for (const button of panel.querySelectorAll('[data-effect-action]')) {
		const action = button.dataset.effectAction;
		button.disabled = !targets.length || locked || (action === 'remove' || action === 'original') && !has;
		button.hidden = action === 'grain' && type === 'refraction';
		if (action === 'grain') button.textContent = type === 'liquid' ? 'New swirl' : 'New grain';
		if (action === 'original') button.setAttribute('aria-pressed', String(!!state.effectsCompare));
	}
	_rapierDrawEffectsCompare();
}
function _rapierDrawEffectsBuild(surface) {
	const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; };
	const panel = element('div', 'rapier-draw-copy-panel rapier-draw-text-spacing');
	panel.dataset.drawEffectsPanel = ''; panel.dataset.drawPanel = 'copyMachine'; panel.hidden = true; panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', 'Copy machine settings');
	const choices = element('div', 'rapier-draw-copy-choices');
	for (const [key, title, options] of [
		['scope', 'Apply to', [['drawing', 'Whole drawing'], ['selection', 'Selected objects'], ['layer', 'Paint layer']]],
		['preset', 'Copy machine', []],
	]) {
		const label = element('label'), heading = element('span', '', title), select = element('select');
		select.dataset[key === 'scope' ? 'effectScope' : 'effectPreset'] = '';
		if (key === 'preset') heading.dataset.effectPresetTitle = '';
		for (const [value, title] of options) { const option = element('option', '', title); option.value = value; select.append(option); }
		label.append(heading, select); choices.append(label);
		select.addEventListener('change', () => {
			const state = _rapierDrawState; if (state.finishing) return;
			_rapierDrawEffectsPreviewRelease(false);
			state.effectsSweep = null; state.effectsGesture = null; state.settingEdit = null; state.effectsCompare = false;
			if (key === 'scope') {
				state.effectsChangeEpoch = (state.effectsChangeEpoch || 0) + 1; state.effectsPendingChange = null;
				state.effectsScope = select.value; _rapierDrawEffectsSync(); _rapierDrawEffectsPreviewSchedule();
			} else _rapierDrawEffectsChange(_rapierEffects.effectPreset(_rapierDrawEffectsType(), select.value, _rapierDrawEffectsValue().seed));
		});
	}
	panel.append(choices);
	const tabs = element('div', 'rapier-draw-copy-tabs'); tabs.dataset.effectTabs = ''; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Copy machine controls');
	panel.append(tabs);
	for (const type of Object.keys(RAPIER_EFFECT_SECTIONS)) for (const [section, title] of RAPIER_EFFECT_SECTIONS[type]) {
		const button = element('button', 'rapier-draw-chip', title); button.type = 'button'; button.dataset.effectTab = section; button.dataset.effectType = type;
		button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', 'false'); button.id = 'rapier-effect-tab-' + section; button.setAttribute('aria-controls', 'rapier-effect-controls-' + section); button.tabIndex = -1;
		tabs.append(button);
		const group = element('div'); group.dataset.effectSection = section; group.dataset.effectType = type; group.hidden = true; group.id = 'rapier-effect-controls-' + section;
		group.setAttribute('role', 'tabpanel'); group.setAttribute('aria-labelledby', button.id);
		for (const [, key, title, min, max, step] of RAPIER_EFFECT_CONTROLS[type].filter(row => row[0] === section)) {
			const row = element('div', 'rapier-draw-metric'), label = element('label', '', title), input = element('input'), output = element('output');
			input.type = 'range'; input.min = min; input.max = max; input.step = step; input.id = 'rapier-effect-' + type + '-' + key; input.dataset.effectKey = key;
			label.htmlFor = input.id; output.htmlFor = input.id; output.dataset.effectOutput = key;
			row.append(label, input, output); group.append(row);
			const begin = () => {
				const state = _rapierDrawState;
				state.effectsSweep = null; state.effectsGesture = state.settingEdit = { changed: false, entry: null, previewKey: key }; state.effectsPreviewHold = type === 'refraction' || type === 'copier' && !_rapierDrawCopierLive();
			};
			input.addEventListener('pointerdown', begin);
			input.addEventListener('keydown', event => { if (!event.repeat && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) begin(); });
			input.addEventListener('input', () => { _rapierDrawEffectsChange({ ..._rapierDrawEffectsValue(), [key]: Number(input.value) }, true); });
			const release = () => {
				const state = _rapierDrawState;
				const refine = state.effectsPreviewNode?.dataset.refractionScale === '0.5';
				state.effectsSweep = null; state.effectsGesture = null; state.settingEdit = null;
				if (state.effectsPreviewHold || state.effectsPreviewNode) _rapierDrawEffectsPreviewRelease(true, refine);
				else _rapierDrawCopierSync();
			};
			for (const event of ['change', 'blur', 'keyup', 'pointerup', 'pointercancel', 'lostpointercapture']) input.addEventListener(event, release);
		}
		if (section === 'colour') {
			const row = element('div', 'rapier-draw-copy-choices'), label = element('label', '', 'Palette'), select = element('select'); select.dataset.effectKey = 'palette';
			for (const palette of _rapierEffects.LIQUID_PALETTES) { const option = element('option', '', palette.name); option.value = palette.id; select.append(option); }
			select.addEventListener('change', () => _rapierDrawEffectsChange({ ..._rapierDrawEffectsValue(), palette: select.value }));
			label.append(select); row.append(label); group.prepend(row);
		}
		if (type === 'refraction' && section === 'lens') {
			const row = element('div', 'rapier-draw-copy-choices');
			for (const [key, title] of [['lens', 'Lens source'], ['matteSource', 'Matte source']]) {
				const label = element('label', '', title), select = element('select'); select.dataset.effectKey = key;
				select.addEventListener('change', () => _rapierDrawEffectsChange({ ..._rapierDrawEffectsValue(), [key]: select.value }));
				label.append(select); row.append(label);
			}
			group.append(row);
		}
		if (section === 'direction') {
			const row = element('div', 'rapier-draw-copy-choices'), label = element('label', '', type === 'refraction' ? 'Wrap' : 'Edges'), select = element('select'); select.dataset.effectKey = 'edge';
			const edges = [['reflect', 'Reflect'], ['tile', 'Repeat'], ...(type === 'refraction' ? [['clamp', 'Extend edge']] : []), ['transparent', 'Transparent']];
			for (const [value, title] of edges) { const option = element('option', '', title); option.value = value; select.append(option); }
			select.addEventListener('change', () => _rapierDrawEffectsChange({ ..._rapierDrawEffectsValue(), edge: select.value }));
			label.append(select); row.append(label); group.append(row);
		}
		if (type === 'refraction') for (const [place, key, title] of [['spectrum', 'whiteBalance', 'White balance'], ['spectrum', 'adaptive', 'Adaptive filter'], ['direction', 'crop', 'Crop to artwork']]) {
			if (place !== section) continue;
			const toggle = element('button', 'rapier-draw-option'); toggle.type = 'button'; toggle.dataset.effectKey = key;
			toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-checked', 'false');
			const label = element('span', '', title), value = element('span'); value.dataset.effectState = ''; value.setAttribute('aria-hidden', 'true');
			toggle.append(label, value);
			group.append(toggle);
		}
		panel.append(group);
	}
	tabs.addEventListener('keydown', event => {
		if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
		const buttons = Array.from(tabs.querySelectorAll('[data-effect-tab]')).filter(button => !button.hidden), at = buttons.indexOf(event.target);
		if (at < 0) return;
		event.preventDefault();
		const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (at + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
		_rapierDrawState.effectsSection = buttons[index].dataset.effectTab; _rapierDrawEffectsSync(); buttons[index].focus();
	});
	const actions = element('div', 'rapier-draw-copy-actions');
	for (const [action, title] of [['apply', 'Apply'], ['original', 'Original'], ['grain', 'New grain'], ['remove', 'Remove']]) {
		const button = element('button', 'rapier-draw-chip', title); button.type = 'button'; button.dataset.effectAction = action; actions.append(button);
	}
	panel.append(actions);
	const status = element('p', 'rapier-draw-copy-status'); status.dataset.effectStatus = ''; status.setAttribute('aria-live', 'polite'); panel.append(status);
	surface.querySelector('.rapier-draw-panels').append(panel);
	surface.addEventListener('pointerdown', event => {
		const state = _rapierDrawState, sourcePress = event.target.closest('.rapier-draw-canvas') || event.target === state.svgRoot?.parentElement;
		if (state.dropper) return;
		if ((state.effectsPreviewHold || state.effectsPreviewNode) && (sourcePress || !globalThis.RapierDrawRefraction.hasRefraction(state.recipe) && !event.target.closest('[data-draw-effects-panel]'))) _rapierDrawEffectsPreviewRelease(false);
	}, { capture: true });
	surface.addEventListener('pointerup', () => requestAnimationFrame(() => { if (!_rapierDrawState.effectsPreviewNode) _rapierDrawEffectsPreviewSchedule(); }));
	window.addEventListener('resize', () => { if (_rapierDrawState.effectsPreviewHold || _rapierDrawState.effectsPreviewNode) _rapierDrawEffectsPreviewRelease(); });
	_rapierDrawBindTap(panel, event => {
		const state = _rapierDrawState; if (state.finishing) return;
		const tab = event.target.closest('[data-effect-tab]');
		if (tab) { state.effectsSection = tab.dataset.effectTab; _rapierDrawEffectsSync(); return; }
		const toggle = event.target.closest('button[data-effect-key]');
		if (toggle) {
			if (toggle.disabled) return;
			const effect = _rapierDrawEffectsValue(), key = toggle.dataset.effectKey;
			_rapierDrawEffectsChange({ ...effect, [key]: !effect[key] }); return;
		}
		const button = event.target.closest('[data-effect-action]'); if (!button || button.disabled) return;
		const action = button.dataset.effectAction; state.effectsSweep = null; state.effectsGesture = null; state.settingEdit = null;
		_rapierDrawEffectsPreviewRelease(false);
		if (action === 'original') { state.effectsCompare = !state.effectsCompare; _rapierDrawEffectsSync(); if (!state.effectsCompare) _rapierDrawEffectsPreviewSchedule(); }
		else if (action === 'remove') _rapierDrawEffectsChange(null);
		else if (action === 'grain' && _rapierDrawEffectsType() !== 'refraction') _rapierDrawEffectsChange({ ..._rapierDrawEffectsValue(), seed: crypto.getRandomValues(new Uint32Array(1))[0] % 2147483647 });
		else _rapierDrawEffectsChange(_rapierDrawEffectsValue());
		_rapierDrawEffectsPreviewSchedule();
	});
}
