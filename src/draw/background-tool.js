// SPDX-License-Identifier: AGPL-3.0-only
const _rapierBg = globalThis.RapierDrawCore;
const RAPIER_BG_SLIDERS = {
	bloom: [['petals', 'Petals', 3, 16, 1], ['layers', 'Layers', 2, 12, 1], ['size', 'Size', 0, 1, 0.01], ['twist', 'Twist', 0, 1, 0.01], ['glow', 'Glow', 0, 1, 0.01]],
	ribbon: [['width', 'Width', 0, 1, 0.01], ['bands', 'Bands', 2, 24, 1], ['glow', 'Glow', 0, 1, 0.01]],
	texture: [['scale', 'Size', 0.002, 0.2, 0.001], ['strength', 'Strength', 0, 1, 0.01], ['seed', 'Seed', 0, 999, 1]],
	paper: [['strength', 'Texture', 0, 1, 0.01]],
	aurora: [['curtains', 'Curtains', 1, 6, 1], ['height', 'Height', 0, 1, 0.01], ['sway', 'Sway', 0, 1, 0.01], ['rays', 'Rays', 0, 1, 0.01], ['stars', 'Stars', 0, 1, 0.01], ['glow', 'Glow', 0, 1, 0.01], ['seed', 'Seed', 0, 999, 1]],
	flow: [['lines', 'Lines', 8, 400, 1], ['scale', 'Scale', 0, 1, 0.01], ['swirl', 'Swirl', 0, 1, 0.01], ['weight', 'Weight', 0, 1, 0.01], ['glow', 'Glow', 0, 1, 0.01], ['seed', 'Seed', 0, 999, 1]],
	topo: [['lines', 'Levels', 8, 400, 1], ['scale', 'Scale', 0, 1, 0.01], ['swirl', 'Warp', 0, 1, 0.01], ['weight', 'Weight', 0, 1, 0.01], ['glow', 'Glow', 0, 1, 0.01], ['seed', 'Seed', 0, 999, 1]],
	grid: [['lines', 'Lines', 6, 48, 1], ['horizon', 'Horizon', 0, 1, 0.01], ['sun', 'Sun', 0, 1, 0.01], ['glow', 'Glow', 0, 1, 0.01], ['tilt', 'Spread', 0, 1, 0.01]],
	glyphs: [['cols', 'Size', 6, 64, 1], ['density', 'Density', 0, 1, 0.01], ['wobble', 'Wobble', 0, 1, 0.01], ['glow', 'Glow', 0, 1, 0.01], ['seed', 'Seed', 0, 999, 1]],
	rays: [['count', 'Count', 3, 64, 1], ['spread', 'Spread', 0, 1, 0.01], ['curve', 'Curve', 0, 1, 0.01], ['glow', 'Glow', 0, 1, 0.01]],
	echo: [['count', 'Count', 2, 64, 1], ['size', 'Size', 0, 1, 0.01], ['round', 'Round', 0, 1, 0.01], ['turn', 'Turn', 0, 1, 0.01]],
};
const RAPIER_BG_GLOW_MODES = [['off', 'Off', 0], ['soft', 'Soft', 0.35], ['neon', 'Neon', 0.85]];
const RAPIER_BG_GLOWS = new Set(['rails', 'bloom', 'ribbon', 'rays', 'glyphs', 'grid', 'flow', 'topo', 'aurora']);
const RAPIER_BG_KINDS = [['none', 'None'], ['paper', 'Paper'], ['topo', 'Topo'], ['aurora', 'Aurora'], ['texture', 'Texture'], ['flow', 'Flow'], ['grid', 'Grid'], ['solid', 'Solid'], ['linear', 'Linear'], ['radial', 'Radial'], ['freeform', 'Free'], ['wave', 'Wave'], ['rails', 'Rails'], ['bloom', 'Bloom'], ['ribbon', 'Ribbon'], ['echo', 'Echo'], ['rays', 'Rays'], ['glyphs', 'Glyphs']];

let _rapierBgPaperReady = 0;
_rapierBg._rapierDrawPaperListen?.(() => {
	_rapierBgPaperReady++;
	_rapierDrawBackgroundSync();
	const presets = _rapierBgPanel()?.querySelector('.rapier-draw-bgpanel-presets');
	if (presets) { presets.dataset.sig = ''; _rapierBgSyncPanel(); }
});

