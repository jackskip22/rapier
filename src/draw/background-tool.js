// SPDX-License-Identifier: AGPL-3.0-only
// The canvas background editor: one panel under the settings row and handles on the canvas itself. The panel chooses
// the kind (none, solid, linear, radial, free, wave), offers starting points, and carries the band bar: the gradient
// drawn as a strip with a handle per colour, drag to move a colour along, tap a handle to choose its colour, tap the
// strip to add one, drag a handle off the strip to take it away. On the canvas: a linear or wave gradient's two
// ends, a radial's centre and ring, a free-form's colour points (tap the canvas to drop another). A finger's whole
// gesture is one Undo; while it moves the canvas shows a draft, never the recipe, so the history only ever holds
// where the finger let go.
const _rapierBg = globalThis.RapierDrawCore;
const RAPIER_BG_SLIDERS = {
	bloom: [['petals', 'Petals', 3, 16, 1], ['layers', 'Layers', 2, 12, 1], ['size', 'Size', 0, 1, 0.01], ['twist', 'Twist', 0, 1, 0.01], ['glow', 'Glow', 0, 1, 0.01]],
	ribbon: [['width', 'Width', 0, 1, 0.01], ['bands', 'Bands', 2, 24, 1], ['glow', 'Glow', 0, 1, 0.01]],
	texture: [['scale', 'Size', 0.002, 0.2, 0.001], ['strength', 'Strength', 0, 1, 0.01], ['seed', 'Seed', 0, 999, 1]],
	aurora: [['curtains', 'Curtains', 1, 6, 1], ['height', 'Height', 0, 1, 0.01], ['sway', 'Sway', 0, 1, 0.01], ['rays', 'Rays', 0, 1, 0.01], ['stars', 'Stars', 0, 1, 0.01], ['glow', 'Glow', 0, 1, 0.01], ['seed', 'Seed', 0, 999, 1]],
	flow: [['lines', 'Lines', 8, 400, 1], ['scale', 'Scale', 0, 1, 0.01], ['swirl', 'Swirl', 0, 1, 0.01], ['weight', 'Weight', 0, 1, 0.01], ['glow', 'Glow', 0, 1, 0.01], ['seed', 'Seed', 0, 999, 1]],
	topo: [['lines', 'Levels', 8, 400, 1], ['scale', 'Scale', 0, 1, 0.01], ['swirl', 'Warp', 0, 1, 0.01], ['weight', 'Weight', 0, 1, 0.01], ['glow', 'Glow', 0, 1, 0.01], ['seed', 'Seed', 0, 999, 1]],
	grid: [['lines', 'Lines', 6, 48, 1], ['horizon', 'Horizon', 0, 1, 0.01], ['sun', 'Sun', 0, 1, 0.01], ['glow', 'Glow', 0, 1, 0.01], ['tilt', 'Spread', 0, 1, 0.01]],
	glyphs: [['cols', 'Size', 6, 64, 1], ['density', 'Density', 0, 1, 0.01], ['wobble', 'Wobble', 0, 1, 0.01], ['glow', 'Glow', 0, 1, 0.01], ['seed', 'Seed', 0, 999, 1]],
	rays: [['count', 'Count', 3, 64, 1], ['spread', 'Spread', 0, 1, 0.01], ['curve', 'Curve', 0, 1, 0.01], ['glow', 'Glow', 0, 1, 0.01]],
	echo: [['count', 'Count', 2, 64, 1], ['size', 'Size', 0, 1, 0.01], ['round', 'Round', 0, 1, 0.01], ['turn', 'Turn', 0, 1, 0.01]],
};
// Glow modes, one row for every kind that glows: the slider below still sets any value in between.
const RAPIER_BG_GLOW_MODES = [['off', 'Off', 0], ['soft', 'Soft', 0.35], ['neon', 'Neon', 0.85]];
const RAPIER_BG_GLOWS = new Set(['rails', 'bloom', 'ribbon', 'rays', 'glyphs', 'grid', 'flow', 'topo', 'aurora']);
const RAPIER_BG_KINDS = [['none', 'None'], ['solid', 'Solid'], ['linear', 'Linear'], ['radial', 'Radial'], ['freeform', 'Free'], ['wave', 'Wave'], ['rails', 'Rails'], ['bloom', 'Bloom'], ['ribbon', 'Ribbon'], ['echo', 'Echo'], ['rays', 'Rays'], ['glyphs', 'Glyphs'], ['grid', 'Grid'], ['flow', 'Flow'], ['topo', 'Topo'], ['aurora', 'Aurora'], ['texture', 'Texture']];

function _rapierBgOpen() { const panel = _rapierBgPanel(); return !!panel && !panel.hidden; }
function _rapierBgCurrent() { const state = _rapierDrawState; return state.bgDraft !== undefined ? state.bgDraft : (state.recipe?.background || null); }
function _rapierBgDark() { return typeof _rapierDrawDarkPaper === 'function' && _rapierDrawDarkPaper(); }
// The paper's own rectangle in canvas units: what the background fills, live and saved alike.
function _rapierBgRect() {
	const recipe = _rapierDrawState.recipe;
	return recipe?.canvas ? (typeof _rapierDrawPaperView === 'function' ? _rapierDrawPaperView(recipe) : { x: 0, y: 0, w: recipe.canvas.w, h: recipe.canvas.h }) : null;
}

