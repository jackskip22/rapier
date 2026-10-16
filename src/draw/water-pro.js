// SPDX-License-Identifier: AGPL-3.0-only
function _rapierWaterProAvailable() { return globalThis.RapierPlatform?.water?.available === true; }
function _rapierWaterProBrushAvailable(row) {
	const water = row?.water, engine = _rapierWaterEngine();
	return !water || _rapierWaterProAvailable() || (!engine.isWaterSpecialtyPigment(water.pigment) && !engine.waterPaperById(water.paper)?.pro);
}
function _rapierWaterProError(error) { if (error?.name !== 'AbortError') showToast(String(error?.message || error), 'error'); }
function _rapierWaterProOpenDialog(options) {
	const state = _rapierDrawState, dialog = _openFieldDialog(options);
	state.waterProDialog = dialog;
	dialog.signal.addEventListener('abort', () => { if (state.waterProDialog === dialog) state.waterProDialog = null; }, {once:true});
	return dialog;
}
function _rapierWaterProCancelDialog() {
	const state = _rapierDrawState, dialog = state.waterProDialog, active = _rapierDialogRuntime.active;
	state.waterProDialog = null;
	if (dialog && active?.overlay === dialog.overlay) active.cancel(true);
}
async function _rapierWaterProAuthorize(feature) {
	const water = globalThis.RapierPlatform?.water;
	if (!water?.available || !water.authorize) throw new Error('Pro watercolour is unavailable.');
	const result = await water.authorize(feature);
	if (!result?.authorized || !water.available) throw new Error('Pro watercolour is unavailable.');
}
async function _rapierWaterProAuthorizeActions(actions, options = {}) {
	const engine = _rapierWaterEngine(), features = new Set();
	const inspect = value => {
		if (engine.isWaterSpecialtyPigment(value?.pigment)) features.add('pigments');
		if (engine.waterPaperById(value?.paper)?.pro) features.add('papers');
		if (value?.kind === 'trace' || value?.source === 'trace') features.add('trace');
	};
	inspect(options);
	for (const action of Array.isArray(actions) ? actions : []) {
		inspect(action);
		if (action?.kind === 'tip') inspect(action.brush?.water || action.brush);
	}
	for (const feature of features) await _rapierWaterProAuthorize(feature);
}
async function _rapierWaterProChoose(key, value) {
	const state = _rapierDrawState, session = state.session, engine = _rapierWaterEngine();
	const choice = state.waterProChoice = (state.waterProChoice || 0) + 1;
	try {
		if (key === 'pigment' && engine.isWaterSpecialtyPigment(value)) await _rapierWaterProAuthorize('pigments');
		if (key === 'pigment' && state.waterMixing && _rapierWaterProAvailable()) { await _rapierWaterProAuthorize('pigments'); value = engine.mixWaterPigments(_rapierWaterState().pigment,value,.25); }
		if (key === 'paper' && engine.waterPaperById(value)?.pro) await _rapierWaterProAuthorize('papers');
		if (key === 'brush') {
			const water = _rapierWaterOwn().find(row => row.id === value)?.water;
			if (water && engine.isWaterSpecialtyPigment(water.pigment)) await _rapierWaterProAuthorize('pigments');
			if (water && engine.waterPaperById(water.paper)?.pro) await _rapierWaterProAuthorize('papers');
		}
		if (!state.open || state.session !== session || state.waterProChoice !== choice) return false;
		_rapierWaterSet(key, structuredClone(value)); return true;
	} catch (error) { _rapierWaterProError(error); return false; }
}
function _rapierWaterProPigmentsHTML() {
	if (!_rapierWaterProAvailable()) return '';
	const engine = _rapierWaterEngine(), chosen = _rapierWaterState().pigment;
	return '<div class="rapier-draw-water-pigment-name"><span>Specialty pigments</span></div><div class="rapier-draw-palette">' +
		engine.WATER_SPECIALTY_PIGMENTS.map(pigment => '<button type="button" class="rapier-draw-swatch" data-water-pigment="' + pigment.id + '" aria-label="' + _rapierDrawEscapeAttr(pigment.name) + '" data-tip="' + _rapierDrawEscapeAttr(pigment.name) + '" aria-pressed="' + (chosen === pigment.id) + '"><span style="background:' + pigment.colour + '"></span></button>').join('') +
		'</div><div class="rapier-draw-water-palette-actions"><button type="button" class="rapier-draw-chip" data-water-act="palettes">Palettes</button><button type="button" class="rapier-draw-chip" data-water-act="mix" aria-pressed="' + !!_rapierDrawState.waterMixing + '">Mix</button><button type="button" class="rapier-draw-chip" data-water-act="find">Find mix</button></div>';
}
async function _rapierWaterProReadPalettes() {
	const owner = globalThis.RapierPlatform?.water;
	if (!owner?.available || !owner.readPalettes) throw new Error('Saved palettes are unavailable.');
	const record = await owner.readPalettes();
	if (typeof record?.revision !== 'string' || !Array.isArray(record.palettes)) throw new Error('The saved palettes could not be read.');
	for (const palette of record.palettes) for (const entry of palette.entries) {
		if (!_rapierWaterEngine().admitWaterPigment(entry.pigment)) throw new Error('A saved pigment is unavailable. The palette was kept.');
	}
	return record;
}
async function _rapierWaterProChange(change) {
	const state = _rapierDrawState, session = state.session;
	const record = await _rapierWaterProReadPalettes(), palettes = structuredClone(record.palettes);
	change(palettes);
	const kept = await globalThis.RapierPlatform.water.writePalettes({revision:record.revision,palettes});
	if (state.open && state.session === session && _rapierWaterProAvailable()) { state.waterPalettes = kept; _rapierWaterUpdate(); }
	return kept;
}
function _rapierWaterProName(value) {
	const name = String(value).trim();
	if (!name || Array.from(name).length > 80) throw new Error('Use a name from 1 to 80 characters.');
	return name;
}
function _rapierWaterProPalette(rows, id) {
	const palette = rows.find(row => row.id === id);
	if (!palette) throw new Error('This palette changed. Open Palettes again.');
	return palette;
}
function _rapierWaterProOrder(rows, id, position) {
	const index = rows.findIndex(row => row.id === id), to = Number(position) - 1;
	if (index < 0 || !Number.isSafeInteger(to) || to < 0 || to >= rows.length) throw new Error('Choose a position in this palette.');
	const [item] = rows.splice(index,1); rows.splice(to,0,item);
}
function _rapierWaterProPosition(rows, id) {
	return {type:'select',label:'Position',value:String(rows.findIndex(row => row.id === id) + 1),options:rows.map((_,i) => ({value:String(i+1),label:String(i+1)}))};
}
function _rapierWaterProPaletteDialog({title,fields,prepare,commit,onKeep,secondaryActions = []}) {
	const state = _rapierDrawState, session = state.session;
	const current = () => state.open && state.session === session && _rapierWaterProAvailable();
	function open(shown, description = '') {
		if (!current()) return;
		_rapierWaterProOpenDialog({title,fields:shown,description,okLabel:'Keep',prepare,secondaryActions,
			onOk:async (values,prepared) => {
				if (!current()) return;
				try { const kept = await commit(values,prepared); if (current()) onKeep?.(kept); }
				catch (error) {
					if (current() && error?.name !== 'AbortError') open(shown.map((field,index) => ({...field,value:values[index]})),String(error?.message || error));
				}
			}});
	}
	open(fields);
}
function _rapierWaterProNewPalette() {
	const pigment = structuredClone(_rapierWaterState().pigment), engine = _rapierWaterEngine();
	const name = engine.waterPigmentById(pigment)?.name || 'Mix';
	_rapierWaterProPaletteDialog({title:'New palette',fields:[{label:'Name',value:'Palette ' + ((_rapierDrawState.waterPalettes?.palettes.length || 0) + 1)}],
		prepare:([value]) => _rapierWaterProName(value),
		commit:async (_,title) => {
			const id = crypto.randomUUID();
			await _rapierWaterProChange(rows => rows.push({id,name:title,entries:[{id:crypto.randomUUID(),name,pigment}]}));
			return id;
		},onKeep:id => { _rapierDrawState.waterPaletteId = id; _rapierWaterUpdate(); }});
}
function _rapierWaterProKeepPigment() {
	const state = _rapierDrawState, id = state.waterPaletteId, pigment = structuredClone(_rapierWaterState().pigment);
	if (!id) { _rapierWaterProNewPalette(); return; }
	_rapierWaterProPaletteDialog({title:'Keep pigment',fields:[{label:'Name',value:_rapierWaterEngine().waterPigmentById(pigment)?.name || 'Mix'}],
		prepare:([value]) => _rapierWaterProName(value),
		commit:async (_,name) => {
			const entry = crypto.randomUUID();
			await _rapierWaterProChange(rows => _rapierWaterProPalette(rows,id).entries.push({id:entry,name,pigment}));
			return entry;
		},onKeep:entry => { state.waterPaletteEntry = entry; _rapierWaterUpdate(); }});
}
function _rapierWaterProEditPalette() {
	const state = _rapierDrawState, rows = state.waterPalettes?.palettes || [], palette = _rapierWaterProPalette(rows,state.waterPaletteId), id = palette.id;
	_rapierWaterProPaletteDialog({title:'Edit palette',fields:[{label:'Name',value:palette.name},_rapierWaterProPosition(rows,id)],
		prepare:([value]) => _rapierWaterProName(value),
		commit:([,position],name) => _rapierWaterProChange(next => { _rapierWaterProPalette(next,id).name = name; _rapierWaterProOrder(next,id,position); }),
		secondaryActions:[{label:'Delete',onSelect:() => { void _rapierWaterProChange(next => {
			const index = next.findIndex(row => row.id === id); if (index >= 0) next.splice(index,1);
		}).catch(_rapierWaterProError); }}]});
}
function _rapierWaterProEditEntry() {
	const state = _rapierDrawState, palette = _rapierWaterProPalette(state.waterPalettes.palettes,state.waterPaletteId), id = palette.id;
	const entry = palette.entries.find(row => row.id === state.waterPaletteEntry);
	if (!entry) return;
	_rapierWaterProPaletteDialog({title:'Edit pigment',fields:[{label:'Name',value:entry.name},_rapierWaterProPosition(palette.entries,entry.id)],
		prepare:([value]) => _rapierWaterProName(value),
		commit:([,position],name) => _rapierWaterProChange(rows => {
			const entries = _rapierWaterProPalette(rows,id).entries, current = entries.find(row => row.id === entry.id);
			if (!current) throw new Error('This pigment changed. Open Palettes again.');
			current.name = name; _rapierWaterProOrder(entries,entry.id,position);
		}),secondaryActions:[{label:'Delete',onSelect:() => { void _rapierWaterProChange(rows => {
			const entries = _rapierWaterProPalette(rows,id).entries, index = entries.findIndex(row => row.id === entry.id);
			if (index >= 0) entries.splice(index,1);
		}).catch(_rapierWaterProError); }}]});
}
function _rapierWaterProPalettesRender(root) {
	const state = _rapierDrawState, palettes = state.waterPalettes?.palettes || [];
	const palette = palettes.find(row => row.id === state.waterPaletteId) || palettes[0];
	state.waterPaletteId = palette?.id || null;
	const button = (word,act,id) => {
		const node = document.createElement('button'); node.type = 'button'; node.className = 'rapier-draw-chip';
		node.textContent = word; node.dataset.waterAct = act; if (id) node.dataset.waterId = id; return node;
	};
	root.replaceChildren();
	const header = document.createElement('div'); header.className = 'rapier-draw-water-pigment-name';
	header.append(button('Pigments','paletteBack'),button('New palette','paletteNew')); root.append(header);
	if (!palette) {
		const empty = document.createElement('p'); empty.className = 'rapier-draw-water-palette-empty'; empty.textContent = 'Keep your pigments and mixes together.'; root.append(empty); return;
	}
	const choices = document.createElement('div'); choices.className = 'rapier-draw-water-palette-tabs';
	for (const row of palettes) {
		const tab = button(row.name,'palettePick',row.id); tab.setAttribute('aria-pressed',String(row.id === palette.id)); choices.append(tab);
	}
	root.append(choices);
	const swatches = document.createElement('div'); swatches.className = 'rapier-draw-palette';
	for (const entry of palette.entries) {
		const swatch = button('','palettePigment',entry.id); swatch.className = 'rapier-draw-swatch';
		swatch.setAttribute('aria-label',entry.name); swatch.dataset.tip = entry.name;
		swatch.setAttribute('aria-pressed',String(entry.id === state.waterPaletteEntry));
		const colour = document.createElement('span'); colour.style.backgroundColor = _rapierWaterEngine().waterPigmentColour(entry.pigment); swatch.append(colour); swatches.append(swatch);
	}
	root.append(swatches);
	const selected = palette.entries.find(row => row.id === state.waterPaletteEntry);
	if (selected) {
		const name = document.createElement('div'); name.className = 'rapier-draw-water-pigment-name';
		const label = document.createElement('span'); label.textContent = selected.name; name.append(label,button('Edit pigment','paletteEntryEdit')); root.append(name);
	}
	const actions = document.createElement('div'); actions.className = 'rapier-draw-water-palette-actions';
	const mix = button('Mix','mix'); mix.setAttribute('aria-pressed',String(!!state.waterMixing));
	actions.append(button('Keep pigment','paletteKeep'),mix,button('Find mix','find'),button('Edit palette','paletteEdit')); root.append(actions);
}
async function _rapierWaterProSettle(current) {
	let pending = _rapierPaintPendingStroke(true);
	while (pending) { await pending; current(); pending = _rapierPaintPendingStroke(true,true); }
	const layer = _rapierPaintLayer();
	if (layer) {
		const ownsLayer = () => current() && _rapierPaintLayer() === layer;
		await _rapierPaintCommit(true, null, false, ownsLayer); current();
		if (!ownsLayer()) throw new DOMException('The painting changed before the time-lapse','AbortError');
		await _rapierPaintCloseLayer(ownsLayer); await layer.decoding?.promise; await layer.surface?.remote?.flush(); current();
	}
	return structuredClone(_rapierDrawState.recipe);
}
function _rapierWaterProScene(recipe, {width: W, height: H}) {
	const ink = {x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity};
	for (const shape of recipe.shapes) { try { const b = _rapierDrawShapeBBoxIn(shape, recipe); ink.x0 = Math.min(ink.x0, b.minX); ink.y0 = Math.min(ink.y0, b.minY); ink.x1 = Math.max(ink.x1, b.maxX); ink.y1 = Math.max(ink.y1, b.maxY); } catch (_) {} }
	const box = recipe.frame || (Number.isFinite(ink.x0) ? {x: ink.x0, y: ink.y0, w: ink.x1 - ink.x0, h: ink.y1 - ink.y0} : _rapierDrawStartFrame(recipe));
	const [vx, vy, vw, vh] = [box.x, box.y, Math.max(1, box.w), Math.max(1, box.h)], pad = recipe.frame ? 0 : Math.max(vw, vh) * .08;
	const grow = Math.max((vw + 2 * pad) / W, (vh + 2 * pad) / H), view = {x: vx + (vw - W * grow) / 2, y: vy + (vh - H * grow) / 2, w: W * grow, h: H * grow}, s = 1 / grow;
	const at = ([x, y]) => [(x - view.x) * s, (y - view.y) * s];
	const render = async sub => {
		const text = _rapierPaintShowable(_rapierDrawBuildSVG(sub, _rapierDrawMeasuredView, true)).replace(/prefers-color-scheme:\s*dark/g, 'not all')
			.replace(/viewBox="[^"]*" width="[^"]*" height="[^"]*"/, 'viewBox="' + [view.x, view.y, view.w, view.h].map(_rapierDrawFmt).join(' ') + '" width="' + W + '" height="' + H + '"');
		const url = URL.createObjectURL(new Blob([text], {type: 'image/svg+xml'})), image = new Image();
		try { image.src = url; await image.decode(); return await createImageBitmap(image); } finally { URL.revokeObjectURL(url); }
	};
	const {background, ...bare} = recipe;
	const ground = async () => {
		const board = new OffscreenCanvas(W, H), context = board.getContext('2d');
		context.fillStyle = recipe.paper === 'black' ? '#000000' : '#ffffff'; context.fillRect(0, 0, W, H);
		if (background) context.drawImage(await render({...recipe, frame: view, shapes: []}), 0, 0);
		return board;
	};
	const steps = [];
	for (const shape of recipe.shapes) {
		const image = () => render({...bare, effect: undefined, shapes: [shape]}), replay = shape.paint?.mode === 'water' ? shape.paint.replay : null;
		let plays = false;
		if (replay) try { plays = !!globalThis.RapierDrawWaterVideo.waterVideoPlan(replay); } catch (_) {}
		if (plays) {
			const f = _rapierDrawShapePolygon(shape, recipe), [w, h] = shape.paint.px;
			if (f) { steps.push({kind: 'water', replay, image, matrix: [(f[1][0] - f[0][0]) / w * s, (f[1][1] - f[0][1]) / w * s, (f[3][0] - f[0][0]) / h * s, (f[3][1] - f[0][1]) / h * s, (f[0][0] - view.x) * s, (f[0][1] - view.y) * s]}); continue; }
		}
		const travel = _rapierDrawReplayTravel(shape, recipe);
		if (!travel) continue;
		if (shape.recognized === 'paint' || shape.recognized === 'text') {
			let box = null;
			try { box = _rapierDrawShapeBBoxIn(shape, recipe); } catch (_) {}
			if (!box) continue;
			const [x0, y0] = at([box.minX, box.minY]), [x1, y1] = at([box.maxX, box.maxY]);
			steps.push({kind: 'reveal', box: {x: x0, y: y0, w: x1 - x0, h: y1 - y0}, image});
		} else steps.push({kind: 'mark', line: travel.line.map(at), colour: _rapierDrawShapeInk(shape), width: Math.max(1, _rapierDrawStrokeHalf(shape, recipe) * 2 * s), image});
	}
	return {steps, ground, final: () => render(recipe)};
}
function _rapierWaterProPlay(session) {
	const state = _rapierDrawState;
	if (!state.open || state.session !== session || state.replay) return;
	const recipe = state.recipe, settle = RAPIER_DRAW_REPLAY_PACE * RAPIER_DRAW_REPLAY_SPEED * (RAPIER_DRAW_REPLAY_SETTLE_MS / 1000), steps = [];
	for (const shape of recipe.shapes) {
		const travel = _rapierDrawReplayTravel(shape, recipe);
		if (travel) steps.push({id: shape.id, travel, was: null, colour: _rapierDrawDisplayInk(_rapierDrawShapeInk(shape)), width: Math.max(1, _rapierDrawStrokeHalf(shape, recipe) * 2), settle});
	}
	if (!steps.length) return;
	state.replay = {steps, targetShapes: recipe.shapes.slice(), entry: null, recipe, session, at: 0, into: 0, fast: .5, frame: 0, last: performance.now(), name: '', receiptOptions: null};
	_rapierDrawReplayRender(state.replay); _rapierDrawReplayControls(state.replay); _rapierDrawReplayPaint(state.replay);
	state.replay.frame = requestAnimationFrame(_rapierDrawReplayFrame);
}
function _rapierWaterProRecipe(mix) {
	const [a,b] = mix.amounts, [p,q] = mix.paints, total = a + (b || 0), name = row => row.name;
	const say = !q ? name(p) : Math.max(a,b) / Math.min(a,b) < 1.25 ? 'Equal parts ' + name(p) + ' and ' + name(q)
		: Math.max(a,b) / Math.min(a,b) > 4 ? name(a > b ? p : q) + ' with a touch of ' + name(a > b ? q : p)
		: Math.round(2 * Math.max(a,b) / Math.min(a,b)) / 2 + ' parts ' + name(a > b ? p : q) + ' to 1 of ' + name(a > b ? q : p);
	return {say, detail:(total < .25 ? 'Pale wash' : total < .6 ? 'Light wash' : total < 1.2 ? 'Mid wash' : 'Strong paint') + (mix.distance < 2 ? ', matches' : mix.distance < 5 ? ', close' : ', nearest your paints reach')};
}
async function _rapierWaterProFind() {
	const state = _rapierDrawState, session = state.session, engine = _rapierWaterEngine();
	await _rapierWaterProAuthorize('pigments');
	if (!state.open || state.session !== session) return;
	const palette = state.waterPalettePanel && state.waterPalettes?.palettes.find(row => row.id === state.waterPaletteId);
	const paints = palette ? palette.entries.map(entry => ({name:entry.name,pigment:entry.pigment,...(typeof entry.pigment === 'string' ? {id:entry.pigment,coefficients:engine.waterPigmentById(entry.pigment).coefficients} : {coefficients:entry.pigment.coefficients})}))
		: engine.WATER_PIGMENTS.filter(row => row.id !== 'white-gouache').map(row => ({id:row.id,name:row.name,pigment:row.id,coefficients:row.coefficients}));
	await _rapierDrawOpenDropper('water', hex => {
		if (!state.open || state.session !== session) return;
		const mixes = engine.waterMixes([1,3,5].map(i => parseInt(hex.slice(i,i + 2),16) / 255),paints);
		if (!mixes.length) { showToast('Add paints to this palette first.', 'info'); return; }
		const dialog = _rapierWaterProOpenDialog({title:'Mixes for ' + hex.toUpperCase(),fields:[{type:'choice',label:palette ? palette.name : 'Water paints',value:'0',
			options:mixes.map((mix,i) => { const words = _rapierWaterProRecipe(mix); return {value:String(i),label:words.say,detail:words.detail}; })}],okLabel:'Use mix',
			prepare:async ([index]) => {
				await _rapierWaterProAuthorize('pigments');
				const mix = mixes[Number(index)], [a,b] = mix.amounts;
				return mix.paints[1] ? engine.mixWaterPigments(mix.paints[0].pigment,mix.paints[1].pigment,b / (a + b)) : structuredClone(mix.paints[0].pigment);
			},onOk:(_,pigment) => { if (state.open && state.session === session) return _rapierWaterProChoose('pigment',pigment); }});
		dialog.overlay.querySelectorAll('.link-dialog__choice > span').forEach((words,i) => {
			const chip = document.createElement('span'); chip.className = 'rapier-draw-water-find-chip';
			chip.style.background = 'linear-gradient(90deg,' + hex + ' 50%,' + engine.waterPigmentColour({coefficients:mixes[i].coefficients}) + ' 50%)';
			words.before(chip);
		});
	});
}
function _rapierWaterProToolsHTML(chip) {
	if (!_rapierWaterProAvailable()) return '';
	const on = !!_rapierDrawState.waterValues;
	return chip('act','video','Time-lapse',RAPIER_DRAW_ICONS.download,false) +
		chip('act','values','Values',RAPIER_DRAW_ICON_WRAP('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor"/>'),on).replace('<button ','<button aria-pressed="' + on + '" ');
}
async function _rapierWaterProVideo() {
	const state = _rapierDrawState, session = state.session;
	await _rapierWaterProAuthorize('video');
	if (!state.open || state.session !== session) return;
	_rapierWaterProOpenDialog({title:'Time-lapse',fields:[{type:'choice',label:'Frame',value:'square',options:[{value:'square',label:'Square',detail:'1:1'},{value:'portrait',label:'Portrait',detail:'9:16'}]},
		{type:'select',label:'Length',value:'15',options:[5,15,30,45].map(n => ({value:String(n),label:n + ' seconds'}))}],okLabel:'Make video',progress:'Making time-lapse',initialFocus:'submit',
		secondaryActions:[{label:'Play',onSelect:() => { void _rapierWaterProSettle(() => { if (!state.open || state.session !== session) throw new DOMException('Play cancelled','AbortError'); return true; }).then(() => _rapierWaterProPlay(session), _rapierWaterProError); }}],
		prepare:async ([framing,duration],work) => {
			await _rapierWaterProAuthorize('video');
			const current = () => { if (work.signal.aborted || !state.open || state.session !== session) throw new DOMException('Video cancelled','AbortError'); return true; };
			current();
			const frame = await globalThis.RapierDrawWaterVideo.waterVideoFrame(framing); current();
			const scene = _rapierWaterProScene(await _rapierWaterProSettle(current), frame);
			const result = await globalThis.RapierDrawWaterVideo.exportDrawingVideo({...scene,framing,duration:Number(duration),signal:work.signal,onProgress:event => work.progress(event.fraction)});
			current(); return result;
		},onOk:async (_,result) => {
			const notice = _rapierProgressOpen({label:'Preparing video to share',after:0});
			try { await globalThis.RapierPlatform.water.shareVideo(result.blob,'drawing.mp4'); }
			finally { notice.end(); }
		}});
}
async function _rapierWaterProAction(act,button) {
	if (!['palettes','mix','find','values','video','paletteBack','paletteNew','paletteKeep','paletteEdit','paletteEntryEdit','palettePick','palettePigment'].includes(act)) return false;
	try {
		if (act === 'video') { await _rapierWaterProVideo(); return true; }
		if (act === 'mix') { if (!_rapierDrawState.waterMixing) await _rapierWaterProAuthorize('pigments'); _rapierDrawState.waterMixing = !_rapierDrawState.waterMixing; _rapierWaterUpdate(); return true; }
		if (act === 'find') { await _rapierWaterProFind(); return true; }
		if (act === 'values') { _rapierDrawState.waterValues = !_rapierDrawState.waterValues; _rapierWaterUpdate(); return true; }
		const state = _rapierDrawState, session = state.session;
		if (act === 'paletteBack') { state.waterPalettePanel = false; _rapierWaterUpdate(); return true; }
		await _rapierWaterProAuthorize('palettes');
		if (!state.open || state.session !== session) return true;
		if (act === 'palettes') {
			const record = await _rapierWaterProReadPalettes();
			if (state.open && state.session === session && _rapierWaterProAvailable()) { state.waterPalettes = record; state.waterPalettePanel = true; _rapierWaterUpdate(); }
		} else if (act === 'paletteNew') _rapierWaterProNewPalette();
		else if (act === 'paletteKeep') _rapierWaterProKeepPigment();
		else if (act === 'paletteEdit') _rapierWaterProEditPalette();
		else if (act === 'paletteEntryEdit') _rapierWaterProEditEntry();
		else if (act === 'palettePick') { state.waterPaletteId = button.dataset.waterId; state.waterPaletteEntry = null; _rapierWaterUpdate(); }
		else if (act === 'palettePigment') {
			const palette = _rapierWaterProPalette(state.waterPalettes.palettes,state.waterPaletteId), entry = palette.entries.find(row => row.id === button.dataset.waterId);
			if (entry && await _rapierWaterProChoose('pigment',entry.pigment)) { state.waterPaletteEntry = entry.id; _rapierWaterUpdate(); }
		}
	} catch (error) { _rapierWaterProError(error); }
	return true;
}
function _rapierWaterProChanged() {
	const state = _rapierDrawState;
	if (!_rapierWaterProAvailable()) {
		_rapierWaterProCancelDialog();
		state.waterProChoice = (state.waterProChoice || 0) + 1; state.waterPalettePanel = false; state.waterPalettes = null; state.waterValues = false;
		const settings = state.waterSettings, engine = _rapierWaterEngine();
		if (settings && engine) {
			if (engine.isWaterSpecialtyPigment(settings.pigment)) settings.pigment = RAPIER_WATER_DEFAULT_PIGMENT;
			if (engine.waterPaperById(settings.paper)?.pro) settings.paper = 'cold-press';
			if (settings.tool === 'trace') settings.tool = 'brush';
			const own = _rapierWaterOwn().find(row => row.id === settings.brush);
			if (own && !_rapierWaterProBrushAvailable(own)) { settings.tipKey = null; _rapierWaterSet('brush',RAPIER_WATER_DEFAULT_BRUSH); }
			else _rapierWaterSave();
		}
	}
	if (state.open) { _rapierWaterUpdate(); if (_rapierBgOpen()) _rapierBgSyncPanel(); }
}
globalThis.addEventListener?.('rapier:pro-changed', _rapierWaterProChanged);