async function _rapierBgPaperLoad(paper, strength = 1, options = {}) {
	if (!strength) return null;
	if (!_rapierBg._rapierDrawPaperRequest) throw new Error('The paper texture could not be prepared');
	const deflate = bytes => globalThis.RapierDrawAgentPaint.deflateOwnedPaintBytes(bytes.slice());
	const render = globalThis.navigator?.gpu && globalThis.RapierDrawWater?.paperTileFromGPU ? (id, options) => globalThis.RapierDrawWater.paperTileFromGPU(id, options) : null;
	return _rapierBg._rapierDrawPaperRequest(paper, {strength, pixelRatio: globalThis.devicePixelRatio || 1, ...options, now: () => performance.now(), pause: () => new Promise(resolve => setTimeout(resolve, 0)), deflate, render});
}
async function _rapierBgPaperSnapshot(recipe) {
	if (recipe.background === undefined) return null;
	const background = _rapierBg._rapierDrawNormalizeBackground(recipe.background);
	if (!background) throw new Error('The drawing background is not valid');
	if (background.kind !== 'paper' || !background.strength) return null;
	const image = await _rapierBgPaperLoad(background.paper, background.strength, {ready: true});
	if (!image || image.id !== background.paper || image.strength !== background.strength) throw new Error('The paper texture could not be prepared');
	return image;
}
let _rapierBgPaperWanted = null, _rapierBgPaperBusy = false, _rapierBgPaperMade = null;
function _rapierBgPaperRequest(paper, strength = 1) {
	if (!strength || !_rapierBg._rapierDrawPaperRequest) return;
	_rapierBgPaperWanted = {paper, strength};
	if (_rapierBgPaperBusy) return;
	_rapierBgPaperBusy = true;
	(async () => {
		while (_rapierBgPaperWanted) {
			const next = _rapierBgPaperWanted; _rapierBgPaperWanted = null;
			if (_rapierBgPaperMade !== next.paper) {
				await _rapierBgPaperLoad(next.paper, next.strength, {ready: true, pixelRatio: 0}).catch(() => {});
				if (_rapierBgPaperWanted) continue;
			}
			if (await _rapierBgPaperLoad(next.paper, next.strength).catch(() => null)) _rapierBgPaperMade = next.paper;
		}
	})().catch(() => {}).finally(() => { _rapierBgPaperBusy = false; });
}
function _rapierBgOpen() { const panel = _rapierBgPanel(); return !!panel && !panel.hidden; }
function _rapierBgCurrent() { const state = _rapierDrawState; return state.bgDraft !== undefined ? state.bgDraft : (state.recipe?.background || (typeof _rapierWaterPaperDefault === 'function' ? _rapierWaterPaperDefault() : null)); }
function _rapierBgDark() { return typeof _rapierDrawDarkPaper === 'function' && _rapierDrawDarkPaper() && (_rapierDrawState.recipe?.paper === 'black' || RapierPreferences.read('invertImageAlpha')); }
function _rapierBgRect() {
	const recipe = _rapierDrawState.recipe;
	return recipe?.canvas ? (typeof _rapierDrawPaperView === 'function' ? _rapierDrawPaperView(recipe) : { x: 0, y: 0, w: recipe.canvas.w, h: recipe.canvas.h }) : null;
}