// Live: the background sits right over the paper and under every shape. Drawn again only when what it depends on
// changes (a wave's turbulence is costly to repaint every frame).
function _rapierDrawBackgroundSync() {
	const state = _rapierDrawState, svg = state.svgRoot;
	if (!svg) return;
	let layer = svg.querySelector('.rapier-draw-background');
	const paper = svg.querySelector('.rapier-draw-paper');
	if (!layer && paper) { layer = document.createElementNS('http://www.w3.org/2000/svg', 'g'); layer.setAttribute('class', 'rapier-draw-background'); paper.after(layer); }
	if (!layer) return;
	const bg = _rapierBgCurrent(), rect = _rapierBgRect(), dark = _rapierBgDark();
	const key = bg && rect ? JSON.stringify([bg, rect, dark]) : '';
	if (layer.dataset.key !== key) {
		layer.dataset.key = key;
		// One image, not inline markup: the browser rasterizes the background once and reuses it while the canvas pans
		// and pinches, instead of re-running its blurs and noise every frame. The saved drawing keeps the procedural SVG
		// (core.mjs); this is the live view only.
		layer.replaceChildren();
		if (key) {
			const ns = 'http://www.w3.org/2000/svg', image = document.createElementNS(ns, 'image');
			const doc = '<svg xmlns="' + ns + '" viewBox="' + [rect.x, rect.y, rect.w, rect.h].join(' ') + '" width="' + rect.w + '" height="' + rect.h + '">' + _rapierBg._rapierDrawBackgroundSVG(bg, rect, 'rapier-draw-live-bg', dark) + '</svg>';
			for (const [name, value] of [['x', rect.x], ['y', rect.y], ['width', rect.w], ['height', rect.h], ['preserveAspectRatio', 'none']]) image.setAttribute(name, String(value));
			image.setAttribute('href', 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(doc));
			image.setAttribute('pointer-events', 'none');
			layer.appendChild(image);
		}
	}
	_rapierBgSyncHandles();
}

// One slider row in the house form: the word, then the seek track, as in the shape menu.
function _rapierBgSeek(word, attrs) {
	return '<label class="rapier-draw-control rapier-draw-control--seek"><span class="rapier-draw-bgpanel-word">' + word + '</span><input type="range" ' + attrs + ' aria-label="' + word + '"></label>';
}
function _rapierBgPanel() { return _rapierDrawState.surface?.querySelector('[data-draw-panel="background"]'); }
function _rapierBgEnsurePanel() {
	const surface = _rapierDrawState.surface;
	if (!surface) return null;
	let panel = _rapierBgPanel();
	if (panel) return panel;
	const anchor = surface.querySelector('[data-draw-panel="angle"]') || surface.querySelector('[data-draw-panel]');
	if (!anchor) return null;
	panel = document.createElement('div');
	panel.className = 'rapier-draw-bgpanel'; panel.dataset.drawPanel = 'background'; panel.hidden = true;
	panel.setAttribute('role', 'group'); panel.setAttribute('aria-label', 'Background');
	panel.innerHTML = '<div class="rapier-draw-bgpanel-kinds" role="radiogroup" aria-label="Background kind">' +
		RAPIER_BG_KINDS.map(([kind, word]) => '<button type="button" class="rapier-draw-chip" role="radio" data-draw-bg-kind="' + kind + '" aria-checked="false">' + word + '</button>').join('') + '</div>' +
		'<div class="rapier-draw-bgpanel-presets" role="group" aria-label="Starting points"></div>' +
		'<div class="rapier-draw-bgpanel-bar" data-draw-bg-bar aria-label="Colours. Drag a handle along to move a colour, tap it to choose, drag it away to remove; tap the strip to add a colour"><svg class="rapier-draw-bgpanel-strip" preserveAspectRatio="none" aria-hidden="true"></svg></div>' +
		'<div class="rapier-draw-bgpanel-solid"><button type="button" class="rapier-draw-chip" data-draw-bg-pick>Colour</button></div>' +
		'<div class="rapier-draw-bgpanel-wave">' + _rapierBgSeek('Flow', 'min="0" max="1" step="0.01" data-draw-bg-flow') +
		_rapierBgSeek('Size', 'min="0" max="1" step="0.01" data-draw-bg-size') +
		'<button type="button" class="rapier-draw-chip" data-draw-bg-shuffle>Shuffle</button></div>' +
		'<div class="rapier-draw-bgpanel-rails"><div class="rapier-draw-bgpanel-forms" role="radiogroup" aria-label="Rails form">' + [['lines', 'Lines'], ['fan', 'Fan'], ['spiral', 'Spiral'], ['burst', 'Burst']].map(([f, word]) => '<button type="button" class="rapier-draw-chip" role="radio" data-draw-bg-form="' + f + '" aria-checked="false">' + word + '</button>').join('') + '</div>' +
		_rapierBgSeek('Count', 'min="4" max="96" step="1" data-draw-bg-rails="count"') +
		_rapierBgSeek('Glow', 'min="0" max="1" step="0.01" data-draw-bg-rails="glow"') +
		_rapierBgSeek('Bend', 'min="0" max="1" step="0.01" data-draw-bg-rails="bend"') + '</div>' +
		'<div class="rapier-draw-bgpanel-forms rapier-draw-bgpanel-styles" role="radiogroup" aria-label="Glyph style">' + [['marks', 'Marks'], ['halftone', 'Halftone'], ['blocks', 'Blocks'], ['rain', 'Rain'], ['circuit', 'Circuit']].map(([v, word]) => '<button type="button" class="rapier-draw-chip" role="radio" data-draw-bg-style="' + v + '" aria-checked="false">' + word + '</button>').join('') + '</div>' +
		'<div class="rapier-draw-bgpanel-forms rapier-draw-bgpanel-textures" role="radiogroup" aria-label="Texture">' + [['weave', 'Weave'], ['linen', 'Linen'], ['dots', 'Dots'], ['lines', 'Lines'], ['grid', 'Grid'], ['grain', 'Grain']].map(([v, word]) => '<button type="button" class="rapier-draw-chip" role="radio" data-draw-bg-texture="' + v + '" aria-checked="false">' + word + '</button>').join('') + '</div>' +
		'<div class="rapier-draw-bgpanel-forms rapier-draw-bgpanel-glowmodes" role="radiogroup" aria-label="Glow">' + RAPIER_BG_GLOW_MODES.map(([v, word]) => '<button type="button" class="rapier-draw-chip" role="radio" data-draw-bg-glowmode="' + v + '" aria-checked="false">Glow ' + word + '</button>').join('') + '</div>' +
		'<div class="rapier-draw-bgpanel-shape" data-draw-bg-shape></div>' +
		'<div class="rapier-draw-bgpanel-glow">' + _rapierBgSeek('Glow', 'min="0.05" max="1.5" step="0.01" data-draw-bg-glow') +
		'<button type="button" class="rapier-draw-chip" data-draw-bg-remove-point>Remove</button></div>' +
		'<input type="color" class="rapier-draw-bgpanel-colour" data-draw-bg-colour tabindex="-1" aria-hidden="true">';
	for (const input of panel.querySelectorAll('input[type="range"]')) _rapierDrawSeekWrap(input);
	anchor.after(panel);
	_rapierBgBindPanel(panel);
	return panel;
}

