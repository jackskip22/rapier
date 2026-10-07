// SPDX-License-Identifier: AGPL-3.0-only
// Water supplies controls and admitted gestures. Paint owns the live layer, picture custody and Draw history.
const RAPIER_WATER_DRY_ICON = RAPIER_DRAW_ICON_WRAP('<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>');
// Tabler's bucket: Feather has no fill-bucket glyph.
const RAPIER_WATER_FILL_ICON = RAPIER_DRAW_ICON_WRAP('<path d="M19 11l-8 -8l-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8 .8 2 .8 2.8 0l8.6 -8.6z"></path><path d="M5 2l5 5"></path><path d="M2 13h15"></path><path d="M22 20a2 2 0 0 1 -4 0c0 -1.1 2 -3 2 -3s2 1.9 2 3z"></path>');
const RAPIER_WATER_KEY = 'rapier:draw.water';
const _rapierWaterGlyphs = new Map(), _rapierWaterGlyphPending = new Set();
let _rapierWaterPreviewRemote = null;
function _rapierWaterPreviewPainter() {
	if (!_rapierWaterPreviewRemote) _rapierWaterPreviewRemote = _rapierDrawPaintClient('preview','water').then(client => {
		if (!client) throw new Error('The brush preview could not start');
		return globalThis.RapierDrawPaintRemote.createPaintRemote(client,{frame:fn=>requestAnimationFrame(fn),onFailure:()=>{ _rapierWaterPreviewRemote=null; _rapierDrawPaintRelease(client); }});
	}).catch(error => { _rapierWaterPreviewRemote=null; throw error; });
	return _rapierWaterPreviewRemote;
}
function _rapierWaterEngine() { return globalThis.RapierDrawWater; }
function _rapierWaterOwn() {
	if (_rapierDrawState.waterBrushes) return _rapierDrawState.waterBrushes;
	let raw=[]; try { raw=JSON.parse(localStorage.getItem(RAPIER_WATER_KEY + '.brushes') || '[]'); } catch (_) {}
	return _rapierDrawState.waterBrushes = (Array.isArray(raw) ? raw : []).flatMap(row => {
		const water = _rapierWaterEngine().admitWaterBrush(row?.water);
		return water && typeof row.name === 'string' ? [{id:water.brush,name:row.name,water}] : [];
	});
}
function _rapierWaterState() {
	if (_rapierDrawState.waterSettings) return _rapierDrawState.waterSettings;
	let raw = {}; try { raw = JSON.parse(localStorage.getItem(RAPIER_WATER_KEY) || '{}') || {}; } catch (_) {}
	const engine = _rapierWaterEngine(), own = _rapierWaterOwn().find(row => row.id === raw.brush), brush = engine.WATER_BRUSHES.find(row => row.id === raw.brush) || own?.water || engine.WATER_BRUSHES[0];
	return _rapierDrawState.waterSettings = {brush: own?.id || brush.id, tool: 'brush', pigment: engine.WATER_PIGMENTS.some(row => row.id === raw.pigment) ? raw.pigment : 'ultramarine',
		paper: engine.WATER_PAPERS.some(row => row.id === raw.paper) ? raw.paper : 'cold-press', size: Number.isFinite(raw.size) ? _rapierDrawClamp(raw.size, 0, 100) : brush.size,
		water: Number.isFinite(raw.water) ? _rapierDrawClamp(raw.water, 0, 1) : brush.water, load: Number.isFinite(raw.load) ? _rapierDrawClamp(raw.load, 0, 1) : brush.load,
		strength: raw.strength === 'light' ? 'light' : 'firm', angle: Number.isFinite(raw.angle) ? _rapierDrawClamp(Math.round(raw.angle), 0, 179) : 45, follow: raw.follow === true,
		text: '', textSize: 48, letterSet: 'water-hand', tip: own?.water.tip || null, tipKey: own?.id || null, tipName: own?.name || '', sampling: false};
}
function _rapierWaterReset() {
	const state = _rapierDrawState; state.waterSettings = null; state.waterPanel = null; state.waterAction = null;
	const latest = state.recipe?.shapes.slice().reverse().find(shape => shape.paint?.mode === 'water');
	if (latest) _rapierWaterState().paper = latest.paint.paper;
}
function _rapierWaterSave() {
	const value = _rapierWaterState(), kept = {};
	for (const key of ['brush','pigment','paper','size','water','load','strength','angle','follow']) if (typeof value[key] !== 'object') kept[key] = value[key];
	try { localStorage.setItem(RAPIER_WATER_KEY, JSON.stringify(kept)); } catch (_) {}
}
function _rapierWaterSet(key, value) {
	const settings = _rapierWaterState(); settings[key] = value;
	if (key === 'brush') {
		const brush = _rapierWaterEngine().WATER_BRUSHES.find(row => row.id === value);
		if (brush) { settings.water = brush.water; settings.load = brush.load; settings.size = brush.size; settings.tip = null; settings.tipName = ''; }
		const own = _rapierWaterOwn().find(row => row.id === value); if (own) { Object.assign(settings, own.water); settings.tipName=own.name; settings.tipKey=own.id; settings.strength=own.water.firm ? 'firm' : 'light'; }
		settings.tool = 'brush'; settings.sampling = false;
	}
	// A paper is how the paint behaves (tooth, absorbency, grain, drying). The paper a person sees is the canvas colour and the
	// background tool's own (draw/background-tool.js), under the transparent layer: choosing a paper writes neither.
	_rapierWaterSave(); _rapierWaterUpdate();
}
function _rapierWaterDefinition(settings = _rapierWaterState()) {
	return _rapierWaterEngine().waterBrushDefinition(settings.brush, {tool: settings.tool === 'water' || settings.tool === 'lift' ? settings.tool : 'brush',
		size: settings.size, pigment: structuredClone(settings.pigment), paper: settings.paper, water: settings.water, load: settings.load,
		firm: settings.strength !== 'light', light: 1, angle: settings.angle, follow: settings.follow,
		...(settings.tip ? {tip: structuredClone(settings.tip)} : {}), ...(settings.erase ? {erase: true} : {})});
}
function _rapierWaterAdmitSettings(erasing = false) {
	const water = structuredClone(_rapierWaterState());
	if (erasing) { water.tool = 'lift'; water.erase = true; water.brush = 'water/round'; water.tip = null; water.follow = false; water.strength = 'firm'; water.paper = _rapierPaintTarget('water')?.paint?.paper || water.paper; }
	const definition = _rapierWaterDefinition(water), base = definition.settings[3].base;
	return {mode: 'water', brushId: water.brush, definition, water, color: [0,0,0], radiusOffset: erasing ? Math.log(Math.max(2, _rapierDrawEraseRadius() * RAPIER_PAINT_GRAIN)) - base : 0,
		strength: water.strength, touch: water.strength === 'light' ? 1 : 0, lift: 1, seed: (Math.random() * 0x3fffffff) | 0, erasing,
		held: water.follow ? null : water.angle, clear: erasing};
}
function _rapierWaterToolbarHTML() {
	return [['waterBrushes','brush','brush'],['waterLoad','water','water'],['waterPigments','pigment',''],['waterTools','tool','smooth']].map(([act,word,icon]) =>
		'<button type="button" class="rapier-draw-btn rapier-draw-btn--icon" data-draw-setting="' + act + '" data-draw-act="' + act + '" aria-label="' + word + '" data-tip="' + word + '" aria-expanded="false">' +
		(icon ? RAPIER_DRAW_ICONS[icon] : '<span class="rapier-draw-ink-dot" data-water-pigment-dot></span>') + '<span class="rapier-draw-btn-name">' + word + '</span></button>').join('');
}
function _rapierWaterPanelsHTML() {
	const metric = (key, word) => '<div class="rapier-draw-metric"><label for="rapier-water-' + key + '">' + word + '</label><input id="rapier-water-' + key + '" data-water-control="' + key + '" type="range" min="0" max="100" step="1"><output data-water-output="' + key + '"></output></div>';
	return '<div class="rapier-draw-brushes rapier-draw-water-brushes" data-draw-panel="waterBrushes" role="radiogroup" aria-label="Water brushes" hidden></div>' +
		'<div class="rapier-draw-brushes rapier-draw-water-tools" data-draw-panel="waterTools" role="group" aria-label="Water tools" hidden></div>' +
		'<div class="rapier-draw-brushes rapier-draw-water-paper" data-draw-panel="waterPaper" role="radiogroup" aria-label="Paper" hidden></div>' +
		'<div class="rapier-draw-colours rapier-draw-water-pigments" data-draw-panel="waterPigments" aria-label="Pigments" hidden></div>' +
		'<div class="rapier-draw-dip rapier-draw-water-load" data-draw-panel="waterLoad" role="group" aria-label="Water and pigment load" hidden>' + metric('water','Water') + metric('load','Load') +
		'<div class="rapier-draw-dip-firmness"><span>Brush firmness</span><div class="rapier-draw-dip-firmness-choices">' + ['firm','light'].map(value =>
			'<button type="button" class="rapier-draw-chip rapier-draw-chip--icon" data-water-strength="' + value + '" aria-pressed="false">' + (value === 'firm' ? RAPIER_PAINT_ICON_GAUGE_FIRM : RAPIER_PAINT_ICON_GAUGE_LIGHT) + '<span class="rapier-draw-chip-name">' + value + '</span></button>').join('') + '</div></div></div>' +
		'<input type="file" data-water-tip-input accept="image/png,image/jpeg,image/webp,application/json,.json" hidden>';
}
function _rapierWaterOpen(panel, force = null) {
	const state = _rapierDrawState, row = state.surface?.querySelector('[data-draw-panel="' + panel + '"]');
	if (!row || state.finishing) return;
	const open = force ?? row.hidden; _rapierDrawCloseSettingPanels(open ? panel : ''); state.waterPanel = open ? panel : null;
	row.hidden = !open; state.surface.querySelector('[data-draw-act="' + panel + '"]')?.setAttribute('aria-expanded', String(open));
	_rapierWaterUpdate();
}
function _rapierWaterIcon(tool) {
	if (tool === 'brush') return RAPIER_DRAW_ICONS.brush;
	if (tool === 'water') return RAPIER_PAINT_ICON_WATER;
	if (tool === 'lift') return RAPIER_DRAW_ICONS.erase;
	if (tool === 'trace') return RAPIER_DRAW_ICONS.pen;
	if (tool === 'text') return RAPIER_DRAW_ICONS.type;
	if (tool === 'fill') return RAPIER_WATER_FILL_ICON;
	return RAPIER_WATER_DRY_ICON;
}
function _rapierWaterPigmentColour() {
	const pigment = _rapierWaterState().pigment;
	return _rapierWaterEngine().WATER_PIGMENTS.find(row => row.id === pigment)?.colour || _rapierDrawState.waterSampleColour || '#5375a8';
}
function _rapierWaterUpdate() {
	const state = _rapierDrawState, surface = state.surface;
	if (!surface || _rapierDrawTool() !== 'water') return;
	_rapierPaintSyncSet();
	const settings = _rapierWaterState(), engine = _rapierWaterEngine(), panel = state.waterPanel;
	const toolButton = surface.querySelector('[data-draw-act="waterTools"]');
	if (toolButton && toolButton.dataset.waterShown !== settings.tool) {
		toolButton.innerHTML = _rapierWaterIcon(settings.tool) + '<span class="rapier-draw-btn-name">tool</span>';
		toolButton.dataset.waterShown = settings.tool; toolButton.setAttribute('aria-label','Tool: ' + settings.tool);
	}
	const sizeButton = surface.querySelector('[data-draw-act="nib"]'); if (sizeButton) { sizeButton.querySelector('.rapier-draw-btn-name').textContent = 'size'; sizeButton.setAttribute('aria-label','size'); sizeButton.dataset.tip = 'size'; }
	const dot = surface.querySelector('[data-water-pigment-dot]'); if (dot) dot.style.backgroundColor = _rapierWaterPigmentColour();
	for (const name of ['waterBrushes','waterTools','waterPigments','waterLoad','waterPaper']) {
		const row = surface.querySelector('[data-draw-panel="' + name + '"]'); if (row) row.hidden = panel !== name;
		surface.querySelector('[data-draw-act="' + name + '"]')?.setAttribute('aria-expanded', String(panel === name));
	}
	const chip = (key, value, word, icon, chosen) => '<button type="button" class="rapier-draw-chip ' + (key === 'act' ? 'rapier-draw-chip--icon' : 'rapier-draw-chip--glyph rapier-draw-chip--paint') + (chosen ? ' rapier-draw-chip--active' : '') + '" data-water-' + key + '="' + _rapierDrawEscapeAttr(value) + '" aria-pressed="' + chosen + '" aria-label="' + _rapierDrawEscapeAttr(word) + '">' + icon + '<span class="rapier-draw-chip-name">' + _rapierDrawEscapeAttr(word) + '</span></button>';
	if (panel === 'waterBrushes') {
		const row = surface.querySelector('.rapier-draw-water-brushes'), scroll = row.scrollLeft;
		row.innerHTML = _rapierPaintHeadChipHTML() + engine.WATER_BRUSHES.map(brush => {
			const src = _rapierWaterGlyph(brush.id), art = src ? '<img class="rapier-draw-glyph rapier-draw-glyph--paint" alt="" src="' + src + '">' : '<span class="rapier-draw-glyph"></span>';
			return chip('brush',brush.id,brush.name,art,settings.brush === brush.id && !settings.tip);
		}).join('') + _rapierWaterOwn().map(own => chip('brush',own.id,own.name,(src => src ? '<img class="rapier-draw-glyph rapier-draw-glyph--paint" alt="" src="' + src + '">' : RAPIER_DRAW_ICONS.image)(_rapierWaterGlyph(own.id,true)),settings.brush === own.id)).join('') +
			chip('act','paper','Paper',RAPIER_DRAW_ICONS.canvas,false) + chip('act','add','Add',RAPIER_DRAW_ICONS.upload,false) + chip('act','save','Save',RAPIER_DRAW_ICONS.download,false) + (settings.tip ? chip('act','remove','Remove',RAPIER_DRAW_ICONS.trash,false) : '');
		row.scrollLeft = scroll;
	} else if (panel === 'waterTools') {
		surface.querySelector('.rapier-draw-water-tools').innerHTML = engine.WATER_TOOLS.map(tool => chip('tool',tool.id || tool.tool || tool.kind,tool.name,_rapierWaterIcon(tool.id || tool.tool || tool.kind),settings.tool === (tool.id || tool.tool || tool.kind))).join('');
	} else if (panel === 'waterPaper') {
		surface.querySelector('.rapier-draw-water-paper').innerHTML = engine.WATER_PAPERS.map(paper => chip('paper',paper.id,paper.name,RAPIER_DRAW_ICONS.canvas,settings.paper === paper.id)).join('');
	} else if (panel === 'waterPigments') {
		const selected = engine.WATER_PIGMENTS.find(row => row.id === settings.pigment);
		surface.querySelector('.rapier-draw-water-pigments').innerHTML = '<div class="rapier-draw-water-pigment-name"><span>' + _rapierDrawEscapeAttr(selected?.name || 'Mixed pigment') + '</span><button type="button" class="rapier-draw-swatch rapier-draw-swatch--dropper" data-water-act="sample" aria-label="Pick pigment from the painting" aria-pressed="' + settings.sampling + '">' + RAPIER_DRAW_ICONS.dropper + '</button></div><div class="rapier-draw-palette">' + engine.WATER_PIGMENTS.map(pigment => '<button type="button" class="rapier-draw-swatch" data-water-pigment="' + pigment.id + '" aria-label="' + _rapierDrawEscapeAttr(pigment.name) + '" data-tip="' + _rapierDrawEscapeAttr(pigment.name) + '" aria-pressed="' + (settings.pigment === pigment.id) + '"><span style="background:' + pigment.colour + '"></span></button>').join('') + '</div>';
	}
	for (const input of surface.querySelectorAll('[data-water-control]')) {
		const key = input.dataset.waterControl; input.value = String(Math.round(settings[key] * 100)); _rapierDrawSeekSync(input);
		const output = surface.querySelector('[data-water-output="' + key + '"]'); output.textContent = input.value + '%'; input.setAttribute('aria-valuetext', output.textContent);
	}
	for (const button of surface.querySelectorAll('[data-water-strength]')) button.setAttribute('aria-pressed', String(button.dataset.waterStrength === settings.strength));
}
function _rapierWaterGlyphKey(id, custom, settings) {
	return JSON.stringify([id,settings.pigment,settings.paper,settings.strength,settings.angle,settings.follow,custom ? id : null]);
}
function _rapierWaterGlyph(id, custom = false) {
	const settings = {..._rapierWaterState(),pigment:structuredClone(_rapierWaterState().pigment)}, key = _rapierWaterGlyphKey(id,custom,settings);
	if (_rapierWaterGlyphs.has(key)) return _rapierWaterGlyphs.get(key);
	if (_rapierWaterGlyphPending.has(key)) return '';
	_rapierWaterGlyphPending.add(key);
	void (async () => {
		let url = '';
		try {
			const remote = await _rapierWaterPreviewPainter(), preset = _rapierWaterEngine().WATER_BRUSHES.find(row => row.id === id), own = custom && _rapierWaterOwn().find(row => row.id === id), definition = _rapierWaterDefinition({...settings,...(own ? own.water : preset),pigment:settings.pigment,paper:settings.paper,brush:id,tool:'brush',tip:own ? own.water.tip : null});
			const points = Array.from({length:33},(_,i) => { const t = i / 32; return [12 + 72*t,30 + 10*Math.sin(t*Math.PI*2),.12 + .7*Math.sin(t*Math.PI),.012]; });
			url = _rapierPaintPNG.encode(await remote.preview({width:96,height:60,definition,points,settle:true,options:{seed:7,radiusOffset:-1.1}}));
		} catch (_) {}
		if (url) { if (_rapierWaterGlyphs.size >= 96) _rapierWaterGlyphs.delete(_rapierWaterGlyphs.keys().next().value); _rapierWaterGlyphs.set(key,url); }
		_rapierWaterGlyphPending.delete(key);
		if (url && _rapierDrawState.waterPanel === 'waterBrushes' && key === _rapierWaterGlyphKey(id,custom,_rapierWaterState())) {
			// A preview may finish between pointerdown and pointerup. Keep the chip in place.
			for (const button of _rapierDrawState.surface.querySelectorAll('[data-water-brush]')) if (button.dataset.waterBrush === id) {
				const prior = button.querySelector('.rapier-draw-glyph,svg'), art = document.createElement('img');
				art.className = 'rapier-draw-glyph rapier-draw-glyph--paint'; art.alt = ''; art.src = url;
				if (prior) prior.replaceWith(art); else button.prepend(art);
			}
		}
	})();
	return '';
}
function _rapierWaterBind(surface) {
	for (const row of surface.querySelectorAll('.rapier-draw-water-brushes,.rapier-draw-water-tools,.rapier-draw-water-paper,.rapier-draw-water-pigments,.rapier-draw-water-load')) {
		_rapierDrawBindTap(row, async event => {
			if (_rapierDrawState.finishing) return;
			const button = event.target.closest('button'); if (!button) return;
			if (button.hasAttribute('data-draw-paint-head')) { _rapierPaintAngleOpen(true); return; }
			for (const key of ['brush','paper','pigment','strength']) if (button.dataset['water' + key[0].toUpperCase() + key.slice(1)] != null) {
				_rapierWaterSet(key, button.dataset['water' + key[0].toUpperCase() + key.slice(1)]); return;
			}
			const tool = button.dataset.waterTool, act = button.dataset.waterAct;
			if (tool) {
				if (tool === 'dry') { void _rapierWaterRunAction({kind:'dry'}); return; }
				if (tool === 'text') { _rapierWaterTextDialog(); return; }
				_rapierWaterSet('tool',tool); _rapierWaterState().sampling = false; _rapierDrawCloseSettingPanels(); return;
			}
			if (act === 'paper') _rapierWaterOpen('waterPaper');
			else if (act === 'sample') { _rapierWaterState().sampling = true; _rapierDrawCloseSettingPanels(); }
			else if (act === 'add') { await _rapierPrepareFileChooser('image'); const input = surface.querySelector('[data-water-tip-input]'); input.value = ''; input.click(); }
			else if (act === 'save') _rapierWaterSaveBrush();
			else if (act === 'remove') {
				const rows = _rapierWaterOwn().filter(row=>row.id!==_rapierWaterState().brush); _rapierDrawState.waterBrushes=rows;
				try { localStorage.setItem(RAPIER_WATER_KEY+'.brushes',JSON.stringify(rows)); } catch (_) {}
				_rapierWaterSet('brush','water/round');
			}
		});
	}
	for (const input of surface.querySelectorAll('[data-water-control]')) input.addEventListener('input', () => { if (!_rapierDrawState.finishing) _rapierWaterSet(input.dataset.waterControl, Number(input.value) / 100); });
	surface.querySelector('[data-water-tip-input]').addEventListener('change', event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void _rapierWaterAddBrush(file); });
}
function _rapierWaterTextDialog() {
	const settings = _rapierWaterState();
	_openFieldDialog({title:'Brush text',fields:[{label:'Words',value:settings.text},{label:'Size',value:String(settings.textSize)}],okLabel:'Place',prepare:([text,size]) => {
		const n = Number(size); if (!text || !Number.isFinite(n) || n < 4 || n > 512) throw new Error('Enter words and a size from 4 to 512.');
		globalThis.RapierDrawWaterPaths.waterTextPaths(text,{size:n,set:settings.letterSet}); return {text,size:n};
	},onOk:(_,value) => { settings.text = value.text; settings.textSize = value.size; settings.tool = 'text'; settings.sampling = false; _rapierDrawCloseSettingPanels(); }});
}
function _rapierWaterActionWanted() { const settings = _rapierWaterState(); return settings.sampling || ['fill','trace','text'].includes(settings.tool); }
async function _rapierWaterLayer(material = true) {
	const state = _rapierDrawState, session = state.session;
	const current = () => { if (!state.open || state.session !== session) throw Object.assign(new Error('The drawing changed before the Water action was ready.'),{name:'AbortError'}); };
	current();
	await _rapierPaintStartPainter('water');
	current();
	if (_rapierPaintLayerValid(material)) return state.paintLayer;
	const target = _rapierPaintTarget();
	if (target) { _rapierPaintRehydrateFor(target); if (state.paintRehydrateTask) await state.paintRehydrateTask; }
	current();
	if (_rapierPaintLayerValid(material)) return state.paintLayer;
	if (target?.paint?.mode === 'water') throw new Error('This Water layer could not be reopened. Its saved painting is unchanged.');
	await _rapierPaintCloseLayer(); current(); return _rapierPaintOpenLayer(undefined,null,null,null,'water');
}
function _rapierWaterToLayer(point, layer) {
	if (layer.frame) {
		const f=layer.frame, dx=point[0]-f.c0[0], dy=point[1]-f.c0[1], det=f.eux*f.evy-f.evx*f.euy;
		return [((dx*f.evy-dy*f.evx)/det+f.pad)/layer.scale,((dy*f.eux-dx*f.euy)/det+f.pad)/layer.scale,...point.slice(2)];
	}
	return [point[0]-(layer.origin?.[0]||0),point[1]-(layer.origin?.[1]||0),...point.slice(2)];
}
async function _rapierWaterActionAt(event, gesture) {
	const state = _rapierDrawState, session = state.session, selected = _rapierWaterState(), settings = structuredClone(selected), point = _rapierDrawSurfacePoint(event);
	if (settings.sampling) {
		try { const layer = await _rapierWaterLayer(), p = _rapierWaterToLayer(point,layer), sample = await layer.surface.samplePigment(p[0],p[1]);
			if (!state.open || state.session !== session || _rapierDrawTool() !== 'water' || state.waterSettings !== selected || !selected.sampling) return;
			if (!sample || !sample.coefficients?.some(value => value > 0)) { showToast('There is no pigment here to pick.', 'info'); return; }
			_rapierWaterState().pigment = {coefficients:sample.coefficients,granulation:sample.granulation,staining:sample.staining,...(sample.source ? {source:sample.source} : {})}; _rapierWaterState().sampling = false; _rapierWaterOpen('waterPigments');
		} catch (error) { if (state.open && state.session === session && error.name !== 'AbortError') showToast(String(error.message || error),'error'); }
		return;
	}
	try {
		const controls = {size:settings.size,water:settings.water,load:settings.load,firm:settings.strength !== 'light',light:1,angle:settings.angle,follow:settings.follow};
		const action = {seed:(Math.random()*0x3fffffff)|0,pigment:settings.pigment,paper:settings.paper,brush:settings.brush,controls};
		if (settings.tool === 'fill') Object.assign(action,{kind:'fill',at:point,tolerance:.08});
		else {
			let captured;
			if (settings.tool === 'trace') { const shape = _rapierDrawShapeById(gesture.downId || _rapierDrawHitShape(point,_rapierDrawHitSlop())); if (!shape) throw new Error('Tap a shape to trace it.'); captured = globalThis.RapierDrawWaterPaths.waterTracePaths(shape,_rapierDrawState.recipe); }
			else captured = globalThis.RapierDrawWaterPaths.waterTextPaths(settings.text,{x:point[0],y:point[1],size:settings.textSize,set:settings.letterSet});
			Object.assign(action,{kind:'stroke',tool:'brush',brush:settings.brush,source:settings.tool,paths:captured.paths});
		}
		await _rapierWaterRunAction(action,true,settings.tip ? {brush:settings.brush,tip:settings.tip} : null);
	} catch (error) { showToast(String(error.message || error),'error'); }
}
// A custom tip is stored once in the layer's source and the action names it: `tip` is the brush and mask to declare first (a repeat records nothing).
function _rapierWaterRunAction(action, world = false, tip = null) {
	const state = _rapierDrawState; if (state.waterAction || state.finishing || !state.open) return Promise.resolve(false);
	const session = state.session, gesture = {kind:'paint',tool:'water',paint:{discarded:false}};
	const task = (async () => {
		const layer = await _rapierWaterLayer(action.kind !== 'stroke'); if (!state.open || state.session !== session) return false;
		if (await _rapierPaintStrokeCheckpoint(gesture,layer) !== undefined) return false;
		delete layer.warmView; layer.setPending = true;
		const admitted = structuredClone(action);
		if (world && admitted.paths) {
			const radius = _rapierWaterEngine().waterRadius(admitted.controls.size), bounds = [Infinity,Infinity,-Infinity,-Infinity];
			for (const path of admitted.paths) for (const point of path) { bounds[0]=Math.min(bounds[0],point[0]); bounds[1]=Math.min(bounds[1],point[1]); bounds[2]=Math.max(bounds[2],point[0]); bounds[3]=Math.max(bounds[3],point[1]); }
			for (const corner of [[bounds[0]-radius,bounds[1]-radius],[bounds[2]+radius,bounds[3]+radius]]) { const p = _rapierWaterToLayer(corner,layer); _rapierPaintGrowToHold(layer,null,{x:p[0],y:p[1]}); }
		}
		if (world) { if (admitted.at) admitted.at = _rapierWaterToLayer(admitted.at,layer); if (admitted.paths) admitted.paths = admitted.paths.map(path => path.map(point => _rapierWaterToLayer(point,layer))); }
		_rapierPaintShowLive(true); if (tip) await layer.surface.applyWater({kind:'tip',brush:structuredClone(tip)}); await layer.surface.applyWater(admitted); await _rapierWaterPreflight(layer); _rapierPaintReleaseStroke(gesture);
		layer.brushId = _rapierWaterState().brush; layer.paintVersion = (layer.paintVersion || 0) + 1;
		const held = _rapierPaintLiftHold(layer); await layer.surface.sync(); _rapierPaintEndDecide(layer,held); _rapierDrawBackupTouch(); return true;
	})().catch(error => { if (state.open && state.session === session) { _rapierPaintReleaseStroke(gesture,true); if (error.name !== 'AbortError') showToast(String(error.message || error),'error'); } return false; }).finally(() => { if (state.waterAction === task) state.waterAction = null; });
	state.waterAction = task; return task;
}
async function _rapierWaterPreflight(layer) {
	const result = await layer.surface.readBounds();
	if (!result.box) return;
	const sheet = result.waterSheet, replay = _rapierPaintWaterReplay(layer,result.waterReplay,result.box,sheet);
	// One coalesced drying advance and one explicit dry fit before the gesture releases its rollback.
	const reserved = structuredClone(replay), entry = reserved.entries.find(row => row.id === sheet.id + '-water');
	entry.actions.push({kind:'advance',ticks:Number.MAX_SAFE_INTEGER},{kind:'dry'});
	if (!globalThis.RapierDrawAgentPaint.paintReplayFits(reserved)) throw Object.assign(new Error('This Water layer is full. Set it and paint on a new layer.'),{code:'paint_history_full',recoverable:true});
}
async function _rapierWaterAddBrush(file) {
	const state = _rapierDrawState, session = state.session;
	try {
		let tip, imported = null, name = file.name.replace(/\.[^.]+$/,'');
		if (/\.json$/i.test(file.name)) { const raw = JSON.parse(await file.text()); imported = _rapierWaterEngine().admitWaterBrush(raw.definition); if (!imported) throw new Error('This file does not contain a Water brush.'); tip = imported.tip || null; name = typeof raw.name === 'string' ? raw.name : name; }
		else {
			const image = await createImageBitmap(file);
			try {
				if (image.width * image.height > _rapierWaterEngine().WATER_TIP_MAX_PIXELS) throw new Error('This brush picture is too large. Use a picture of at most 1,048,576 pixels.');
				const canvas = document.createElement('canvas'); canvas.width=image.width; canvas.height=image.height;
				const ctx=canvas.getContext('2d',{willReadFrequently:true}); ctx.drawImage(image,0,0);
				const pixels=ctx.getImageData(0,0,image.width,image.height).data, mask=[];
				for(let i=0;i<pixels.length;i+=4) mask.push(Math.round((1-(.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2])/255)*pixels[i+3]));
				tip={width:image.width,height:image.height,mask};
			} finally { image.close(); }
		}
		if (tip) tip = _rapierWaterEngine().admitWaterTip(tip); if (!tip && !imported) throw new Error('The picture must contain a visible brush mark.');
		if (!state.open || state.session !== session) return;
		const settings=_rapierWaterState(); if (imported) { for (const key of ['brush','pigment','paper','size','water','load','angle','follow']) settings[key]=imported[key]; settings.strength=imported.firm ? 'firm' : 'light'; }
		settings.tip=tip; settings.tipKey=tip ? _rapierPaintDigest(JSON.stringify(tip)) : null; settings.tipName=name; settings.tool='brush'; if (!imported) settings.brush='water/round';
		if (tip) {
			settings.brush='water/own-' + settings.tipKey;
			const water=_rapierWaterDefinition(settings).water, rows=_rapierWaterOwn().filter(row=>row.id!==settings.brush); rows.push({id:settings.brush,name,water}); state.waterBrushes=rows;
			try { localStorage.setItem(RAPIER_WATER_KEY + '.brushes',JSON.stringify(rows)); } catch (_) { showToast('The brush is ready. Save it to keep a separate copy.', 'info'); }
		}
		_rapierWaterSave(); _rapierWaterOpen('waterBrushes',true);
	} catch(error) { if(state.session===session) showToast('The brush could not be added: '+String(error.message||error),'error'); }
}
function _rapierWaterSaveBrush() {
	const settings=_rapierWaterState(), text=JSON.stringify({name:settings.tipName || _rapierWaterEngine().WATER_BRUSHES.find(row=>row.id===settings.brush)?.name,definition:_rapierWaterDefinition(),tip:settings.tip});
	const url=URL.createObjectURL(new Blob([text],{type:'application/json'})), link=document.createElement('a'); link.href=url; link.download=(settings.tipName||settings.brush.split('/').at(-1)) + '.water.json'; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