function _rapierBgPaperSheet(rect, drawn) {
	let sheet = null;
	try { sheet = drawn ? JSON.parse(drawn) : null; } catch (_) {}
	if (sheet && sheet.x <= rect.x && sheet.y <= rect.y && sheet.x + sheet.w >= rect.x + rect.w && sheet.y + sheet.h >= rect.y + rect.h) return sheet;
	const x = Math.floor((rect.x - rect.w / 4) / 64) * 64, y = Math.floor((rect.y - rect.h / 4) / 64) * 64;
	return {x, y, w: Math.ceil((rect.x + rect.w * 1.25 - x) / 64) * 64, h: Math.ceil((rect.y + rect.h * 1.25 - y) / 64) * 64};
}
function _rapierDrawBackgroundSync() {
	const state = _rapierDrawState, svg = state.svgRoot;
	if (!svg) return;
	let layer = svg.querySelector('.rapier-draw-background');
	const paper = svg.querySelector('.rapier-draw-paper');
	if (!layer && paper) { layer = document.createElementNS('http://www.w3.org/2000/svg', 'g'); layer.setAttribute('class', 'rapier-draw-background'); paper.after(layer); }
	if (!layer) return;
	const bg = _rapierBgCurrent(), rect = _rapierBgRect(), dark = _rapierBgDark();
	if (bg?.kind === 'paper') _rapierBgPaperRequest(bg.paper, bg.strength);
	if (bg?.kind === 'paper' && rect) svg.setAttribute('data-paper-ground', ''); else svg.removeAttribute?.('data-paper-ground');
	const origin = bg?.kind === 'paper' && bg.origin ? bg.origin : [0, 0], drawn = origin[0] || origin[1] ? {...bg, origin: undefined} : bg;
	const sheet = bg?.kind === 'paper' && rect ? _rapierBgPaperSheet({...rect, x: rect.x - origin[0], y: rect.y - origin[1]}, layer.dataset.sheet) : rect;
	const key = bg && rect ? JSON.stringify([drawn, sheet, dark, _rapierBgPaperReady]) : '';
	if (layer.dataset.key !== key) {
		layer.dataset.key = key;
		layer.dataset.sheet = sheet !== rect ? JSON.stringify(sheet) : '';
		if (!key) layer.replaceChildren();
		else {
			const ns = 'http://www.w3.org/2000/svg', image = document.createElementNS(ns, 'image');
			const doc = '<svg xmlns="' + ns + '" viewBox="' + [sheet.x, sheet.y, sheet.w, sheet.h].join(' ') + '" width="' + sheet.w + '" height="' + sheet.h + '">' + _rapierBg._rapierDrawBackgroundSVG(drawn, sheet, 'rapier-draw-live-bg', dark) + '</svg>';
			const href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(doc);
			for (const [name, value] of [['x', sheet.x + origin[0]], ['y', sheet.y + origin[1]], ['width', sheet.w], ['height', sheet.h], ['preserveAspectRatio', 'none']]) image.setAttribute(name, String(value));
			image.setAttribute('href', href);
			image.setAttribute('pointer-events', 'none');
			let node = image;
			if (sheet !== rect) { node = document.createElementNS(ns, 'svg'); node.setAttribute('class', 'rapier-draw-background-clip'); node.appendChild(image); }
			const swap = () => { if (layer.dataset.key !== key || !layer.isConnected) return; layer.replaceChildren(node); _rapierDrawBackgroundSync(); };
			if (!layer.firstChild) swap();
			else { const ready = new Image(); ready.src = href; ready.decode().then(swap, swap); }
		}
	}
	const clip = layer.firstElementChild?.matches?.('.rapier-draw-background-clip') ? layer.firstElementChild : null;
	if (clip) for (const [name, value] of [['x', rect.x], ['y', rect.y], ['width', rect.w], ['height', rect.h], ['viewBox', [rect.x, rect.y, rect.w, rect.h].join(' ')]]) if (clip.getAttribute(name) !== String(value)) clip.setAttribute(name, String(value));
	const placed = clip?.firstElementChild;
	if (placed) for (const [name, value] of [['x', sheet.x + origin[0]], ['y', sheet.y + origin[1]]]) if (placed.getAttribute(name) !== String(value)) placed.setAttribute(name, String(value));
	_rapierBgSyncHandles();
}

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
		'<div class="rapier-draw-bgpanel-bar" data-draw-bg-bar aria-label="Colors. Drag a handle along to move a color, tap it to choose, drag it away to remove; tap the strip to add a color"><svg class="rapier-draw-bgpanel-strip" preserveAspectRatio="none" aria-hidden="true"></svg></div>' +
		'<div class="rapier-draw-bgpanel-solid"><button type="button" class="rapier-draw-chip" data-draw-bg-pick>Color</button></div>' +
		'<div class="rapier-draw-bgpanel-wave">' + _rapierBgSeek('Flow', 'min="0" max="1" step="0.01" data-draw-bg-flow') +
		_rapierBgSeek('Size', 'min="0" max="1" step="0.01" data-draw-bg-size') +
		'<button type="button" class="rapier-draw-chip" data-draw-bg-shuffle>Shuffle</button></div>' +
		'<div class="rapier-draw-bgpanel-rails"><div class="rapier-draw-bgpanel-forms" role="radiogroup" aria-label="Rails form">' + [['lines', 'Lines'], ['fan', 'Fan'], ['spiral', 'Spiral'], ['burst', 'Burst']].map(([f, word]) => '<button type="button" class="rapier-draw-chip" role="radio" data-draw-bg-form="' + f + '" aria-checked="false">' + word + '</button>').join('') + '</div>' +
		_rapierBgSeek('Count', 'min="4" max="96" step="1" data-draw-bg-rails="count"') +
		_rapierBgSeek('Glow', 'min="0" max="1" step="0.01" data-draw-bg-rails="glow"') +
		_rapierBgSeek('Bend', 'min="0" max="1" step="0.01" data-draw-bg-rails="bend"') + '</div>' +
		'<div class="rapier-draw-bgpanel-forms rapier-draw-bgpanel-styles" role="radiogroup" aria-label="Glyph style">' + [['marks', 'Marks'], ['halftone', 'Halftone'], ['blocks', 'Blocks'], ['rain', 'Rain'], ['circuit', 'Circuit']].map(([v, word]) => '<button type="button" class="rapier-draw-chip" role="radio" data-draw-bg-style="' + v + '" aria-checked="false">' + word + '</button>').join('') + '</div>' +
		'<div class="rapier-draw-bgpanel-forms rapier-draw-bgpanel-papers" role="radiogroup" aria-label="Paper"></div>' +
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