// Opened from the canvas menu's BACKGROUND row (or anything else that wants it).
function _rapierDrawOpenBackground() {
	const panel = _rapierBgEnsurePanel();
	if (!panel) return;
	if (typeof _rapierDrawCloseSettingPanels === 'function') _rapierDrawCloseSettingPanels('background');
	panel.hidden = false;
	_rapierBgBindStage();
	_rapierBgSyncPanel();
	_rapierDrawBackgroundSync();
}
function _rapierDrawCloseBackground() {
	const panel = _rapierBgPanel();
	if (panel) panel.hidden = true;
	_rapierDrawState.bgPoint = null;
	_rapierBgSyncHandles();
}

// One finger gesture, one step: the draft shows while it moves; letting go writes it once.
function _rapierBgDraft(next) { _rapierDrawState.bgDraft = next; _rapierDrawBackgroundSync(); _rapierBgSyncPanel(); }
function _rapierBgCommit(next) {
	const state = _rapierDrawState;
	delete state.bgDraft;
	const admitted = next ? _rapierBg._rapierDrawNormalizeBackground(next) : null;
	if (next && !admitted) { _rapierDrawBackgroundSync(); _rapierBgSyncPanel(); return false; }
	if (JSON.stringify(state.recipe.background || null) === JSON.stringify(admitted)) { _rapierDrawBackgroundSync(); _rapierBgSyncPanel(); return false; }
	const done = _rapierDrawCommand(() => { if (admitted) state.recipe.background = admitted; else delete state.recipe.background; });
	const after = () => { if (typeof _rapierDrawRenderAll === 'function') _rapierDrawRenderAll(); _rapierDrawBackgroundSync(); _rapierBgSyncPanel(); };
	if (done && typeof done.then === 'function') done.then(after); else after();
	return true;
}

