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
		'</div><div class="rapier-draw-water-palette-actions"><button type="button" class="rapier-draw-chip" data-water-act="palettes">Palettes</button><button type="button" class="rapier-draw-chip" data-water-act="mix">Mix</button></div>';
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
	actions.append(button('Keep pigment','paletteKeep'),button('Mix','mix'),button('Edit palette','paletteEdit')); root.append(actions);
}
async function _rapierWaterProMix() {
	const state = _rapierDrawState, session = state.session;
	await _rapierWaterProAuthorize('pigments');
	if (!state.open || state.session !== session) return;
	const engine = _rapierWaterEngine(), first = structuredClone(_rapierWaterState().pigment);
	const choices = [...engine.WATER_PIGMENTS,...engine.WATER_SPECIALTY_PIGMENTS].map(row => ({name:row.name,pigment:row.id}));
	for (const palette of _rapierDrawState.waterPalettes?.palettes || []) for (const entry of palette.entries) choices.push({name:palette.name + ' / ' + entry.name,pigment:entry.pigment});
	_rapierWaterProOpenDialog({title:'Mix pigments',fields:[{type:'select',label:'Add pigment',value:'0',options:choices.map((row,i) => ({value:String(i),label:row.name}))},{label:'Amount (%)',value:'50'}],okLabel:'Use mix',
		prepare:async ([index,amount]) => {
			await _rapierWaterProAuthorize('pigments');
			const ratio = Number(amount), other = choices[Number(index)];
			if (!other || !String(amount).trim() || !Number.isFinite(ratio) || ratio < 0 || ratio > 100) throw new Error('Use an amount from 0 to 100.');
			return engine.mixWaterPigments(first,other.pigment,ratio/100);
		},onOk:(_,pigment) => { if (_rapierDrawState.open && _rapierDrawState.session === session) return _rapierWaterProChoose('pigment',pigment); }});
}
async function _rapierWaterProVideo() {
	const state = _rapierDrawState, session = state.session;
	await _rapierWaterProAuthorize('video');
	if (!state.open || state.session !== session) return;
	_rapierWaterProOpenDialog({title:'Time-lapse',fields:[{type:'choice',label:'Frame',value:'square',options:[{value:'square',label:'Square',detail:'1:1'},{value:'portrait',label:'Portrait',detail:'9:16'}]},
		{type:'select',label:'Length',value:'15',options:[5,15,30,45].map(n => ({value:String(n),label:n + ' seconds'}))}],okLabel:'Make video',progress:'Making time-lapse',initialFocus:'submit',
		prepare:async ([framing,duration],work) => {
			await _rapierWaterProAuthorize('video');
			const current = () => { if (work.signal.aborted || !state.open || state.session !== session) throw new DOMException('Video cancelled','AbortError'); return true; };
			current();
			let pending = _rapierPaintPendingStroke(true);
			while (pending) { await pending; current(); pending = _rapierPaintPendingStroke(true,true); }
			const layer = _rapierPaintLayer();
			const ownsLayer = () => !work.signal.aborted && state.open && state.session === session && _rapierPaintLayer() === layer;
			if (layer?.mode === 'water') {
				await _rapierPaintCommit(true, null, false, ownsLayer); current();
				if (!ownsLayer()) throw new DOMException('The painting changed before video export','AbortError');
			}
			const shape = (layer?.mode === 'water' && layer.id != null ? _rapierDrawShapeById(layer.id) : null) || _rapierPaintTarget('water');
			if (!shape?.paint?.replay) throw new Error('Paint something with Water first.');
			const replay = structuredClone(shape.paint.replay), raster = shape.raster;
			if (layer?.mode === 'water') {
				await _rapierPaintCloseLayer(ownsLayer); await layer.decoding?.promise; await layer.surface.remote?.flush(); current();
			}
			const result = await globalThis.RapierDrawWaterVideo.exportWaterVideo({replay,raster,framing,duration:Number(duration),signal:work.signal,onProgress:event => work.progress(event.fraction)});
			current(); return result;
		},onOk:async (_,result) => {
			const notice = _rapierProgressOpen({label:'Preparing video to share',after:0});
			try { await globalThis.RapierPlatform.water.shareVideo(result.blob,'painting.mp4'); }
			finally { notice.end(); }
		}});
}
async function _rapierWaterProAction(act,button) {
	if (!['palettes','mix','video','paletteBack','paletteNew','paletteKeep','paletteEdit','paletteEntryEdit','palettePick','palettePigment'].includes(act)) return false;
	try {
		if (act === 'video') { await _rapierWaterProVideo(); return true; }
		if (act === 'mix') { await _rapierWaterProMix(); return true; }
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
		state.waterProChoice = (state.waterProChoice || 0) + 1; state.waterPalettePanel = false; state.waterPalettes = null;
		const settings = state.waterSettings, engine = _rapierWaterEngine();
		if (settings && engine) {
			if (engine.isWaterSpecialtyPigment(settings.pigment)) settings.pigment = RAPIER_WATER_DEFAULT_PIGMENT;
			if (engine.waterPaperById(settings.paper)?.pro) settings.paper = 'cold-press';
			const own = _rapierWaterOwn().find(row => row.id === settings.brush);
			if (own && !_rapierWaterProBrushAvailable(own)) { settings.tipKey = null; _rapierWaterSet('brush',RAPIER_WATER_DEFAULT_BRUSH); }
			else _rapierWaterSave();
		}
	}
	if (state.open) { _rapierWaterUpdate(); if (_rapierBgOpen()) _rapierBgSyncPanel(); }
}
globalThis.addEventListener?.('rapier:pro-changed', _rapierWaterProChanged);