function _rapierBgDraft(next) { _rapierDrawState.bgDraft = next; _rapierDrawBackgroundSync(); _rapierBgSyncPanel(); }
function _rapierBgCommit(next) {
	const state = _rapierDrawState;
	delete state.bgDraft;
	if (!state.recipe.background && typeof _rapierWaterPaperDefault === 'function' && _rapierWaterPaperDefault()) state.waterPaperDeclined = state.session;
	const admitted = next ? _rapierBg._rapierDrawNormalizeBackground(next) : null;
	if (next && !admitted) { _rapierDrawBackgroundSync(); _rapierBgSyncPanel(); return false; }
	if (JSON.stringify(state.recipe.background || null) === JSON.stringify(admitted)) { _rapierDrawBackgroundSync(); _rapierBgSyncPanel(); return false; }
	const done = _rapierDrawCommand(() => {
		const recipe = state.recipe, left = recipe.background, kept = {...recipe.backgrounds};
		if (left && left.kind !== admitted?.kind) kept[left.kind] = left;
		if (admitted) { recipe.background = admitted; delete kept[admitted.kind]; } else delete recipe.background;
		if (Object.keys(kept).length) recipe.backgrounds = kept; else delete recipe.backgrounds;
	});
	if (admitted?.kind === 'paper' && typeof _rapierWaterFollowPaper === 'function') _rapierWaterFollowPaper(admitted.paper);
	const after = () => { if (typeof _rapierDrawRenderAll === 'function') _rapierDrawRenderAll(); _rapierDrawBackgroundSync(); _rapierBgSyncPanel(); };
	if (done && typeof done.then === 'function') done.then(after); else after();
	return true;
}

const _rapierBgCopy = bg => bg ? JSON.parse(JSON.stringify(bg)) : null;
function _rapierBgAsKind(kind, from) {
	if (kind === 'none') return null;
	const kept = _rapierDrawState.recipe?.backgrounds?.[kind];
	return kept ? _rapierBgCopy(kept) : _rapierBg._rapierDrawBackgroundStart(kind, from);
}