const _rapierBgCopy = bg => bg ? JSON.parse(JSON.stringify(bg)) : null;
function _rapierBgStopsFrom(bg) {
	if (bg?.stops) return _rapierBgCopy(bg.stops);
	if (bg?.kind === 'solid') return [{ at: 0, color: bg.color }, { at: 1, color: bg.color }];
	if (bg?.kind === 'freeform') return bg.points.slice(0, 2).map((p, i) => ({ at: i, color: p.color })).concat(bg.points.length < 2 ? [{ at: 1, color: '#ffffff' }] : []);
	return [{ at: 0, color: '#ffd6a5' }, { at: 1, color: '#bdb2ff', ease: 'smooth' }];
}
// Turning one kind into another keeps the colours the person already chose.
function _rapierBgAsKind(kind, from) {
	if (kind === 'none') return null;
	const stops = _rapierBgStopsFrom(from), first = stops[0].color;
	if (kind === 'solid') return { kind, color: from?.kind === 'solid' ? from.color : first };
	if (kind === 'linear') return { kind, x1: from?.x1 ?? 0, y1: from?.y1 ?? 0, x2: from?.x2 ?? 1, y2: from?.y2 ?? 1, stops };
	if (kind === 'radial') return { kind, cx: from?.cx ?? 0.5, cy: from?.cy ?? 0.5, r: from?.r ?? 1, stops };
	if (kind === 'wave') return { kind, x1: from?.x1 ?? 0, y1: from?.y1 ?? 0.2, x2: from?.x2 ?? 1, y2: from?.y2 ?? 0.8, flow: 0.6, size: 0.2, seed: 7, stops };
	if (kind === 'bloom') return { kind, petals: 8, layers: 6, cx: 0.5, cy: 0.5, size: 0.75, twist: 0.08, glow: 0.6, stops };
	if (kind === 'ribbon') return { kind, points: [{ x: -0.05, y: 0.2 }, { x: 0.4, y: 0.35 }, { x: 0.5, y: 0.65 }, { x: 1.05, y: 0.85 }], width: 0.5, bands: 9, glow: 0.5, stops };
	if (kind === 'flow') return { kind, seed: 4, lines: 220, scale: 0.35, swirl: 0.4, weight: 0.3, glow: 0, stops };
	if (kind === 'texture') return { kind, texture: from?.texture || 'weave', scale: 0.025, strength: 0.6, seed: 1 };
	if (kind === 'aurora') return { kind, seed: 3, curtains: 3, height: 0.6, sway: 0.5, rays: 0.6, stars: 0.5, glow: 0.4, stops };
	if (kind === 'topo') return { kind, seed: 8, lines: 96, scale: 0.4, swirl: 0.3, weight: 0.3, glow: 0, stops };
	if (kind === 'grid') return { kind, lines: 20, horizon: 0.35, sun: 0.6, glow: 0.7, tilt: 0.3, stops };
	if (kind === 'glyphs') return { kind, style: 'marks', glow: 0.7, cols: 24, seed: 3, x1: 0.2, y1: 0.2, x2: 0.8, y2: 0.8, density: 0.85, wobble: 0.8, stops };
	if (kind === 'rays') return { kind, glow: 0.5, form: 'hourglass', count: 20, cx: 0.5, cy: 0.5, spread: 0.55, curve: 0.45, stops };
	if (kind === 'echo') return { kind, x1: 0.6, y1: 0.8, x2: 0.4, y2: 0.25, count: 32, size: 0.65, round: 0.35, turn: 0.1, stops };
	if (kind === 'rails') return { kind, form: from?.form || 'spiral', count: from?.count || 24, glow: 0.5, bend: 0.4, cx: from?.cx ?? 0.5, cy: from?.cy ?? 0.5, stops };
	if (from?.kind === 'freeform') return _rapierBgCopy(from);
	const spots = [[0.2, 0.25], [0.8, 0.3], [0.5, 0.85], [0.15, 0.8], [0.85, 0.85]];
	return { kind, points: stops.slice(0, 5).map((s, i) => ({ x: spots[i][0], y: spots[i][1], color: s.color, spread: 0.9 })) };
}

