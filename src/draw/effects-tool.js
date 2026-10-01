// SPDX-License-Identifier: AGPL-3.0-only
const _rapierCopier = globalThis.RapierDrawCore;
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
}
function _rapierDrawEffectsChange(effect, continuous = false) {
	const state = _rapierDrawState, targets = _rapierDrawEffectsTargets();
	if (state.finishing || !targets.length || targets.some(target => target.locked)) return false;
	const next = effect === null ? null : _rapierCopier.admitCopier(effect);
	if (effect !== null && !next) return false;
	if (targets.every(target => JSON.stringify(target.effect || null) === JSON.stringify(next))) return false;
	// Commands clone the recipe. Capture identities, not the old objects, and never fall back
	// to the whole drawing when an Undo or deletion removes a chosen target.
	const whole = state.effectsScope === 'drawing', ids = new Set(targets.map(target => target.id));
	const sweeping = continuous && !!state.effectsSweep && state.effectsSweep === state.undoStack.at(-1);
	const ok = _rapierDrawCommand(() => {
		for (const target of whole ? [state.recipe] : state.recipe.shapes.filter(shape => ids.has(shape.id))) {
			if (next) target.effect = { ...next }; else delete target.effect;
		}
	}, !sweeping, false);
	if (ok && continuous) state.effectsSweep = state.undoStack.at(-1);
	state.effectsCompare = false;
	if (ok) _rapierDrawRenderAll();
	_rapierDrawEffectsSync();
	_rapierPaintSyncPaper();
	return ok;
}
function _rapierDrawEffectsValue() {
	const targets = _rapierDrawEffectsTargets();
	return targets.find(target => target.effect)?.effect || _rapierCopier.copierPreset();
}
function _rapierDrawEffectsOpen() {
	const state = _rapierDrawState, panel = state.surface?.querySelector('[data-draw-panel="copyMachine"]');
	if (!panel) return;
	const open = panel.hidden;
	_rapierDrawCloseSettingPanels(open ? 'copyMachine' : '');
	panel.hidden = !open;
	state.surface.querySelector('[data-draw-act="copyMachine"]')?.setAttribute('aria-expanded', String(open));
	if (open && !_rapierDrawEffectsTargets().some(target => target.effect)) _rapierDrawEffectsChange(_rapierCopier.copierPreset());
	_rapierDrawEffectsSync();
}
function _rapierDrawEffectsCompare() {
	const state = _rapierDrawState, ns = 'http://www.w3.org/2000/svg';
	for (const node of state.svg?.querySelectorAll('[data-copy-original]') || []) node.remove();
	if (state.effectsCompare) for (const group of state.svg?.querySelectorAll('[data-copy-filter]') || []) {
		const filter = state.svg.querySelector('#' + group.dataset.copyFilter);
		if (!filter) continue;
		const merge = document.createElementNS(ns, 'feMerge'); merge.setAttribute('data-copy-original', '');
		for (const input of ['paper', 'SourceGraphic']) { const node = document.createElementNS(ns, 'feMergeNode'); node.setAttribute('in', input); merge.append(node); }
		filter.append(merge);
	}
}
function _rapierDrawEffectsSync() {
	const state = _rapierDrawState, panel = state.surface?.querySelector('[data-draw-panel="copyMachine"]');
	if (!panel || !state.recipe) return;
	const targets = _rapierDrawEffectsTargets(), effect = _rapierDrawEffectsValue(), locked = targets.some(target => target.locked);
	const scopes = panel.querySelector('[data-copy-scope]'); scopes.value = state.effectsScope || 'drawing';
	for (const option of scopes.options) {
		if (option.value === 'selection') option.disabled = !state.effectsSelection?.some(id => state.recipe.shapes.some(shape => shape.id === id));
		if (option.value === 'layer') option.disabled = !state.recipe.shapes.some(shape => shape.id === state.effectsLayer && shape.recognized === 'paint');
	}
	panel.querySelector('[data-copy-preset]').value = effect.preset;
	for (const input of panel.querySelectorAll('[data-copy-key]')) {
		const key = input.dataset.copyKey; input.value = String(effect[key]); input.disabled = !targets.length || locked;
		const word = key === 'copies' ? String(effect[key]) : key === 'angle' ? effect[key] + '°' : key === 'drift' ? effect[key] + ' px' : key === 'contrast' ? effect[key].toFixed(2) + '×' : Math.round(effect[key] * 100) + '%';
		input.setAttribute('aria-valuetext', word); panel.querySelector('[data-copy-output="' + key + '"]').textContent = word;
		_rapierDrawSeekSync(input);
	}
	const has = targets.some(target => target.effect), mixed = targets.some(target => JSON.stringify(target.effect) !== JSON.stringify(targets[0]?.effect));
	panel.querySelector('[data-copy-status]').textContent = !targets.length ? 'Select artwork with Select, then open Effects.' : locked ? 'Unlock the selection to change its effects.' : mixed ? 'Mixed settings · changes apply to each selected object' : has ? 'Original artwork stays editable' : 'Choose a preset or Apply to begin';
	for (const button of panel.querySelectorAll('[data-copy-action]')) {
		const action = button.dataset.copyAction;
		button.disabled = !targets.length || locked || (action === 'remove' || action === 'original') && !has;
		if (action === 'original') button.setAttribute('aria-pressed', String(!!state.effectsCompare));
	}
	panel.querySelector('[data-copy-preset]').disabled = !targets.length || locked;
	_rapierDrawEffectsCompare();
}
function _rapierDrawEffectsBuild(surface) {
	const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text; return node; };
	const panel = element('div', 'rapier-draw-copy-panel rapier-draw-text-spacing');
	panel.dataset.drawPanel = 'copyMachine'; panel.hidden = true; panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', 'Copy machine settings');
	const choices = element('div', 'rapier-draw-copy-choices');
	for (const [key, title, options] of [
		['scope', 'Apply to', [['drawing', 'Whole drawing'], ['selection', 'Selected objects'], ['layer', 'Paint layer']]],
		['preset', 'Copy machine', _rapierCopier.COPIER_PRESETS.map(preset => [preset.id, preset.name])],
	]) {
		const label = element('label', '', title), select = element('select'); select.dataset[key === 'scope' ? 'copyScope' : 'copyPreset'] = '';
		for (const [value, title] of options) { const option = element('option', '', title); option.value = value; select.append(option); }
		label.append(select); choices.append(label);
		select.addEventListener('change', () => {
			const state = _rapierDrawState; if (state.finishing) return;
			state.effectsSweep = null; state.effectsCompare = false;
			if (key === 'scope') { state.effectsScope = select.value; _rapierDrawEffectsSync(); }
			else _rapierDrawEffectsChange(_rapierCopier.copierPreset(select.value, _rapierDrawEffectsValue().seed));
		});
	}
	panel.append(choices);
	const tabs = element('div', 'rapier-draw-copy-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Copy machine controls');
	for (const [section, title] of [['copy', 'Copies'], ['toner', 'Toner'], ['paper', 'Paper']]) {
		const button = element('button', 'rapier-draw-chip', title); button.type = 'button'; button.dataset.copyTab = section;
		button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(section === 'copy')); button.id = 'rapier-copy-tab-' + section; button.setAttribute('aria-controls', 'rapier-copy-controls-' + section);
		tabs.append(button);
	}
	panel.append(tabs);
	for (const section of ['copy', 'toner', 'paper']) {
		const group = element('div'); group.dataset.copySection = section; group.hidden = section !== 'copy'; group.id = 'rapier-copy-controls-' + section;
		group.setAttribute('role', 'tabpanel'); group.setAttribute('aria-labelledby', 'rapier-copy-tab-' + section);
		for (const [, key, title, min, max, step] of RAPIER_COPY_CONTROLS.filter(row => row[0] === section)) {
			const row = element('div', 'rapier-draw-metric'), label = element('label', '', title), input = element('input'), output = element('output');
			input.type = 'range'; input.min = min; input.max = max; input.step = step; input.id = 'rapier-copy-' + key; input.dataset.copyKey = key;
			label.htmlFor = input.id; output.htmlFor = input.id; output.dataset.copyOutput = key;
			row.append(label, input, output); group.append(row);
			const begin = () => { _rapierDrawState.effectsSweep = null; _rapierDrawState.settingEdit = {}; };
			input.addEventListener('pointerdown', begin); input.addEventListener('keydown', event => { if (!event.repeat) begin(); });
			input.addEventListener('input', () => { _rapierDrawEffectsChange({ ..._rapierDrawEffectsValue(), [key]: Number(input.value) }, true); });
			for (const event of ['change', 'blur', 'keyup', 'pointercancel']) input.addEventListener(event, () => { _rapierDrawState.effectsSweep = null; _rapierDrawState.settingEdit = null; });
		}
		panel.append(group);
	}
	const actions = element('div', 'rapier-draw-copy-actions');
	for (const [action, title] of [['apply', 'Apply'], ['original', 'Original'], ['grain', 'New grain'], ['remove', 'Remove']]) {
		const button = element('button', 'rapier-draw-chip', title); button.type = 'button'; button.dataset.copyAction = action; actions.append(button);
	}
	panel.append(actions);
	const status = element('p', 'rapier-draw-copy-status'); status.dataset.copyStatus = ''; status.setAttribute('aria-live', 'polite'); panel.append(status);
	surface.querySelector('.rapier-draw-panels').append(panel);
	_rapierDrawBindTap(panel, event => {
		const state = _rapierDrawState; if (state.finishing) return;
		const tab = event.target.closest('[data-copy-tab]');
		if (tab) { for (const button of tabs.children) button.setAttribute('aria-selected', String(button === tab)); for (const group of panel.querySelectorAll('[data-copy-section]')) group.hidden = group.dataset.copySection !== tab.dataset.copyTab; return; }
		const button = event.target.closest('[data-copy-action]'); if (!button || button.disabled) return;
		const action = button.dataset.copyAction; state.effectsSweep = null;
		if (action === 'original') { state.effectsCompare = !state.effectsCompare; _rapierDrawEffectsSync(); }
		else if (action === 'remove') _rapierDrawEffectsChange(null);
		else if (action === 'grain') _rapierDrawEffectsChange({ ..._rapierDrawEffectsValue(), seed: crypto.getRandomValues(new Uint32Array(1))[0] % 2147483647 });
		else _rapierDrawEffectsChange(_rapierDrawEffectsValue());
	});
}