function _rapierBgSyncPanel() {
	const panel = _rapierBgPanel();
	if (!panel || panel.hidden) return;
	const bg = _rapierBgCurrent(), kind = bg?.kind || 'none';
	for (const button of panel.querySelectorAll('[data-draw-bg-kind]')) button.setAttribute('aria-checked', String(button.dataset.drawBgKind === kind));
	panel.dataset.kind = kind;
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
			handle.setAttribute('aria-label', 'Color ' + (i + 1) + ' at ' + Math.round(stop.at * 100) + ' percent');
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
	const papers = panel.querySelector('.rapier-draw-bgpanel-papers');
	papers.hidden = bg?.kind !== 'paper';
	const waterPro = _rapierWaterProAvailable();
	if (papers.dataset.pro !== String(waterPro)) {
		papers.dataset.pro = String(waterPro); papers.replaceChildren();
		for (const paper of _rapierBg.RAPIER_DRAW_PAPERS.filter(p => !p.pro || waterPro)) {
			const button = document.createElement('button'); button.type = 'button'; button.className = 'rapier-draw-chip';
			button.setAttribute('role','radio'); button.dataset.drawBgPaper = paper.id; button.textContent = paper.name; papers.append(button);
		}
	}
	if (bg?.kind === 'paper') for (const b of papers.querySelectorAll('[data-draw-bg-paper]')) b.setAttribute('aria-checked', String(b.dataset.drawBgPaper === bg.paper));
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
	for (const group of panel.querySelectorAll('[role="radiogroup"]')) _rapierDrawRadioRove(group);
}

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
	panel.addEventListener('click', async evt => {
		const pp = evt.target.closest('[data-draw-bg-paper]'); if (!pp) return;
		const state = _rapierDrawState, session = state.session, before = _rapierBgCurrent(), id = pp.dataset.drawBgPaper;
		const choice = state.waterProChoice = (state.waterProChoice || 0) + 1;
		try {
			if (_rapierBg.RAPIER_DRAW_PAPERS.find(p => p.id === id)?.pro) await _rapierWaterProAuthorize('papers');
			if (!state.open || state.session !== session || state.waterProChoice !== choice || before !== _rapierBgCurrent()) return;
			const bg = _rapierBgCopy(before); if (bg?.kind === 'paper') { bg.paper = id; _rapierBgCommit(bg); }
		} catch (error) { _rapierWaterProError(error); }
	});
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
	const bar = panel.querySelector('[data-draw-bg-bar]');
	bar.addEventListener('pointerdown', evt => {
		const bg = _rapierBgCopy(_rapierBgCurrent());
		if (!bg?.stops) return;
		evt.preventDefault();
		const rect = bar.getBoundingClientRect(), at = x => Math.min(1, Math.max(0, (x - rect.left) / rect.width));
		const handle = evt.target.closest('[data-draw-bg-stop]');
		if (!handle) {
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
	bar.addEventListener('click', evt => {
		const handle = evt.detail === 0 && evt.target.closest('[data-draw-bg-stop]'), bg = handle && _rapierBgCopy(_rapierBgCurrent());
		if (!bg?.stops) return;
		const index = Number(handle.dataset.drawBgStop);
		_rapierBgPickColour(bg.stops[index].color, (color, done) => { const next = _rapierBgCopy(bg); next.stops[index].color = color; done ? _rapierBgCommit(next) : _rapierBgDraft(next); });
	});
	bar.addEventListener('keydown', evt => {
		const handle = evt.target.closest('[data-draw-bg-stop]'), bg = handle && _rapierBgCopy(_rapierBgCurrent());
		const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[evt.key], remove = evt.key === 'Delete' || evt.key === 'Backspace';
		if (!bg?.stops || !step && !remove) return;
		evt.preventDefault(); evt.stopPropagation();
		const index = Number(handle.dataset.drawBgStop), stop = bg.stops[index];
		if (remove) { if (bg.stops.length <= 2) return; bg.stops.splice(index, 1); }
		else stop.at = Math.round(Math.min(1, Math.max(0, stop.at + step * (evt.shiftKey ? 0.1 : 0.01))) * 1000) / 1000;
		_rapierBgCommit(bg);
		const stops = _rapierBgCurrent()?.stops || [], at = remove ? Math.max(0, index - 1) : stops.findIndex(s => s.at === stop.at && s.color === stop.color);
		bar.querySelector('[data-draw-bg-stop="' + Math.max(0, at) + '"]')?.focus({ preventScroll: true });
	});
}

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
				if (!moved && role[0] === 'p' && base.kind === 'freeform') { const i = Number(role.slice(1)); _rapierBgPickColour(base.points[i].color, (color, done) => { const next = _rapierBgCopy(base); next.points[i].color = color; done ? _rapierBgCommit(next) : _rapierBgDraft(next); }); }
				return;
			}
			_rapierBgCommit(state.bgDraft);
		};
		layer.addEventListener('pointermove', move); layer.addEventListener('pointerup', up); layer.addEventListener('pointercancel', up);
	}, true);
}
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