function _rapierBgSyncPanel() {
	const panel = _rapierBgPanel();
	if (!panel || panel.hidden) return;
	const bg = _rapierBgCurrent(), kind = bg?.kind || 'none';
	for (const button of panel.querySelectorAll('[data-draw-bg-kind]')) button.setAttribute('aria-checked', String(button.dataset.drawBgKind === kind));
	panel.dataset.kind = kind;
	// Starting points: the shipped presets of this kind (all of them when there is none yet).
	const presets = panel.querySelector('.rapier-draw-bgpanel-presets'), list = _rapierBg.RAPIER_DRAW_BACKGROUND_PRESETS.filter(p => kind === 'none' || kind === 'solid' || p.kind === kind);
	const sig = kind + ':' + list.length + ':' + _rapierBgDark();
	if (presets.dataset.sig !== sig) {
		presets.dataset.sig = sig;
		presets.innerHTML = list.map((p, i) => '<button type="button" class="rapier-draw-bgpanel-preset" data-draw-bg-preset="' + _rapierBg.RAPIER_DRAW_BACKGROUND_PRESETS.indexOf(p) + '" aria-label="Starting point ' + (i + 1) + '"><svg viewBox="0 0 64 40" aria-hidden="true">' + _rapierBg._rapierDrawBackgroundSVG(p, { x: 0, y: 0, w: 64, h: 40 }, 'rapier-bg-preset-' + i, _rapierBgDark()) + '</svg></button>').join('');
	}
	const strip = panel.querySelector('.rapier-draw-bgpanel-strip'), bar = panel.querySelector('[data-draw-bg-bar]');
	const stops = bg?.stops;
	bar.hidden = !stops;
	if (stops) {
		const stripKey = JSON.stringify(stops) + _rapierBgDark();
		if (strip.dataset.key !== stripKey) {
			strip.dataset.key = stripKey;
			strip.setAttribute('viewBox', '0 0 100 10');
			strip.innerHTML = _rapierBg._rapierDrawBackgroundSVG({ kind: 'linear', x1: 0, y1: 0.5, x2: 1, y2: 0.5, stops }, { x: 0, y: 0, w: 100, h: 10 }, 'rapier-bg-strip', _rapierBgDark());
		}
		bar.querySelectorAll('.rapier-draw-bgpanel-handle').forEach(h => h.remove());
		stops.forEach((stop, i) => {
			const handle = document.createElement('button');
			handle.type = 'button'; handle.className = 'rapier-draw-bgpanel-handle'; handle.dataset.drawBgStop = String(i);
			handle.style.left = (stop.at * 100) + '%'; handle.style.setProperty('--bg-stop', stop.color);
			handle.setAttribute('aria-label', 'Colour ' + (i + 1) + ' at ' + Math.round(stop.at * 100) + ' percent');
			bar.appendChild(handle);
		});
	}
	const wave = bg?.kind === 'wave';
	panel.querySelector('.rapier-draw-bgpanel-wave').hidden = !wave;
	if (wave) { panel.querySelector('[data-draw-bg-flow]').value = String(bg.flow); panel.querySelector('[data-draw-bg-size]').value = String(bg.size); }
	panel.querySelector('.rapier-draw-bgpanel-solid').hidden = bg?.kind !== 'solid';
	const shapeBox = panel.querySelector('[data-draw-bg-shape]'), sliders = RAPIER_BG_SLIDERS[bg?.kind] || [];
	shapeBox.hidden = !sliders.length;
	if (shapeBox.dataset.kind !== (bg?.kind || '')) {
		shapeBox.dataset.kind = bg?.kind || '';
		shapeBox.textContent = '';
		for (const [key, word, min, max, step] of sliders) {
			const label = document.createElement('label'); label.className = 'rapier-draw-control rapier-draw-control--seek';
			const name = document.createElement('span'); name.className = 'rapier-draw-bgpanel-word'; name.textContent = word;
			const input = document.createElement('input'); input.type = 'range'; input.min = min; input.max = max; input.step = step; input.dataset.drawBgKey = key; input.setAttribute('aria-label', word);
			label.append(name, input); shapeBox.appendChild(label); _rapierDrawSeekWrap(input);
		}
	}
	for (const input of shapeBox.querySelectorAll('[data-draw-bg-key]')) input.value = String(bg[input.dataset.drawBgKey]);
	const styles = panel.querySelector('.rapier-draw-bgpanel-styles');
	styles.hidden = bg?.kind !== 'glyphs';
	if (bg?.kind === 'glyphs') for (const b of styles.querySelectorAll('[data-draw-bg-style]')) b.setAttribute('aria-checked', String(b.dataset.drawBgStyle === (bg.style || 'marks')));
	const textures = panel.querySelector('.rapier-draw-bgpanel-textures');
	textures.hidden = bg?.kind !== 'texture';
	if (bg?.kind === 'texture') for (const b of textures.querySelectorAll('[data-draw-bg-texture]')) b.setAttribute('aria-checked', String(b.dataset.drawBgTexture === bg.texture));
	const modes = panel.querySelector('.rapier-draw-bgpanel-glowmodes'), glows = RAPIER_BG_GLOWS.has(bg?.kind);
	modes.hidden = !glows;
	if (glows) { const g = bg.glow ?? 0; const near = g === 0 ? 'off' : g < 0.6 ? 'soft' : 'neon'; for (const b of modes.querySelectorAll('[data-draw-bg-glowmode]')) b.setAttribute('aria-checked', String(b.dataset.drawBgGlowmode === near)); }
	const rails = bg?.kind === 'rails';
	panel.querySelector('.rapier-draw-bgpanel-rails').hidden = !rails;
	if (rails) {
		for (const b of panel.querySelectorAll('[data-draw-bg-form]')) b.setAttribute('aria-checked', String(b.dataset.drawBgForm === bg.form));
		for (const input of panel.querySelectorAll('[data-draw-bg-rails]')) input.value = String(bg[input.dataset.drawBgRails]);
	}
	const point = bg?.kind === 'freeform' && _rapierDrawState.bgPoint != null ? bg.points[_rapierDrawState.bgPoint] : null;
	panel.querySelector('.rapier-draw-bgpanel-glow').hidden = !point;
	if (point) panel.querySelector('[data-draw-bg-glow]').value = String(point.spread);
	for (const input of panel.querySelectorAll('input[type="range"]')) _rapierDrawSeekSync(input);
}

// The colour chooser is the platform's own (the same one a phone offers anywhere); `then` receives the hex.
function _rapierBgPickColour(current, then) {
	const input = _rapierBgPanel()?.querySelector('[data-draw-bg-colour]');
	if (!input) return;
	input.value = current;
	input.oninput = () => then(input.value.toLowerCase(), false);
	input.onchange = () => then(input.value.toLowerCase(), true);
	input.click();
}

function _rapierBgBindPanel(panel) {
	panel.addEventListener('click', evt => {
		const kindButton = evt.target.closest('[data-draw-bg-kind]');
		if (kindButton) { _rapierDrawState.bgPoint = null; _rapierBgCommit(_rapierBgAsKind(kindButton.dataset.drawBgKind, _rapierBgCurrent())); return; }
		const preset = evt.target.closest('[data-draw-bg-preset]');
		if (preset) { const p = _rapierBg.RAPIER_DRAW_BACKGROUND_PRESETS[Number(preset.dataset.drawBgPreset)]; if (p) _rapierBgCommit(_rapierBgCopy(p)); return; }
		if (evt.target.closest('[data-draw-bg-pick]')) {
			const bg = _rapierBgCopy(_rapierBgCurrent());
			if (bg?.kind === 'solid') _rapierBgPickColour(bg.color, (color, done) => { bg.color = color; done ? _rapierBgCommit(bg) : _rapierBgDraft({ ...bg }); });
			return;
		}
		if (evt.target.closest('[data-draw-bg-shuffle]')) { const bg = _rapierBgCopy(_rapierBgCurrent()); if (bg?.kind === 'wave') { bg.seed = (bg.seed * 7919 + 13) % 9973; _rapierBgCommit(bg); } return; }
		if (evt.target.closest('[data-draw-bg-remove-point]')) {
			const bg = _rapierBgCopy(_rapierBgCurrent()), i = _rapierDrawState.bgPoint;
			if (bg?.kind === 'freeform' && i != null && bg.points.length > 1) { bg.points.splice(i, 1); _rapierDrawState.bgPoint = null; _rapierBgCommit(bg); }
		}
	});
	for (const [attr, key] of [['data-draw-bg-flow', 'flow'], ['data-draw-bg-size', 'size']]) {
		const input = panel.querySelector('[' + attr + ']');
		input.addEventListener('input', () => { const bg = _rapierBgCopy(_rapierBgCurrent()); if (bg?.kind === 'wave') { bg[key] = Number(input.value); _rapierBgDraft(bg); } });
		input.addEventListener('change', () => { const bg = _rapierBgCurrent(); if (bg) _rapierBgCommit(_rapierBgCopy(bg)); });
	}
	panel.addEventListener('click', evt => { const gm = evt.target.closest('[data-draw-bg-glowmode]'); if (!gm) return; const bg = _rapierBgCopy(_rapierBgCurrent()); const mode = RAPIER_BG_GLOW_MODES.find(([v]) => v === gm.dataset.drawBgGlowmode); if (bg && mode && RAPIER_BG_GLOWS.has(bg.kind)) { bg.glow = mode[2]; _rapierBgCommit(bg); } });
	panel.addEventListener('click', evt => { const st = evt.target.closest('[data-draw-bg-style]'); if (!st) return; const bg = _rapierBgCopy(_rapierBgCurrent()); if (bg?.kind === 'glyphs') { bg.style = st.dataset.drawBgStyle; _rapierBgCommit(bg); } });
	panel.addEventListener('click', evt => { const tx = evt.target.closest('[data-draw-bg-texture]'); if (!tx) return; const bg = _rapierBgCopy(_rapierBgCurrent()); if (bg?.kind === 'texture') { bg.texture = tx.dataset.drawBgTexture; bg.scale = bg.texture === 'grain' ? 0.004 : bg.texture === 'weave' || bg.texture === 'linen' ? 0.025 : 0.06; _rapierBgCommit(bg); } });
	panel.addEventListener('click', evt => { const f = evt.target.closest('[data-draw-bg-form]'); if (!f) return; const bg = _rapierBgCopy(_rapierBgCurrent()); if (bg?.kind === 'rails') { bg.form = f.dataset.drawBgForm; _rapierBgCommit(bg); } });
	for (const input of panel.querySelectorAll('[data-draw-bg-rails]')) {
		const key = input.dataset.drawBgRails;
		input.addEventListener('input', () => { const bg = _rapierBgCopy(_rapierBgCurrent()); if (bg?.kind === 'rails') { bg[key] = key === 'count' ? Math.round(Number(input.value)) : Number(input.value); _rapierBgDraft(bg); } });
		input.addEventListener('change', () => { const bg = _rapierBgCurrent(); if (bg) _rapierBgCommit(_rapierBgCopy(bg)); });
	}
	const shapeBox = panel.querySelector('[data-draw-bg-shape]');
	shapeBox.addEventListener('input', evt => { const input = evt.target.closest('[data-draw-bg-key]'); const bg = _rapierBgCopy(_rapierBgCurrent()); if (!input || !bg) return; const key = input.dataset.drawBgKey; bg[key] = Number.isInteger(bg[key]) && Number(input.step) === 1 ? Math.round(Number(input.value)) : Number(input.value); _rapierBgDraft(bg); });
	shapeBox.addEventListener('change', () => { const bg = _rapierBgCurrent(); if (bg) _rapierBgCommit(_rapierBgCopy(bg)); });
	const glow = panel.querySelector('[data-draw-bg-glow]');
	glow.addEventListener('input', () => { const bg = _rapierBgCopy(_rapierBgCurrent()), i = _rapierDrawState.bgPoint; if (bg?.kind === 'freeform' && bg.points[i]) { bg.points[i].spread = Number(glow.value); _rapierBgDraft(bg); } });
	glow.addEventListener('change', () => { const bg = _rapierBgCurrent(); if (bg) _rapierBgCommit(_rapierBgCopy(bg)); });
	// The band bar.
	const bar = panel.querySelector('[data-draw-bg-bar]');
	bar.addEventListener('pointerdown', evt => {
		const bg = _rapierBgCopy(_rapierBgCurrent());
		if (!bg?.stops) return;
		evt.preventDefault();
		const rect = bar.getBoundingClientRect(), at = x => Math.min(1, Math.max(0, (x - rect.left) / rect.width));
		const handle = evt.target.closest('[data-draw-bg-stop]');
		if (!handle) {
			// Tap the strip: a new colour there, the curve's own colour at that point, so nothing jumps.
			const t = at(evt.clientX), rgb = _rapierBg._rapierDrawSampleStops(bg.stops, t);
			if (bg.stops.length >= 8 || !rgb) return;
			bg.stops.push({ at: Math.round(t * 1000) / 1000, color: '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('') });
			_rapierBgCommit(bg);
			return;
		}
		const index = Number(handle.dataset.drawBgStop), startX = evt.clientX, startY = evt.clientY;
		let moved = false, away = false;
		bar.setPointerCapture?.(evt.pointerId);
		const move = e => {
			if (Math.hypot(e.clientX - startX, e.clientY - startY) > 6) moved = true;
			if (!moved) return;
			away = Math.abs(e.clientY - (rect.top + rect.height / 2)) > 56 && bg.stops.length > 2;
			const next = _rapierBgCopy(bg);
			if (away) next.stops.splice(index, 1); else next.stops[index].at = Math.round(at(e.clientX) * 1000) / 1000;
			_rapierBgDraft(next);
		};
		const up = e => {
			bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up);
			if (e.type === 'pointercancel') { delete _rapierDrawState.bgDraft; _rapierDrawBackgroundSync(); _rapierBgSyncPanel(); return; }
			if (moved) { _rapierBgCommit(_rapierDrawState.bgDraft); return; }
			_rapierBgPickColour(bg.stops[index].color, (color, done) => { const next = _rapierBgCopy(bg); next.stops[index].color = color; done ? _rapierBgCommit(next) : _rapierBgDraft(next); });
		};
		bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
	});
}

// On-canvas handles, in screen-sized circles whatever the zoom. Shown only while the panel is open.
function _rapierBgHandleSpots(bg) {
	if (!bg) return [];
	if (bg.kind === 'linear' || bg.kind === 'wave') return [{ role: 'a', u: bg.x1, v: bg.y1 }, { role: 'b', u: bg.x2, v: bg.y2 }];
	if (bg.kind === 'radial') return [{ role: 'c', u: bg.cx, v: bg.cy }, { role: 'r', u: bg.cx, v: bg.cy, ring: bg.r }];
	if (bg.kind === 'rails' || bg.kind === 'bloom' || bg.kind === 'rays') return [{ role: 'c', u: bg.cx, v: bg.cy }];
	if (bg.kind === 'echo' || bg.kind === 'glyphs') return [{ role: 'a', u: bg.x1, v: bg.y1 }, { role: 'b', u: bg.x2, v: bg.y2 }];
	if (bg.kind === 'ribbon') return bg.points.map((p, i) => ({ role: 'p' + i, u: p.x, v: p.y }));
	if (bg.kind === 'freeform') return bg.points.map((p, i) => ({ role: 'p' + i, u: p.x, v: p.y, color: p.color }));
	return [];
}
function _rapierBgSyncHandles() {
	const state = _rapierDrawState, svg = state.svgRoot;
	if (!svg) return;
	let layer = svg.querySelector('.rapier-draw-bg-handles');
	if (!_rapierBgOpen()) { layer?.remove(); return; }
	if (!layer) { layer = document.createElementNS('http://www.w3.org/2000/svg', 'g'); layer.setAttribute('class', 'rapier-draw-bg-handles'); svg.appendChild(layer); _rapierBgBindHandles(layer); }
	const bg = _rapierBgCurrent(), rect = _rapierBgRect();
	if (!bg || !rect) { layer.innerHTML = ''; return; }
	const vb = svg.viewBox.baseVal, box = svg.getBoundingClientRect(), unit = vb && box.width ? vb.width / box.width : 1;
	const r = 13 * unit, stroke = 2.5 * unit, half = Math.hypot(rect.w, rect.h) / 2;
	const spots = _rapierBgHandleSpots(bg);
	let markup = '';
	if (bg.kind === 'linear' || bg.kind === 'wave' || bg.kind === 'echo' || bg.kind === 'glyphs') markup += '<line class="rapier-draw-bg-guide" x1="' + (rect.x + bg.x1 * rect.w) + '" y1="' + (rect.y + bg.y1 * rect.h) + '" x2="' + (rect.x + bg.x2 * rect.w) + '" y2="' + (rect.y + bg.y2 * rect.h) + '" stroke-width="' + stroke + '"/>';
	for (const spot of spots) {
		const cx = rect.x + spot.u * rect.w, cy = rect.y + spot.v * rect.h;
		if (spot.ring) { markup += '<circle class="rapier-draw-bg-ring" data-draw-bg-handle="r" cx="' + cx + '" cy="' + cy + '" r="' + (spot.ring * half) + '" stroke-width="' + (stroke * 4) + '" fill="none"/>'; continue; }
		const selected = spot.role === 'p' + state.bgPoint;
		markup += '<circle class="rapier-draw-bg-handle' + (selected ? ' rapier-draw-bg-handle--on' : '') + '" data-draw-bg-handle="' + spot.role + '" cx="' + cx + '" cy="' + cy + '" r="' + r + '" stroke-width="' + stroke + '"' + (spot.color ? ' fill="' + spot.color + '"' : '') + '/>';
	}
	layer.innerHTML = markup;
}
function _rapierBgCanvasPoint(evt) {
	const svg = _rapierDrawState.svgRoot, rect = _rapierBgRect();
	const [x, y] = _rapierDrawMapPoint(evt.clientX, evt.clientY, svg.getBoundingClientRect(), svg.viewBox.baseVal);
	return { u: Math.min(1, Math.max(0, (x - rect.x) / rect.w)), v: Math.min(1, Math.max(0, (y - rect.y) / rect.h)), x, y, rect };
}
function _rapierBgBindHandles(layer) {
	layer.addEventListener('pointerdown', evt => {
		const target = evt.target.closest('[data-draw-bg-handle]');
		if (!target) return;
		evt.preventDefault(); evt.stopPropagation();
		const role = target.dataset.drawBgHandle, base = _rapierBgCopy(_rapierBgCurrent()), state = _rapierDrawState;
		if (!base) return;
		if (role[0] === 'p') { state.bgPoint = Number(role.slice(1)); _rapierBgSyncPanel(); }
		const start = { x: evt.clientX, y: evt.clientY };
		let moved = false;
		layer.setPointerCapture?.(evt.pointerId);
		const move = e => {
			if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) moved = true;
			if (!moved) return;
			const p = _rapierBgCanvasPoint(e), next = _rapierBgCopy(base), round = n => Math.round(n * 1000) / 1000;
			if (role === 'a') { next.x1 = round(p.u); next.y1 = round(p.v); }
			else if (role === 'b') { next.x2 = round(p.u); next.y2 = round(p.v); }
			else if (role === 'c') { next.cx = round(p.u); next.cy = round(p.v); }
			else if (role === 'r') next.r = Math.min(3, Math.max(0.05, round(Math.hypot(p.x - (p.rect.x + base.cx * p.rect.w), p.y - (p.rect.y + base.cy * p.rect.h)) / (Math.hypot(p.rect.w, p.rect.h) / 2))));
			else { const point = next.points[Number(role.slice(1))]; point.x = round(p.u); point.y = round(p.v); }
			_rapierBgDraft(next);
		};
		const up = e => {
			layer.removeEventListener('pointermove', move); layer.removeEventListener('pointerup', up); layer.removeEventListener('pointercancel', up);
			if (e.type === 'pointercancel' || !moved) {
				delete state.bgDraft; _rapierDrawBackgroundSync();
				// A tap on a free-form point chooses its colour.
				if (!moved && role[0] === 'p' && base.kind === 'freeform') { const i = Number(role.slice(1)); _rapierBgPickColour(base.points[i].color, (color, done) => { const next = _rapierBgCopy(base); next.points[i].color = color; done ? _rapierBgCommit(next) : _rapierBgDraft(next); }); }
				return;
			}
			_rapierBgCommit(state.bgDraft);
		};
		layer.addEventListener('pointermove', move); layer.addEventListener('pointerup', up); layer.addEventListener('pointercancel', up);
	}, true);
}
// A tap on the bare canvas while a free-form background is being edited drops a new colour point there, coloured
// as the background already is at that place so the picture does not jump. Draw's own tap routing calls this first;
// true means the tap was taken.
function _rapierDrawBackgroundTap(evt) {
	const state = _rapierDrawState, bg = _rapierBgCurrent();
	if (!_rapierBgOpen() || bg?.kind !== 'freeform' || bg.points.length >= 8) return false;
	const p = _rapierBgCanvasPoint(evt), next = _rapierBgCopy(bg);
	const near = next.points.reduce((best, q) => Math.hypot(q.x - p.u, q.y - p.v) < Math.hypot(best.x - p.u, best.y - p.v) ? q : best, next.points[0]);
	next.points.push({ x: Math.round(p.u * 1000) / 1000, y: Math.round(p.v * 1000) / 1000, color: near.color, spread: 0.6 });
	state.bgPoint = next.points.length - 1;
	_rapierBgCommit(next);
	return true;
}

// While the background is being edited the canvas belongs to it, as it does to resize: a single finger does not
// draw. A tap drops a free-form point; two fingers still reach Draw's own pinch and pan.
function _rapierBgBindStage() {
	const stage = _rapierDrawState.surface?.querySelector('.rapier-draw-stage');
	if (!stage || stage.dataset.bgBound) return;
	stage.dataset.bgBound = '1';
	const fingers = new Set();
	stage.addEventListener('pointerdown', evt => {
		fingers.add(evt.pointerId);
		if (!_rapierBgOpen() || fingers.size > 1 || evt.target.closest?.('.rapier-draw-bg-handles')) return;
		evt.stopPropagation();
		const start = { x: evt.clientX, y: evt.clientY, t: performance.now() };
		const up = e => {
			stage.removeEventListener('pointerup', up, true);
			if (fingers.size <= 1 && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 8 && performance.now() - start.t < 500) _rapierDrawBackgroundTap(e);
		};
		stage.addEventListener('pointerup', up, true);
	}, true);
	const lift = evt => fingers.delete(evt.pointerId);
	stage.addEventListener('pointerup', lift); stage.addEventListener('pointercancel', lift);
}
