// SPDX-License-Identifier: AGPL-3.0-only
const {parseBrush, serializeBrush, paintBrushDip, paintBrushFeel, mixPaintHex, paintBrushRadiusOffset, paintBrushHead, paintSizeDefault} = globalThis.RapierDrawPaint;
const _rapierPaintPNG = globalThis.RapierDrawPaint.createPaintPNGCodec();
const {RAPIER_PAINT_BRUSHES, paintBrushById} = globalThis.RapierDrawBrushes;

const RAPIER_PAINT_SCALE = 2, RAPIER_PAINT_SCALE_MAX = 3, RAPIER_PAINT_AREA_MAX = 6000000;
const RAPIER_WATER_SHEET_PIXELS = 2048 * 1536;
const RAPIER_PAINT_GRAIN = 3;
const RAPIER_PAINT_SIM_START = 0.9, RAPIER_PAINT_SIM_SPEED = 900, RAPIER_PAINT_SIM_TAU = 46.73;
const RAPIER_PAINT_SIM_LIGHT_SPEED = 350;
// RAPIER_PAINT_TOUCH_VARIES across the session; the speed model stands in until then.
const RAPIER_PAINT_TOUCH_VARIES = 0.08;
const _rapierPaintTouchSeen = { min: Infinity, max: -Infinity };
const RAPIER_PAINT_PATCH_LIGHT = 9, RAPIER_PAINT_PATCH_FIRM = 26;
// (`rapier_touch` in its .myb, read by this file alone -- the engine is handed a pressure and never
const RAPIER_PAINT_TOUCH = [
	{floor: 0.12, span: 0.88, gamma: 0.55, speed: RAPIER_PAINT_SIM_SPEED},
	{floor: 0.04, span: 0.72, gamma: 1.90, speed: RAPIER_PAINT_SIM_LIGHT_SPEED},
	{floor: 0.02, span: 0.62, gamma: 2.60, speed: 250},
];
const _rapierPaintTouchAt = level => RAPIER_PAINT_TOUCH[_rapierDrawClamp(Math.round(level || 0), 0, RAPIER_PAINT_TOUCH.length - 1)];
function _rapierPaintFeel(q, level) {
	const t = _rapierPaintTouchAt(level);
	return t.floor + t.span * Math.pow(q, t.gamma);
}
function _rapierPaintTouchOf(id) {
	try { return _rapierDrawClamp(_rapierPaintDefFor(id).tool?.rapier_touch || 0, 0, 2); } catch (_) { return 0; }
}
// How many usual lifts this preset's tail is held back and tapered over (`rapier_lift` in its .myb; a flat's streaks fade over a longer one).
function _rapierPaintLiftOf(id) {
	try { return _rapierDrawClamp(_rapierPaintDefFor(id).tool?.rapier_lift || 1, 1, 4); } catch (_) { return 1; }
}
function _rapierPaintTouchLevel(id, light) {
	return _rapierDrawClamp((light ? 1 : 0) + _rapierPaintTouchOf(id), 0, RAPIER_PAINT_TOUCH.length - 1);
}
// readings), reaching the patch alone once it has moved RAPIER_PAINT_PATCH_TRUST px. A real finger
const RAPIER_PAINT_PATCH_TRUST = 12;
const RAPIER_PAINT_LAND = 1.2, RAPIER_PAINT_LIFT = 1.5, RAPIER_PAINT_LIFT_WET = 0.25, RAPIER_PAINT_TOUCH_FLOOR = 0.22;
const RAPIER_PAINT_LAND_MIN = 7, RAPIER_PAINT_LIFT_MIN = 10;
const RAPIER_PAINT_TAIL_MAX = 240;
const RAPIER_PAINT_SEAT = 0.12;
const _rapierPaintSmooth = k => k * k * (3 - 2 * k);
const _rapierPaintLastPress = { value: 0, from: '', patch: 0 };
const _rapierPaintPatchSeen = { min: RAPIER_PAINT_PATCH_LIGHT, max: RAPIER_PAINT_PATCH_FIRM, lo: Infinity, hi: -Infinity };
function _rapierPaintPatch(evt) {
	const w = Number.isFinite(evt.width) && evt.width > 1 ? evt.width : 0;
	const h = Number.isFinite(evt.height) && evt.height > 1 ? evt.height : 0;
	if (w && h) return Math.sqrt(w * h);
	return w || h || 0;
}
const RAPIER_PAINT_BRUSH_KEY = 'rapier:draw.paintbrush', RAPIER_PAINT_OWN_KEY = 'rapier:draw.paintbrushes' + RapierStorage.scope;
const RAPIER_PAINT_STRENGTH_KEY = 'rapier:draw.paintstrength';
const RAPIER_PAINT_PINNED = ['rapier/oil', 'rapier/acrylic', 'rapier/bristle', 'rapier/flat', 'rapier/scumble', 'rapier/pencil', 'rapier/pen', 'rapier/watercolour',
	'rapier/smudge', 'rapier/smear', 'rapier/blend', 'rapier/eraser', 'rapier/dissolve', 'rapier/erode'];
const RAPIER_PAINT_DEFAULT_ID = 'rapier/scumble';
const RAPIER_PAINT_SIZES_KEY = 'rapier:draw.paintsizes';
function _rapierPaintSizeDefault(id) { return paintSizeDefault(id); }
function _rapierPaintSizesRead() { try { const raw = JSON.parse(localStorage.getItem(RAPIER_PAINT_SIZES_KEY) || '{}'); return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}; } catch (_) { return {}; } }
function _rapierPaintSizeFor(id) { const own = _rapierPaintSizesRead()[id]; const n = Number(own); return Number.isFinite(n) ? _rapierDrawClamp(Math.round(n), 0, 100) : _rapierPaintSizeDefault(id); }
const RAPIER_PAINT_ERASER_ID = 'rapier/eraser', RAPIER_PAINT_ERASER_LOGR = 2.85;
function _rapierPaintToolPaints(tool = _rapierDrawTool()) { return tool === 'paint' || tool === 'water' || tool === 'erase'; }
function _rapierPaintDefaultId() { return RAPIER_PAINT_BRUSHES.some(entry => entry.id === RAPIER_PAINT_DEFAULT_ID) ? RAPIER_PAINT_DEFAULT_ID : RAPIER_PAINT_BRUSHES[0].id; }
const RAPIER_PAINT_OWN_FILE_MAX = 256 * 1024;
const RAPIER_PAINT_ICON_GAUGE_FIRM = RAPIER_DRAW_ICON_WRAP('<path d="M4 16a8 8 0 0 1 16 0"></path><line x1="12" y1="16" x2="16" y2="9"></line><circle cx="12" cy="16" r="1.3" fill="currentColor" stroke="none"></circle>');
const RAPIER_PAINT_ICON_GAUGE_LIGHT = RAPIER_DRAW_ICON_WRAP('<path d="M4 16a8 8 0 0 1 16 0"></path><line x1="12" y1="16" x2="8" y2="10"></line><circle cx="12" cy="16" r="1.3" fill="currentColor" stroke="none"></circle>');
// light touch, his Wet flat paints the selected colour). Seven Rapier presets carry `rapier_op` and
const RAPIER_PAINT_TOOL_IDS = new Set(['rapier/smudge', 'rapier/smear', 'rapier/blend', 'rapier/eraser',
	'rapier/dissolve', 'rapier/erode', 'rapier/posterize']);
function _rapierPaintIsTool(id) { return RAPIER_PAINT_TOOL_IDS.has(id); }
function _rapierPaintIsMaterialTool(id, settings = null) { return settings?.mode === 'water' ? settings.erasing || ['water','lift'].includes(settings.water?.tool) : _rapierDrawTool() === 'water' ? ['water','lift'].includes(_rapierWaterState().tool) : _rapierPaintIsTool(id) || id === RAPIER_PAINT_ERASER_ID; }
const RAPIER_PAINT_ICON_WATER = RAPIER_DRAW_ICON_WRAP('<path d="M12 3c4 5 6 7.6 6 10.2A6 6 0 0 1 6 13.2C6 10.6 8 8 12 3z"></path>');
const RAPIER_PAINT_ICON_SMUDGE = RAPIER_DRAW_ICON_WRAP('<path d="M4 15c3.5 0 4-6 7.5-6s4 6 8.5 6"></path><path d="M4 19c3.5 0 4-3 7.5-3s4 3 8.5 3"></path>');
const RAPIER_PAINT_ICON_SMEAR = RAPIER_DRAW_ICON_WRAP('<circle cx="7" cy="12" r="3.5" fill="currentColor" stroke="none"></circle><path d="M10.5 9.5h8"></path><path d="M10.5 12h10.5"></path><path d="M10.5 14.5h6"></path>');
const RAPIER_PAINT_ICON_POSTERIZE = RAPIER_DRAW_ICON_WRAP('<path d="M3 19h4.5v-4.5H12V10h4.5V5.5H21"></path>');
const RAPIER_PAINT_ICON_DISSOLVE = RAPIER_DRAW_ICON_WRAP('<path d="M9 3c3 3.6 4.5 5.6 4.5 7.5A4.5 4.5 0 0 1 4.5 10.5C4.5 8.6 6 6.6 9 3z"></path><circle cx="17" cy="9" r="1.1" fill="currentColor" stroke="none"></circle><circle cx="20" cy="13" r="0.9" fill="currentColor" stroke="none"></circle><circle cx="16" cy="15" r="1.3" fill="currentColor" stroke="none"></circle><circle cx="19.5" cy="18.5" r="0.8" fill="currentColor" stroke="none"></circle>');
const RAPIER_PAINT_ICON_RUBBER = RAPIER_DRAW_ICON_WRAP('<path d="M7.5 20.5 3.6 16.6a2 2 0 0 1 0-2.8L13.8 3.6a2 2 0 0 1 2.8 0l3.8 3.8a2 2 0 0 1 0 2.8L10.3 20.5z"></path><line x1="8" y1="9.5" x2="14.5" y2="16"></line><line x1="10.3" y1="20.5" x2="20.5" y2="20.5"></line>');
const RAPIER_PAINT_ICON_BLEND = RAPIER_DRAW_ICON_WRAP('<circle cx="9" cy="12" r="5.5"></circle><circle cx="15" cy="12" r="5.5"></circle>');
const RAPIER_PAINT_ICON_ERODE = RAPIER_DRAW_ICON_WRAP('<path d="M3 13c2.5-3.5 4.5-3.5 7 0s4.5 3.5 6.5 0"></path><circle cx="18.5" cy="8.5" r="1.1" fill="currentColor" stroke="none"></circle><circle cx="21" cy="12.5" r="0.9" fill="currentColor" stroke="none"></circle><circle cx="17.5" cy="16" r="1.2" fill="currentColor" stroke="none"></circle><circle cx="20.5" cy="18.5" r="0.8" fill="currentColor" stroke="none"></circle>');
const RAPIER_PAINT_TOOL_WORDS = Object.freeze({ 'rapier/smudge': 'Smudge', 'rapier/eraser': 'Eraser',
	'rapier/blend': 'Blend', 'rapier/dissolve': 'Dissolve', 'rapier/erode': 'Erode',
	'rapier/smear': 'Smear', 'rapier/posterize': 'Posterize' });
function _rapierPaintToolWord(id, name) { return RAPIER_PAINT_TOOL_WORDS[id] || name; }
const RAPIER_PAINT_BRUSH_WORDS = Object.freeze({ 'dieterle/fountain-sf-1': 'Fountain', 'dieterle/fount-offset-1': 'Offset pen', 'dieterle/pencil-left-handed': 'Left pencil',
	'dieterle/flight-feathers': 'Feathers', 'dieterle/tail-feathers': 'Tail feather', 'dieterle/tail-feathers2': 'Tail plume',
	'dieterle/wateryflatbrush': 'Watery flat', 'dieterle/dissolver': 'Dissolver', 'dieterle/flat2-1': 'Flat 2' });
function _rapierPaintBrushWord(id, name) { return RAPIER_PAINT_BRUSH_WORDS[id] || name; }
// the credits and licences are in Settings, Licenses. A person's own brush carries the words they wrote.
const RAPIER_PAINT_BRUSH_HINTS = Object.freeze({ 'dieterle/8b-pencil-1': 'soft, dark graphite', 'dieterle/flat2-1': 'broad flat edge', 'dieterle/halftonecmy-1': 'colored print dots',
	'dieterle/round-1': 'round, smearing brush', 'dieterle/arrow-1': 'arrow-tipped marks', 'dieterle/fan-1': 'a spread of bristles', 'dieterle/fountain-sf-1': 'ink that swells with pressure',
	'dieterle/fount-offset-1': 'ink with a slight wobble', 'dieterle/halftone-1': 'print dots', 'dieterle/pencil-left-handed': 'graphite angled for the left hand',
	'dieterle/blender': 'blends colors', 'dieterle/dissolver': 'dissolves paint away', 'dieterle/eraser': 'wears paint away', 'dieterle/splash': 'scattered splashes',
	'dieterle/flight-feathers': 'feathered streaks', 'dieterle/tail-feathers2': 'soft feathered streaks', 'dieterle/tail-feathers': 'feathered streaks',
	'dieterle/wateryflatbrush': 'wet, flowing color', 'rapier/oil': 'thick, smooth paint', 'rapier/bristle': 'streaks and gaps', 'rapier/scumble': 'broken, scattered paint',
	'rapier/pencil': 'soft graphite', 'rapier/pen': 'a bold line that swells',
	'rapier/smudge': 'drags paint with a finger', 'rapier/smear': 'drags paint in streaks', 'rapier/posterize': 'reduces color to bands',
	'rapier/blend': 'mixes paint in place', 'rapier/eraser': 'takes paint off', 'rapier/dissolve': 'breaks paint up', 'rapier/erode': 'wears paint from its edges' });
function _rapierPaintBrushLabel(entry) { const hint = entry.own ? entry.notes : RAPIER_PAINT_BRUSH_HINTS[entry.id]; return entry.name + (hint ? '. ' + hint : ''); }
const RAPIER_PAINT_TOOL_ICONS = Object.freeze({ 'rapier/smudge': RAPIER_PAINT_ICON_SMUDGE, 'rapier/eraser': RAPIER_PAINT_ICON_RUBBER,
	'rapier/blend': RAPIER_PAINT_ICON_BLEND, 'rapier/dissolve': RAPIER_PAINT_ICON_DISSOLVE, 'rapier/erode': RAPIER_PAINT_ICON_ERODE,
	'rapier/smear': RAPIER_PAINT_ICON_SMEAR, 'rapier/posterize': RAPIER_PAINT_ICON_POSTERIZE });
function _rapierPaintToolIcon(id) { return RAPIER_PAINT_TOOL_ICONS[id] || ''; }
const RAPIER_PAINT_SIZE_DEFAULT = 50;
const RAPIER_PAINT_PAPER = null;
const RAPIER_PAINT_WET = {dryingTime: 1600, cell: 3, maxBytes: 64000000, film: true, filmGain: 0.55,
	flow: 0.55, pin: 1.2, bleed: 0.6, grain: 1, granulation: 0.2, tooth: 0.85, edgeDarkening: 1};
const RAPIER_PAINT_DRY_FEED = 8, RAPIER_PAINT_DRY_SLICE = 8, RAPIER_PAINT_DRY_BUDGET = 8;
const RAPIER_PAINT_TILT = 0.42;
const RAPIER_PAINT_FIT_KEY = 'rapier.paint.fit.';
const _rapierPaintTilt = { gx: 0, gy: 0, on: null };
function _rapierPaintTiltRead(evt) {
	const beta = Number(evt.beta), gamma = Number(evt.gamma);
	if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return;
	const rad = Math.PI / 180;
	_rapierPaintTilt.gy = Math.sin(_rapierDrawClamp(beta, -90, 90) * rad) * RAPIER_PAINT_TILT;
	_rapierPaintTilt.gx = Math.sin(_rapierDrawClamp(gamma, -90, 90) * rad) * RAPIER_PAINT_TILT;
	const layer = _rapierPaintLayer();
	if (layer?.surface) layer.surface.tilt(_rapierPaintTilt.gx, _rapierPaintTilt.gy);
}
function _rapierPaintTiltOn() {
	if (_rapierPaintTilt.on || typeof window === 'undefined' || !window.addEventListener) return;
	_rapierPaintTilt.on = _rapierPaintTiltRead;
	try { window.addEventListener('deviceorientation', _rapierPaintTilt.on, { passive: true }); } catch (_) { _rapierPaintTilt.on = null; }
}
function _rapierPaintTiltOff() {
	if (!_rapierPaintTilt.on) return;
	try { window.removeEventListener('deviceorientation', _rapierPaintTilt.on); } catch (_) {}
	_rapierPaintTilt.on = null; _rapierPaintTilt.gx = 0; _rapierPaintTilt.gy = 0;
}
const RAPIER_PAINT_GLYPH_W = 96, RAPIER_PAINT_GLYPH_H = 60;
const RAPIER_PAINT_GLYPH_RADIUS = -1.1;
const RAPIER_PAINT_SETTING_AT = Object.fromEntries(globalThis.RapierDrawPaint.PAINT_SETTINGS.map((row, i) => [row[0], i]));

function _rapierPaintStoredBrushes() {
	const rows = JSON.parse(localStorage.getItem(RAPIER_PAINT_OWN_KEY) ?? '[]');
	if (!Array.isArray(rows)) throw new Error('Saved brushes are not a readable collection.');
	return rows;
}
function _rapierPaintOwnBrush(row) {
	if (!row || typeof row.id !== 'string' || !row.id.startsWith('own/') || typeof row.name !== 'string' || !row.myb) return null;
	try { parseBrush(row.myb); return { id: row.id, name: row.name.slice(0, 64), group: 'Own', notes: typeof row.notes === 'string' ? row.notes.slice(0, 160) : '', myb: row.myb, own: true }; } catch (_) { return null; }
}
function _rapierPaintOwnBrushes() {
	const state = _rapierDrawState;
	if (state.paintOwn) return state.paintOwn;
	let rows = [];
	try { rows = _rapierPaintStoredBrushes().map(_rapierPaintOwnBrush).filter(Boolean); } catch (_) {}
	state.paintOwn = rows;
	return rows;
}
function _rapierPaintStoreOwn(rows) {
	const before = _rapierPaintOwnBrushes();
	try {
		const edited = new Set([...before, ...rows].map(row => row.id));
		const kept = _rapierPaintStoredBrushes().filter(row => !edited.has(row?.id) || !_rapierPaintOwnBrush(row));
		localStorage.setItem(RAPIER_PAINT_OWN_KEY, JSON.stringify(kept.concat(rows.map(row => ({ id: row.id, name: row.name, notes: row.notes, myb: row.myb })))));
	}
	catch (_) { showToast('The brush changes could not be saved. Your saved brushes were kept.', 'error'); return false; }
	_rapierDrawState.paintOwn = null;
	void _rapierPersonal.brushes(rows, before).catch(error => showToast(String(error.message || error), 'error'));
	return true;
}
function _rapierPaintAdoptBrushes(keep, brushes) {
	let local; try { local = _rapierPaintStoredBrushes(); } catch (_) {}
	if (local) { localStorage.setItem(RAPIER_PAINT_OWN_KEY, JSON.stringify(local.filter(keep).concat(brushes))); _rapierDrawState.paintOwn = null; }
}
function _rapierPaintAdoptFits(value) {
	let fits; try { fits = JSON.parse(value); } catch (_) { return; }
	if (!fits || typeof fits !== 'object' || Array.isArray(fits)) return;
	for (const [id, on] of Object.entries(fits)) if (/^[A-Za-z0-9_./-]+$/.test(id) && typeof on === 'boolean') { if (on) localStorage.removeItem(RAPIER_PAINT_FIT_KEY + id); else localStorage.setItem(RAPIER_PAINT_FIT_KEY + id, 'off'); }
}
// Every brush the strip can show: Rapier's own finger set first (RAPIER_PAINT_PINNED), then the
function _rapierPaintEntries() {
	const all = RAPIER_PAINT_BRUSHES.concat(_rapierPaintOwnBrushes());
	const pinned = RAPIER_PAINT_PINNED.map(id => all.find(entry => entry.id === id)).filter(Boolean);
	const pinnedIds = new Set(pinned.map(entry => entry.id));
	return pinned.concat(all.filter(entry => !pinnedIds.has(entry.id)));
}
function _rapierPaintRememberedStrength() {
	try { return localStorage.getItem(RAPIER_PAINT_STRENGTH_KEY) === 'light' ? 'light' : 'firm'; } catch (_) { return 'firm'; }
}
function _rapierPaintSetStrength(value) {
	const v = value === 'light' ? 'light' : 'firm';
	_rapierDrawState.paintStrength = v;
	try { localStorage.setItem(RAPIER_PAINT_STRENGTH_KEY, v); } catch (_) {}
	_rapierPersonal.rememberDrawing('paintStrength', v);
	_rapierPaintDipSyncPanel();
	_rapierPaintUpdateStrip();
}
function _rapierPaintEntry(id) { return paintBrushById(id) || _rapierPaintOwnBrushes().find(row => row.id === id) || null; }
function _rapierPaintDigest(text) { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16).padStart(8, '0'); }
async function _rapierPaintUploadBrush(file) {
	const state = _rapierDrawState;
	if (!file) return;
	if (file.size > RAPIER_PAINT_OWN_FILE_MAX) { showToast('A brush file is 256 KiB or smaller', 'error'); return; }
	let def, json;
	try { json = JSON.parse(await file.text()); def = parseBrush(json); }
	catch (_) { showToast('That is not a MyPaint brush (.myb, version 3)', 'error'); return; }
	if (!state.open) return;
	// array: two valid brushes differing only in `rapier_bristle_load` 1 against 200 must not hash
	const id = 'own/' + _rapierPaintDigest(JSON.stringify([def.settings, def.wet || 0, def.wetInputs || 0, def.rapier || 0, ...(def.tool ? [def.tool] : [])]));
	const name = (typeof json.description === 'string' && json.description.trim()) || file.name.replace(/\.myb$/i, '').replace(/[_#]+/g, ' ').trim() || 'Brush';
	const notes = typeof json.notes === 'string' ? json.notes.split('\n')[0].trim() : '';
	const rows = _rapierPaintOwnBrushes().filter(row => row.id !== id);
	rows.push({ id, name: name.slice(0, 64), group: 'Own', notes, myb: serializeBrush(def, { description: name, notes: json.notes || '', parent_brush_name: json.parent_brush_name || '' }), own: true });
	if (!_rapierPaintStoreOwn(rows)) return;
	_rapierPaintSetBrush(id);
	showToast('Brush "' + name + '" added', 'info');
}
function _rapierPaintRemoveOwn(id) {
	const rows = _rapierPaintOwnBrushes().filter(row => row.id !== id);
	if (rows.length === _rapierPaintOwnBrushes().length) return;
	if (!_rapierPaintStoreOwn(rows)) return;
	if (_rapierDrawState.paintBrush === id) _rapierPaintSetBrush(_rapierPaintDefaultId()); else _rapierPaintUpdateStrip();
}
function _rapierPaintExportBrush(id) {
	const entry = _rapierPaintEntry(id);
	if (!entry) return;
	const file = (entry.name || 'brush').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().replace(/\s+/g, '_') + '.myb';
	void _download(new Blob([JSON.stringify(serializeBrush(paintBrushFeel(parseBrush(entry.myb), _rapierPaintFeelOptions(id, true)), {description: entry.myb.description, notes: entry.myb.notes, parent_brush_name: entry.myb.parent_brush_name}), null, 4) + '\n'], { type: 'application/json' }), file);
}
function _rapierPaintRememberedBrush() {
	try { const id = localStorage.getItem(RAPIER_PAINT_BRUSH_KEY); return _rapierPaintEntry(id) ? id : _rapierPaintDefaultId(); } catch (_) { return _rapierPaintDefaultId(); }
}
function _rapierPaintRememberedSize() {
	try { return _rapierPaintSizeFor(_rapierPaintRememberedBrush()); } catch (_) { return RAPIER_PAINT_SIZE_DEFAULT; }
}
function _rapierPaintBrushId() { const id = _rapierDrawState.paintBrush; return _rapierPaintEntry(id) ? id : _rapierPaintDefaultId(); }
function _rapierPaintSetBrush(id) {
	if (!_rapierPaintEntry(id)) return;
	_rapierDrawState.paintBrush = id;
	_rapierDrawState.paintSize = _rapierPaintSizeFor(id);
	try { localStorage.setItem(RAPIER_PAINT_BRUSH_KEY, id); } catch (_) {}
	_rapierPersonal.rememberDrawing('paintBrush', id);
	_rapierDrawState.paintPicked = id;
	_rapierPaintUpdateStrip();
}
function _rapierPaintSize() { const n = Number(_rapierDrawState.paintSize); return Number.isFinite(n) ? _rapierDrawClamp(Math.round(n), 0, 100) : RAPIER_PAINT_SIZE_DEFAULT; }
function _rapierPaintRadiusOffset(size = _rapierPaintSize()) { return paintBrushRadiusOffset(size); }
function _rapierPaintSetSize(value) {
	const n = _rapierDrawClamp(Math.round(Number(value)), 0, 100);
	if (!Number.isFinite(n)) return;
	_rapierDrawState.paintSize = n;
	try { const sizes = _rapierPaintSizesRead(); sizes[_rapierDrawState.paintBrush] = n; localStorage.setItem(RAPIER_PAINT_SIZES_KEY, JSON.stringify(sizes)); _rapierPersonal.rememberDrawing('paintSizes', JSON.stringify(sizes)); } catch (_) {}
}
function _rapierPaintSizeWord(size = _rapierPaintSize()) { return Math.round(Math.exp((size - 50) / 50 * Math.log(8)) * 100) + '%'; }

const RAPIER_PAINT_HEAD_KEY = 'rapier:draw.painthead', RAPIER_PAINT_HEAD_ANGLE = 45;
function _rapierPaintHeadRead() {
	let raw = null;
	try { raw = JSON.parse(localStorage.getItem(RAPIER_PAINT_HEAD_KEY) || 'null'); } catch (_) { raw = null; }
	const angle = Number(raw?.angle);
	return { angle: Number.isFinite(angle) ? ((Math.round(angle) % 180) + 180) % 180 : RAPIER_PAINT_HEAD_ANGLE, follow: raw?.follow === true || (raw?.follow !== false && !Number.isFinite(angle)), clear: raw?.clear === true };
}
function _rapierPaintHead() { if (_rapierDrawTool() === 'water') return _rapierWaterState(); return _rapierDrawState.paintHead || (_rapierDrawState.paintHead = _rapierPaintHeadRead()); }
function _rapierPaintHeadSave() {
	if (_rapierDrawTool() === 'water') { _rapierWaterSave(); return; }
	const head = _rapierPaintHead(), text = JSON.stringify({ angle: head.angle, follow: head.follow, clear: head.clear });
	try { localStorage.setItem(RAPIER_PAINT_HEAD_KEY, text); } catch (_) {}
	_rapierPersonal.rememberDrawing('paintHead', text);
}
function _rapierPaintHeadClear(on) {
	const head = _rapierPaintHead();
	if (head.clear === !!on) return false;
	head.clear = !!on; _rapierPaintHeadSave(); _rapierPaintHeadShowHover();
	return true;
}
function _rapierPaintHeadSettings(id) {
	const head = _rapierPaintHead();
	return paintBrushHead({angle: head.angle, follow: head.follow, erase: head.clear}, _rapierPaintIsTool(id));
}
function _rapierPaintHeadOval(head, rx, ry) {
	return '<ellipse rx="' + rx + '" ry="' + ry + '" transform="rotate(' + head.angle + ')"' + (head.follow ? ' stroke-dasharray="3 2"' : '') + '></ellipse>';
}
function _rapierPaintHeadChipHTML() {
	const head = _rapierPaintHead(), open = !_rapierPaintAnglePanel()?.hidden;
	return '<button type="button" class="rapier-draw-chip rapier-draw-chip--icon rapier-draw-chip--angle" data-draw-paint-head aria-haspopup="true" aria-expanded="' + open + '"' +
		' aria-label="Brush angle, ' + head.angle + ' degrees, ' + (head.follow ? 'follows the finger' : 'held') + '. Opens the angle dial" data-tip="angle">' +
		'<svg class="rapier-draw-angle" viewBox="-14 -14 28 28" aria-hidden="true">' + _rapierPaintHeadOval(head, 11.5, 3.2) + '</svg>' +
		'<span class="rapier-draw-chip-name">' + (head.follow ? 'follow' : head.angle + '\u00b0') + '</span></button>';
}
function _rapierPaintAnglePanel() { return _rapierDrawState.surface?.querySelector('.rapier-draw-anglepanel'); }
function _rapierPaintAngleSync() {
	const panel = _rapierPaintAnglePanel(), head = _rapierPaintHead();
	if (panel) {
		const dial = panel.querySelector('[data-draw-angle-dial]');
		const oval = dial.querySelector('.rapier-draw-angle-head');
		oval.setAttribute('transform', 'rotate(' + head.angle + ')');
		if (head.follow) oval.setAttribute('stroke-dasharray', '5 3'); else oval.removeAttribute('stroke-dasharray');
		dial.setAttribute('aria-valuenow', String(head.angle));
		dial.setAttribute('aria-valuetext', head.angle + ' degrees, ' + (head.follow ? 'follows the finger' : 'held'));
		panel.querySelector('.rapier-draw-angle-number').textContent = head.angle + '\u00b0';
		for (const button of panel.querySelectorAll('[data-draw-angle-mode]')) button.setAttribute('aria-pressed', String((button.dataset.drawAngleMode === 'follow') === head.follow));
		for (const button of panel.querySelectorAll('[data-draw-angle-set]')) button.setAttribute('aria-pressed', String(!head.follow && Number(button.dataset.drawAngleSet) === head.angle));
	}
	_rapierPaintHeadShowHover();
}
function _rapierPaintHeadTurn(angle) {
	const head = _rapierPaintHead();
	head.angle = ((Math.round(angle) % 180) + 180) % 180; head.follow = false;
}
function _rapierPaintAngleSnap(angle) {
	for (const tick of [0, 45, 90, 135, 180]) if (Math.abs(angle - tick) <= 3) return tick % 180;
	return angle;
}
function _rapierPaintAngleFromPoint(dial, clientX, clientY) {
	const r = dial.getBoundingClientRect(), x = clientX - (r.left + r.width / 2), y = clientY - (r.top + r.height / 2);
	if (Math.hypot(x, y) < 6) return;
	const deg = ((Math.atan2(y, x) * 180 / Math.PI) % 180 + 180) % 180;
	_rapierPaintHeadTurn(_rapierPaintAngleSnap(deg));
	_rapierPaintAngleSync();
}
function _rapierPaintAngleOpen(open) {
	const state = _rapierDrawState, panel = _rapierPaintAnglePanel();
	if (!panel) return;
	_rapierDrawCloseSettingPanels(open ? 'angle' : '');
	panel.hidden = !open;
	if (open) {
		_rapierPaintAngleSync();
		if (!panel.dataset.angleBound) {
			panel.dataset.angleBound = '1';
			const dial = panel.querySelector('[data-draw-angle-dial]');
			let held = null;
			dial.addEventListener('pointerdown', evt => {
				if (evt.pointerType === 'mouse' && evt.button !== 0) return;
				held = evt.pointerId;
				try { dial.setPointerCapture(evt.pointerId); } catch (_) {}
				dial.classList.add('rapier-draw-anglepanel-dial--held');
				evt.preventDefault(); evt.stopPropagation();
				_rapierPaintAngleFromPoint(dial, evt.clientX, evt.clientY);
			});
			dial.addEventListener('pointermove', evt => { if (held === evt.pointerId) _rapierPaintAngleFromPoint(dial, evt.clientX, evt.clientY); });
			const letGo = evt => {
				if (held !== evt.pointerId) return;
				held = null; dial.classList.remove('rapier-draw-anglepanel-dial--held');
				_rapierPaintHeadSave();
			};
			dial.addEventListener('pointerup', letGo);
			dial.addEventListener('pointercancel', letGo);
			dial.addEventListener('keydown', evt => {
				if (evt.defaultPrevented || evt.isComposing) return;
				const head = _rapierPaintHead(), step = evt.shiftKey ? 15 : 5;
				if (evt.key === 'ArrowRight' || evt.key === 'ArrowUp') _rapierPaintHeadTurn(head.angle + step);
				else if (evt.key === 'ArrowLeft' || evt.key === 'ArrowDown') _rapierPaintHeadTurn(head.angle - step);
				else if (evt.key === 'Enter' || evt.key === ' ') head.follow = !head.follow;
				else return;
				evt.preventDefault(); evt.stopPropagation();
				_rapierPaintHeadSave(); _rapierPaintAngleSync();
			});
			_rapierDrawBindTap(panel, evt => {
				const mode = evt.target.closest('[data-draw-angle-mode]')?.dataset.drawAngleMode, set = evt.target.closest('[data-draw-angle-set]')?.dataset.drawAngleSet;
				if (mode) _rapierPaintHead().follow = mode === 'follow';
				else if (set !== undefined) _rapierPaintHeadTurn(Number(set));
				else return;
				_rapierPaintHeadSave(); _rapierPaintAngleSync();
			});
		}
	}
	state.surface.querySelector('[data-draw-act="paintBrushes"]')?.setAttribute('aria-expanded', 'false');
	_rapierPaintUpdateStrip();
}
function _rapierPaintHeadPath(x, y, fp) {
	const a = fp.radius / RAPIER_PAINT_GRAIN, b = a / Math.max(1, fp.ratio), t = fp.angle * Math.PI / 180, f = n => Math.round(n * 100) / 100;
	const dx = Math.cos(t) * a, dy = Math.sin(t) * a;
	return 'M' + f(x + dx) + ' ' + f(y + dy) + 'A' + f(a) + ' ' + f(b) + ' ' + f(fp.angle) + ' 1 0 ' + f(x - dx) + ' ' + f(y - dy) + 'A' + f(a) + ' ' + f(b) + ' ' + f(fp.angle) + ' 1 0 ' + f(x + dx) + ' ' + f(y + dy) + 'Z';
}
function _rapierPaintHeadHide() { if (_rapierDrawState.headEl) _rapierDrawState.headEl.style.visibility = 'hidden'; _rapierDrawState.headAt = null; }
function _rapierPaintHeadAt(clientX, clientY) {
	const state = _rapierDrawState, el = state.headEl;
	if (!el || !state.svgRoot) return;
	state.headAt = [clientX, clientY];
	const fp = _rapierPaintHeadFootprint();
	if (!fp) { el.style.visibility = 'hidden'; return; }
	const geom = _rapierDrawPointerGeometry(), scale = _rapierDrawViewTransform(geom.rect, geom.vb).scale;
	const overlay = el.parentElement, half = fp.radius / RAPIER_PAINT_GRAIN + 4 / scale, size = 2 * half * scale;
	const path = _rapierPaintHeadPath(0, 0, fp);
	if (el.getAttribute('d') !== path) el.setAttribute('d', path);
	const box = [-half, -half, 2 * half, 2 * half].join(' ');
	if (overlay.getAttribute('viewBox') !== box) {
		overlay.setAttribute('viewBox', box); overlay.setAttribute('width', size); overlay.setAttribute('height', size);
	}
	overlay.style.transform = 'translate3d(' + (clientX - geom.rect.left - size / 2) + 'px,' + (clientY - geom.rect.top - size / 2) + 'px,0)';
	el.style.visibility = '';
}
function _rapierPaintHeadFootprint() {
	if (_rapierDrawTool() === 'water') return null;
	const state = _rapierDrawState, id = _rapierPaintBrushId(), head = _rapierPaintHead();
	const key = id + '|' + _rapierPaintDipKey(id) + '|' + _rapierPaintSize() + '|' + (head.follow ? 'follow' : head.angle);
	if (state.headBrush?.key === key) return state.headBrush.fp;
	if (state.headBrush?.asked === key) return null;
	const def = _rapierPaintDefFor(id), session = state.session;
	state.headBrush = { key: null, asked: key, fp: null };
	void _rapierPaintStartPainter('paint').then(remote => remote.footprint({ definition: def, radius: def.settings[3].base + _rapierPaintRadiusOffset(), held: head.follow ? null : head.angle })).then(fp => {
		if (state.session !== session || state.headBrush?.asked !== key) return;
		state.headBrush = { key, asked: null, fp };
		if (state.headAt && (state.gesture?.paint || (!state.gesture && _rapierDrawTool() === 'paint'))) _rapierPaintHeadAt(state.headAt[0], state.headAt[1]);
	}).catch(() => { if (state.headBrush?.asked === key) state.headBrush = null; });
	return null;
}
function _rapierPaintHeadHover(evt) {
	const state = _rapierDrawState;
	if (evt.pointerType !== 'mouse' || state.gesture || _rapierDrawTool() !== 'paint' || state.finishing) return;
	_rapierPaintHeadAt(evt.clientX, evt.clientY);
}
function _rapierPaintHeadShowHover() {
	const state = _rapierDrawState;
	if (state.headAt && !state.gesture && _rapierDrawTool() === 'paint') _rapierPaintHeadAt(state.headAt[0], state.headAt[1]);
}

function _rapierPaintColor() {
	const hex = _rapierDrawShapeInk({ ink: _rapierDrawState.ink });
	return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
}

// The glyph's own pressure sequence is the strip's real pressure law (the same RAPIER_PAINT_SIM_*
function _rapierPaintGlyphPressures(pts2d, level) {
	const speedConst = _rapierPaintTouchAt(level).speed, dtime = 0.04;
	const ease = -Math.expm1(-dtime * 1000 / RAPIER_PAINT_SIM_TAU);
	let q = RAPIER_PAINT_SIM_START, prevX = null, prevY = null;
	return pts2d.map(([x, y]) => {
		const dist = prevX === null ? 0 : Math.hypot(x - prevX, y - prevY);
		q += (Math.exp(-(dist / dtime) / speedConst) - q) * ease;
		prevX = x; prevY = y;
		return [x, y, _rapierPaintFeel(q, level), dtime];
	});
}
const _rapierPaintGlyphCache = new Map(), RAPIER_PAINT_GLYPH_CACHE_MAX = 256, _rapierPaintGlyphAsked = new Set();
const _rapierPaintPreviews = {queue: new Map(), active: null, client: null, timer: 0, release: 0};
const RAPIER_PAINT_PREVIEW_MAX = 64;
function _rapierPaintPreviewCurrent(job) {
	try { return _rapierDrawState.open && _rapierDrawState.session === job.session && _rapierDrawTool() === 'paint' && job.current(); }
	catch (_) { return false; }
}
function _rapierPaintPreview(slot, key, request, current) {
	const previews = _rapierPaintPreviews, session = _rapierDrawState.session;
	clearTimeout(previews.release); previews.release = 0;
	for (const job of [previews.queue.get(slot), previews.active]) if (job?.slot === slot && job.key === key && job.session === session) return job.promise;
	const previous = previews.queue.get(slot);
	if (previous) { previews.queue.delete(slot); previous.resolve(null); }
	while (previews.queue.size >= RAPIER_PAINT_PREVIEW_MAX) {
		const oldest = previews.queue.values().next().value;
		previews.queue.delete(oldest.slot); oldest.resolve(null);
	}
	const job = {slot, key, session, request, current, resolve: null, promise: null};
	job.promise = new Promise(resolve => { job.resolve = resolve; });
	previews.queue.set(slot, job);
	if (!previews.active && !previews.timer) previews.timer = setTimeout(_rapierPaintPreviewRun, 0);
	return job.promise;
}
async function _rapierPaintPreviewRun() {
	const previews = _rapierPaintPreviews, state = _rapierDrawState;
	previews.timer = 0;
	for (const job of previews.queue.values()) if (!_rapierPaintPreviewCurrent(job)) { previews.queue.delete(job.slot); job.resolve(null); }
	if (!previews.queue.size) {
		if (previews.client && !previews.release) previews.release = setTimeout(() => {
			const client = previews.client; previews.client = null; previews.release = 0;
			if (client) _rapierDrawPaintRelease(client);
		}, 2000);
		return;
	}
	const human = _rapierPaintRemoteNow('paint'), layer = state.paintLayer;
	if (!human?.idle || state.gesture || state.finishing || state.paintSetting || state.paintFlipping || layer?.pendingLift || layer?.pendingCommit) {
		previews.timer = setTimeout(_rapierPaintPreviewRun, 50); return;
	}
	const job = previews.queue.get('dip') || previews.queue.values().next().value;
	previews.queue.delete(job.slot); previews.active = job;
	let pixels = null;
	try {
		previews.client ||= await _rapierDrawPaintClient('preview', 'paint');
		if (previews.client && _rapierPaintPreviewCurrent(job)) pixels = await previews.client.request('preview', job.request());
	} catch (_) {
		const client = previews.client; previews.client = null;
		if (client) _rapierDrawPaintRelease(client);
	} finally {
		job.resolve(_rapierPaintPreviewCurrent(job) ? pixels : null); previews.active = null;
		previews.timer = setTimeout(_rapierPaintPreviewRun, 0);
	}
}
function _rapierPaintAfter(wait, next) { return wait ? wait.then(next) : next(); }
const _rapierPaintPainters = new Map();
function _rapierPaintMode(erasing = false) {
	const state = _rapierDrawState, tool = _rapierDrawTool();
	if (tool === 'water' && !erasing && !state.gesture?.eraseInk) return 'water';
	if (erasing || tool === 'erase' || state.gesture?.eraseInk || tool === 'paint' && _rapierPaintBrushId() === RAPIER_PAINT_ERASER_ID) {
		const target = state.recipe?.shapes.find(shape => shape.id === state.paintChosenId && _rapierPaintEligiblePaint(shape)) || state.recipe?.shapes.slice().reverse().find(_rapierPaintEligiblePaint);
		if (target?.paint?.mode === 'water') return 'water';
	}
	return 'paint';
}
function _rapierPaintRemoteNow(mode = _rapierPaintMode()) { const remote = _rapierPaintPainters.get(mode)?.remote; return remote && !remote.failure ? remote : null; }
function _rapierPaintLossSaid(error) {
	const state = _rapierDrawState, lost = state.waterLost;
	return !!lost && lost.session === state.session && (error === lost.error || error?.code === 'WATER_DEVICE_LOST');
}
function _rapierPaintStartPainter(mode = _rapierPaintMode()) {
	const lost = _rapierDrawState.waterLost;
	if (mode === 'water' && lost?.session === _rapierDrawState.session) return Promise.reject(lost.error);
	const existing = _rapierPaintPainters.get(mode);
	if (existing && !existing.remote?.failure) return existing.ready;
	const holder = {mode, remote: null, ready: null}; _rapierPaintPainters.set(mode, holder);
	holder.ready = (async () => {
		const client = await _rapierDrawPaintClient('human', mode);
		if (!client) throw new Error('The painter could not start');
		holder.remote = globalThis.RapierDrawPaintRemote.createPaintRemote(client, {frame: fn => requestAnimationFrame(fn), onFailure: error => _rapierPaintPainterLost(holder, error)});
		return holder.remote;
	})();
	holder.ready.catch(() => { if (_rapierPaintPainters.get(mode) === holder) _rapierPaintPainters.delete(mode); });
	return holder.ready;
}
function _rapierPaintPainterLost(holder, error) {
	const state = _rapierDrawState;
	if (_rapierPaintPainters.get(holder.mode) === holder) _rapierPaintPainters.delete(holder.mode);
	try { if (typeof _rapierDrawPaintRelease === 'function') _rapierDrawPaintRelease(holder.remote?.client); } catch (_) {}
	if (!state.open || state.paintLayer && state.paintLayer.mode !== holder.mode) return;
	const said = _rapierPaintLossSaid(error);
	if (holder.mode === 'water' && error?.code === 'WATER_DEVICE_LOST') state.waterLost = {session: state.session, error};
	if (!said) showToast('The painting could not be kept. It is still open: ' + String(error?.message || error), 'error');
	const gesture = state.gesture, saved = gesture?.paintRollback;
	if (gesture?.kind === 'paint') {
		if (gesture.paint) gesture.paint.discarded = true;
		if (gesture.waterStroke) _rapierPaintWaterFinish(gesture);
		if (saved) {
			delete gesture.paintRollback;
			state.recipe = _rapierDrawRestoreRecipe(saved.recipe); state.undoStack = saved.undo; state.redoStack = saved.redo; state.view = saved.view;
		}
		if (typeof _rapierDrawEndGesture === 'function') _rapierDrawEndGesture(); else { state.gesture = null; state.pointerId = null; }
	}
	for (const layer of _rapierPaintRevisionLayers()) {
		const queue = layer.revisions || [];
		for (const job of queue.splice(0)) {
			clearTimeout(job.timer);
			try { if (job.px && !job.empty && state.session === job.session) _rapierPaintPublishFrozen(layer, job, job.raster || _rapierPaintPNG.encode(job.px)); } catch (_) {}
			job.resolve();
		}
		layer.pendingCommit = null; layer.pendingLift?.resolve?.(); layer.pendingLift = null;
		for (const key of ['raf', 'holdRaf', 'dryRaf']) { if (layer[key]) cancelAnimationFrame(layer[key]); layer[key] = 0; }
		layer.dryFinishing = false; layer.dryBusy = false;
		for (const ok of layer.wetWaiters?.splice(0) || []) ok();
		if (layer.pngWorker) { try { layer.pngWorker.worker.terminate(); URL.revokeObjectURL(layer.pngWorker.url); } catch (_) {} layer.pngWorker = null; }
		layer.mount?.remove();
		if (layer.canvas && !layer.gpuDisplay) layer.canvas.width = layer.canvas.height = 0;
		layer.previousFlip = layer.nextFlip = null;
	}
	state.paintLayer = null; state.paintSetting = false; state.paintFlipping = false;
	if (state.paintBrushes) state.paintBrushes.clear();
	_rapierPaintSyncPaper();
	_rapierDrawRenderAll();
}
function _rapierPaintStrokeFailed(gesture, error) {
	if (gesture?.waterStroke) _rapierPaintWaterFinish(gesture);
	if (_rapierDrawWaterUnavailable(error)) { _rapierPaintReleaseStroke(gesture, true); if (_rapierDrawState.gesture === gesture) _rapierDrawEndGesture(); return; }
	if (error?.recoverable || /^(WATER_|paint_history_full)/.test(error?.code || '')) {
		_rapierPaintReleaseStroke(gesture, true); if (_rapierDrawState.gesture === gesture) _rapierDrawEndGesture();
		if (!_rapierPaintLossSaid(error)) showToast(String(error.message || error), 'error'); return;
	}
	const holder = _rapierPaintPainters.get(gesture?.paint?.settings?.mode || _rapierPaintMode());
	if (holder?.remote && !holder.remote.failure) holder.remote.close();
	else if (!holder) _rapierPaintPainterLost({remote: null}, error);
}
function _rapierPaintGlyphKey(id, color, light) { return id + '|' + color.join(',') + '|' + _rapierPaintTouchLevel(id, light) + '|' + _rapierPaintDipKey(id); }
function _rapierPaintGlyph(id, color, light) {
	const key = _rapierPaintGlyphKey(id, color, light), cached = _rapierPaintGlyphCache.get(key);
	if (cached) return cached;
	_rapierPaintGlyphAsk(key, id, color, light);
	return '';
}
function _rapierPaintGlyphAsk(key, id, color, light) {
	if (_rapierPaintGlyphAsked.has(key)) return;
	_rapierPaintGlyphAsked.add(key);
	void (async () => {
		let url = '';
		try {
			const pixels = await _rapierPaintPreview('glyph:' + id, key, () => {
				const level = _rapierPaintTouchLevel(id, light), def = _rapierPaintDefFor(id), W = RAPIER_PAINT_GLYPH_W, H = RAPIER_PAINT_GLYPH_H;
				const request = {width: W, height: H, wet: {...RAPIER_PAINT_WET, maxBytes: 4000000}, definition: def, settle: true, options: {color, seed: 7, radiusOffset: RAPIER_PAINT_GLYPH_RADIUS}};
				const at = RAPIER_PAINT_SETTING_AT, setting = name => def.settings[at[name]];
				if (setting('eraser').base > 0 || setting('posterize').base > 0 || setting('colorize').base > 0 || setting('smudge').base >= 0.9 || setting('lock_alpha').base > 0) {
					const band = new Uint8ClampedArray(W * H * 4);
					for (let y = Math.round(H * 0.28); y < Math.round(H * 0.72); y++) for (let x = 0; x < W; x++) { const q = (y * W + x) * 4, left = x < W / 2; band[q] = left ? 232 : 46; band[q + 1] = left ? 176 : 112; band[q + 2] = left ? 38 : 216; band[q + 3] = 255; }
					request.initial = {data: band, width: W, height: H};
				}
				const pts2d = []; for (let i = 0; i <= 32; i++) { const t = i / 32; pts2d.push([W * 0.12 + t * W * 0.76, H / 2 + Math.sin(t * Math.PI * 2) * H * 0.22]); }
				request.points = _rapierPaintGlyphPressures(pts2d, level);
				return request;
			}, () => _rapierDrawState.paintPicker === 'brushes' && !!_rapierPaintEntry(id) && _rapierPaintGlyphKey(id, _rapierPaintColor(), _rapierDrawState.paintStrength === 'light') === key);
			if (pixels) url = _rapierPaintPNG.encode(pixels);
		} catch (_) { url = ''; }
		_rapierPaintGlyphAsked.delete(key);
		if (!url) return;
		while (_rapierPaintGlyphCache.size >= RAPIER_PAINT_GLYPH_CACHE_MAX) _rapierPaintGlyphCache.delete(_rapierPaintGlyphCache.keys().next().value);
		_rapierPaintGlyphCache.set(key, url);
		_rapierPaintGlyphShow(key, url);
	})();
}
function _rapierPaintGlyphShow(key, url) {
	const row = _rapierPaintStrip();
	if (!row || row.hidden) return;
	const color = _rapierPaintColor(), light = _rapierDrawState.paintStrength === 'light';
	for (const chip of row.querySelectorAll('[data-draw-paint-kind="paint"]')) {
		if (_rapierPaintGlyphKey(chip.dataset.drawPaintBrush, color, light) !== key) continue;
		const art = chip.querySelector('.rapier-draw-glyph');
		if (!art || art.tagName === 'IMG') continue;
		const img = document.createElement('img');
		img.className = 'rapier-draw-glyph rapier-draw-glyph--paint'; img.alt = ''; img.src = url;
		art.replaceWith(img);
	}
}

// Both axes ride settings the engine already has. The load axis is `rapier_load`, the whole brush's
// `rapier_thinners`, which thins the film, floods the tooth's valleys flat and lets the mark blend
const RAPIER_PAINT_DIP_KEY = 'rapier.paint.dip';
const RAPIER_PAINT_DIP_FULL = 0.97;
const RAPIER_PAINT_DIP_W = 300, RAPIER_PAINT_DIP_H = 58, RAPIER_PAINT_DIP_RADIUS = -0.8;
const RAPIER_PAINT_DIP_FIELD_W = 48, RAPIER_PAINT_DIP_FIELD_H = 32;
function _rapierPaintDips() {
	const state = _rapierDrawState;
	if (state.paintDips) return state.paintDips;
	let map = {};
	try {
		const raw = JSON.parse(localStorage.getItem(RAPIER_PAINT_DIP_KEY) || '{}');
		if (raw && typeof raw === 'object') for (const [id, pair] of Object.entries(raw))
			if (Array.isArray(pair) && Number.isFinite(pair[0]) && Number.isFinite(pair[1]))
				map[id] = [_rapierDrawClamp(pair[0], 0, 1), _rapierDrawClamp(pair[1], 0, 1)];
	} catch (_) { map = {}; }
	state.paintDips = map;
	return map;
}
function _rapierPaintDip(id) { return _rapierPaintDips()[id] || [1, 0]; }
function _rapierPaintDipKey(id) { const [load, water] = _rapierPaintDip(id); return load.toFixed(2) + ',' + water.toFixed(2) + '|' + JSON.stringify(_rapierPaintFeelOptions(id)); }
function _rapierPaintDipped(id) { const [load, water] = _rapierPaintDip(id); return load < RAPIER_PAINT_DIP_FULL || water > 0.005; }
function _rapierPaintSetDip(id, load, water) {
	const map = _rapierPaintDips();
	const l = _rapierDrawClamp(load, 0, 1), w = _rapierDrawClamp(water, 0, 1);
	if (l >= RAPIER_PAINT_DIP_FULL && w <= 0.005) delete map[id]; else map[id] = [l, w];
	try { localStorage.setItem(RAPIER_PAINT_DIP_KEY, JSON.stringify(map)); } catch (_) {}
	_rapierPersonal.rememberDrawing('paintDips', JSON.stringify(map));
	const layer = _rapierPaintLayer(); if (layer) { layer.brush = null; layer.brushId = null; }
}
function _rapierPaintApplyDip(def, id) {
	return paintBrushDip(def, ..._rapierPaintDip(id));
}
function _rapierPaintDefFor(id) {
	const entry = _rapierPaintEntry(id), def = parseBrush(entry.myb);
	if (_rapierPaintFitsFinger(id)) _rapierPaintFitFinger(def, entry.finger);
	return paintBrushFeel(_rapierPaintApplyDip(def, id), _rapierPaintFeelOptions(id, true));
}
function _rapierPaintFeelOptions(id, overrides = false) {
	if (overrides) return {};
	const settings = _rapierPaintEntry(id).myb.settings;
	return {pigment: (settings.paint_mode?.base_value ?? 1) > 0,
		stabilisation: _rapierDrawClamp((settings.slow_tracking?.base_value || 0) / globalThis.RapierDrawPaint.PAINT_BRUSH_CONTROLS.stabilisation.trackingMax, 0, 1),
		response: settings.rapier_pressure?.base_value || 1};
}
function _rapierPaintMixMarkup(ink) {
	const state = _rapierDrawState, mix = state.paintMix || (state.paintMix = {a: ink, b: '#ffffff', amount: 50});
	return '<details class="rapier-paint-mixer"><summary>Mix colors</summary><div class="rapier-paint-mix-colours">' +
		'<label class="rapier-draw-colour-custom"><input type="color" data-paint-mix="a" value="' + mix.a + '" aria-label="First paint color"></label>' +
		'<label class="rapier-draw-colour-custom"><input type="color" data-paint-mix="b" value="' + mix.b + '" aria-label="Second paint color"></label>' +
		'<button type="button" class="rapier-draw-chip" data-paint-mix-use><span class="rapier-paint-mix-result"></span>Use mix</button></div>' +
		'<label class="rapier-paint-range">Mix<input type="range" min="0" max="100" step="1" value="' + mix.amount + '" data-paint-mix="amount" aria-label="Second paint proportion"><output>' + mix.amount + '%</output></label>' +
		'<div class="rapier-draw-dip-firmness"><span>Sample</span><div class="rapier-draw-dip-firmness-choices">' +
		[1, 5, 11].map(n => '<button type="button" class="rapier-draw-chip" data-paint-sample="' + n + '" aria-pressed="' + ((_rapierDrawState.paintSampleSize || 1) === n) + '">' + n + ' px</button>').join('') + '</div></div></details>';
}
function _rapierPaintMixSync() {
	const panel = _rapierDrawState.surface?.querySelector('.rapier-paint-mixer'); if (!panel) return;
	const mix = _rapierDrawState.paintMix, pigment = _rapierPaintFeelOptions(_rapierPaintBrushId()).pigment;
	const colour = mixPaintHex(mix.a, mix.b, mix.amount / 100, pigment);
	for (const input of panel.querySelectorAll('[type="color"]')) input.parentElement.style.setProperty('--paint-well', input.value);
	panel.querySelector('.rapier-paint-mix-result').style.backgroundColor = colour;
	panel.querySelector('[data-paint-mix-use]').dataset.colour = colour;
	const input = panel.querySelector('[type="range"]');
	input.closest('label').querySelector('output').textContent = mix.amount + '%';
	_rapierDrawSeekWrap(input); _rapierDrawSeekSync(input);
}
function _rapierPaintMixBind(surface) {
	const update = event => {
		const key = event.target.dataset.paintMix; if (!key) return;
		_rapierDrawState.paintMix[key] = key === 'amount' ? Number(event.target.value) : event.target.value;
		_rapierPaintMixSync();
	};
	surface.addEventListener('input', update);
	surface.addEventListener('change', event => { if (event.target.type === 'color') update(event); });
}
function _rapierPaintMixAction(event) {
	const button = event.target.closest('[data-paint-mix-use],[data-paint-sample]'); if (!button) return false;
	if (button.hasAttribute('data-paint-mix-use')) _rapierDrawChooseColour('next', button.dataset.colour);
	else {
		_rapierDrawState.paintSampleSize = Number(button.dataset.paintSample);
		for (const chip of _rapierDrawState.surface.querySelectorAll('[data-paint-sample]')) chip.setAttribute('aria-pressed', String(chip === button));
	}
	return true;
}
function _rapierPaintDipLoadWord(load) {
	return load >= RAPIER_PAINT_DIP_FULL ? 'full' : load >= 0.7 ? 'well loaded' : load >= 0.45 ? 'half a brushful' : load >= 0.2 ? 'running low' : 'nearly dry';
}
function _rapierPaintDipWaterWord(water) {
	return water <= 0.005 ? 'neat' : water <= 0.25 ? 'a touch of water' : water <= 0.55 ? 'thinned' : water <= 0.8 ? 'watery' : 'almost all water';
}
function _rapierPaintDipWord(id) { const [load, water] = _rapierPaintDip(id); return _rapierPaintDipLoadWord(load) + ' · ' + _rapierPaintDipWaterWord(water); }
function _rapierPaintDipStrength(load, water) { return load * (1 - 0.82 * water); }
function _rapierPaintDipButtonArt(id, color) {
	const [load, water] = _rapierPaintDip(id), a = _rapierPaintDipStrength(load, water);
	const paper = _rapierPaintDipPaper(), ink = 'rgb(' + [0, 1, 2].map(k => Math.round(color[k] * 255 * a + paper[k] * (1 - a))).join(',') + ')';
	const h = Math.max(1.5, load * 13);
	const jar = 'M6 5h12v12.5a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 6 17.5z';
	return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
		'<path d="' + jar + '" fill="rgb(' + paper.join(',') + ')" stroke="none"></path>' +
		'<rect x="6" y="' + (20 - h).toFixed(1) + '" width="12" height="' + h.toFixed(1) + '" fill="' + ink + '" stroke="none"></rect>' +
		'<path d="' + jar + '"></path><path d="M4 5h16"></path></svg>';
}
function _rapierPaintDipSyncButton() {
	const btn = _rapierDrawState.surface?.querySelector('.rapier-draw-settings [data-draw-act="dip"]');
	if (!btn) return;
	const id = _rapierPaintBrushId();
	btn.innerHTML = _rapierPaintDipButtonArt(id, _rapierPaintColor()) + '<span class="rapier-draw-btn-name">paint</span>';
	btn.setAttribute('aria-label', 'Paint load, water and firmness: ' + _rapierPaintDipWord(id));
	btn.setAttribute('aria-expanded', String(!_rapierPaintDipPanel()?.hidden));
}
function _rapierPaintDipPanel() { return _rapierDrawState.surface?.querySelector('.rapier-draw-dip'); }
const _rapierPaintDipCache = new Map(), RAPIER_PAINT_DIP_CACHE_MAX = 24;
function _rapierPaintDipSample(id, color, light) {
	const level = _rapierPaintTouchLevel(id, light);
	const key = id + '|' + color.join(',') + '|' + level + '|' + _rapierPaintDipKey(id);
	const cached = _rapierPaintDipCache.get(key);
	if (cached) return Promise.resolve(cached);
	return (async () => {
		let url = '';
		try {
			const pixels = await _rapierPaintPreview('dip', key, () => {
				const W = RAPIER_PAINT_DIP_W, H = RAPIER_PAINT_DIP_H;
				const pts2d = []; for (let i = 0; i <= 96; i++) { const t = i / 96; pts2d.push([W * 0.05 + t * W * 0.90, H / 2 + Math.sin(t * Math.PI * 1.1) * H * 0.17 - t * H * 0.06]); }
				return {width: W, height: H, wet: {...RAPIER_PAINT_WET, maxBytes: 8000000}, definition: _rapierPaintDefFor(id), settle: true,
					points: _rapierPaintGlyphPressures(pts2d, level), options: {color, seed: 7, radiusOffset: RAPIER_PAINT_DIP_RADIUS}};
			}, () => { const panel = _rapierPaintDipPanel(); return panel && !panel.hidden && _rapierPaintBrushId() === id && _rapierPaintGlyphKey(id, _rapierPaintColor(), _rapierDrawState.paintStrength === 'light') === key; });
			if (pixels) url = _rapierPaintPNG.encode(pixels);
		} catch (_) { url = ''; }
		if (!url) return '';
		while (_rapierPaintDipCache.size >= RAPIER_PAINT_DIP_CACHE_MAX) _rapierPaintDipCache.delete(_rapierPaintDipCache.keys().next().value);
		_rapierPaintDipCache.set(key, url);
		return url;
	})();
}
function _rapierPaintDipField(canvas, color) {
	const W = RAPIER_PAINT_DIP_FIELD_W, H = RAPIER_PAINT_DIP_FIELD_H;
	canvas.width = W; canvas.height = H;
	const ctx = canvas.getContext('2d'), img = ctx.createImageData(W, H), px = img.data;
	const paper = _rapierPaintDipPaper();
	for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
		const a = _rapierPaintDipStrength((H - 1 - y) / (H - 1), x / (W - 1)), q = (y * W + x) * 4;
		for (let k = 0; k < 3; k++) px[q + k] = Math.round((color[k] * 255) * a + paper[k] * (1 - a));
		px[q + 3] = 255;
	}
	ctx.putImageData(img, 0, 0);
}
function _rapierPaintDipPaper() {
	for (const sel of ['.rapier-draw-canvas', '.rapier-draw-stage']) {
		try {
			const el = _rapierDrawState.surface?.querySelector(sel);
			if (!el) continue;
			const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g);
			if (m && m.length >= 3 && (m.length < 4 || Number(m[3]) > 0.5)) return [Number(m[0]), Number(m[1]), Number(m[2])];
		} catch (_) {}
	}
	return [255, 255, 255];
}
function _rapierPaintSyncSet() {
	const set = _rapierDrawState.surface?.querySelector('[data-draw-act="paintSet"]'), word = set?.querySelector('.rapier-draw-btn-name');
	const layer = _rapierPaintLayer();
	if (set) {
		const disabled = !!_rapierDrawState.paintSetting || !layer || !!layer.warmView;
		if (disabled && document.activeElement === set) _rapierDrawState.svgRoot.focus({preventScroll: true});
		set.disabled = disabled;
		set.setAttribute('aria-busy', String(!!_rapierDrawState.paintSetting));
	}
	const label = _rapierDrawState.paintSetting ? 'setting' : 'set';
	if (word && word.textContent !== label) word.textContent = label;
}
function _rapierPaintDipSyncPanel(repaintSample = true) {
	const panel = _rapierPaintDipPanel();
	if (!panel || panel.hidden) { _rapierPaintSyncSet(); return; }
	const id = _rapierPaintBrushId(), color = _rapierPaintColor(), [load, water] = _rapierPaintDip(id);
	const paper = _rapierPaintDipPaper();
	_rapierPaintSyncSet();
	const pad = panel.querySelector('.rapier-draw-dip-pad'), knob = panel.querySelector('.rapier-draw-dip-knob'), track = panel.querySelector('.rapier-draw-dip-track');
	const ink = color.join(',');
	if (panel.dataset.dipInk !== ink) { panel.dataset.dipInk = ink; _rapierPaintDipField(panel.querySelector('.rapier-draw-dip-field'), color); }
	track.style.transform = 'translate(calc((100% - 26px) * ' + water.toFixed(4) + '), calc((100% - 26px) * ' + (1 - load).toFixed(4) + '))';
	const a = _rapierPaintDipStrength(load, water);
	knob.style.setProperty('--rapier-dip-ink', 'rgb(' + [0, 1, 2].map(k => Math.round(color[k] * 255 * a + paper[k] * (1 - a))).join(',') + ')');
	const word = _rapierPaintDipWord(id);
	const label = panel.querySelector('.rapier-draw-dip-word');
	if (label.textContent !== word) label.textContent = word;
	pad.setAttribute('aria-label', 'Dip the brush. Left and right for water, up and down for paint. Now: ' + word);
	panel.querySelector('[data-draw-paint-act="redip"]').hidden = !_rapierPaintDipped(id);
	const light = _rapierDrawState.paintStrength === 'light';
	for (const button of panel.querySelectorAll('[data-draw-paint-strength]')) button.setAttribute('aria-pressed', String((button.dataset.drawPaintStrength === 'light') === light));
	if (repaintSample) _rapierPaintDipSampleSoon();
}
const RAPIER_PAINT_DIP_SETTLE = 140;
function _rapierPaintDipSampleSoon() {
	const state = _rapierDrawState;
	clearTimeout(state.paintDipTimer);
	state.paintDipTimer = setTimeout(async () => {
		state.paintDipTimer = 0;
		const panel = _rapierPaintDipPanel();
		if (!panel || panel.hidden) return;
		const id = _rapierPaintBrushId(), key = _rapierPaintGlyphKey(id, _rapierPaintColor(), state.paintStrength === 'light'), session = state.session;
		const img = panel.querySelector('.rapier-draw-dip-sample'), url = await _rapierPaintDipSample(id, _rapierPaintColor(), state.paintStrength === 'light');
		if (state.paintDipTimer || state.session !== session || _rapierPaintBrushId() !== id || _rapierPaintGlyphKey(id, _rapierPaintColor(), state.paintStrength === 'light') !== key || _rapierPaintDipPanel() !== panel || panel.hidden) return;
		if (url && img.getAttribute('src') !== url) { img.src = url; img.decode().then(() => _rapierDrawPlay(img, 'breathe'), () => {}); }
	}, RAPIER_PAINT_DIP_SETTLE);
}
function _rapierPaintDipFromPoint(pad, clientX, clientY) {
	const rect = pad.getBoundingClientRect();
	if (!rect.width || !rect.height) return;
	const water = _rapierDrawClamp((clientX - rect.left) / rect.width, 0, 1);
	const load = _rapierDrawClamp(1 - (clientY - rect.top) / rect.height, 0, 1);
	_rapierPaintSetDip(_rapierPaintBrushId(), load > 0.88 ? 1 : load, water < 0.03 ? 0 : water);
	_rapierPaintDipSyncPanel();
}
function _rapierPaintDipOpen(open) {
	const panel = _rapierPaintDipPanel();
	if (!panel) return;
	panel.hidden = !open;
	if (!open) { _rapierPaintUpdateStrip(); return; }
	for (const which of ['nib', 'smooth']) {
		const row = _rapierDrawSettingRow(which);
		if (row) row.hidden = true;
		_rapierDrawState.surface.querySelector('[data-draw-act="' + which + '"]')?.setAttribute('aria-expanded', 'false');
	}
	panel.querySelector('.rapier-draw-dip-sample').style.background = 'rgb(' + _rapierPaintDipPaper().join(',') + ')';
	_rapierPaintDipSyncPanel();
	_rapierPaintUpdateStrip();
	if (!panel.dataset.dipBound) {
		panel.dataset.dipBound = '1';
		const pad = panel.querySelector('.rapier-draw-dip-pad');
		const letGo = () => { pad.classList.remove('rapier-draw-dip-pad--held', 'rapier-draw-dip-pad--moving'); _rapierPaintUpdateStrip(); };
		pad.addEventListener('pointerdown', evt => { evt.preventDefault(); pad.setPointerCapture(evt.pointerId); pad.classList.add('rapier-draw-dip-pad--held'); _rapierPaintDipFromPoint(pad, evt.clientX, evt.clientY); });
		pad.addEventListener('pointermove', evt => { if (pad.hasPointerCapture(evt.pointerId)) { pad.classList.add('rapier-draw-dip-pad--moving'); _rapierPaintDipFromPoint(pad, evt.clientX, evt.clientY); } });
		pad.addEventListener('pointerup', letGo);
		pad.addEventListener('pointercancel', letGo);
		panel.querySelector('[data-draw-paint-act="redip"]').addEventListener('click', () => {
			_rapierPaintSetDip(_rapierPaintBrushId(), 1, 0);
			_rapierPaintDipSyncPanel(); _rapierPaintUpdateStrip();
		});
		for (const button of panel.querySelectorAll('[data-draw-paint-strength]')) button.addEventListener('click', () => _rapierPaintSetStrength(button.dataset.drawPaintStrength));
		pad.addEventListener('keydown', evt => {
			if (evt.defaultPrevented || evt.isComposing || evt.keyCode === 229) return;
			const step = 0.06, id = _rapierPaintBrushId(), [load, water] = _rapierPaintDip(id);
			const move = { ArrowLeft: [0, -step], ArrowRight: [0, step], ArrowUp: [step, 0], ArrowDown: [-step, 0] }[evt.key];
			if (!move) return;
			evt.preventDefault();
			_rapierPaintSetDip(id, load + move[0], water + move[1]);
			_rapierPaintDipSyncPanel(); _rapierPaintUpdateStrip();
		});
	}
}

function _rapierPaintStrip() { return _rapierDrawState.surface?.querySelector('.rapier-draw-brushes'); }
function _rapierPaintFacts() {
	const state = _rapierDrawState, layer = state.paintLayer;
	return { layerId: layer ? layer.id : null, live: !!layer, valid: _rapierPaintLayerValid(), loading: state.paintRehydrate || null, failed: state.paintRehydrateFailed || null, setting: !!state.paintSetting, erasing: !!state.paintEraseFan, encoding: !!state.paintEncodes?.size, pendingOverflow: !!layer?.pendingOverflow,
		committing: !!state.paintDeparture || _rapierPaintRevisionLayers(layer).some(sheet => !!(sheet.pendingLift || sheet.pendingCommit)), flips: state.paintFlips || 0, timing: state.paintTiming ? { ...state.paintTiming } : null, surface: layer?.surface ? layer.surface.width + 'x' + layer.surface.height : null, brush: layer?.brushId || null, brushChosen: state.paintBrush || null, size: _rapierPaintSize(), strength: state.paintStrength || null, dirty: !!layer?.surface && !layer.surface.settled, scale: layer?.scale || null, showing: !!layer && layer.canvas.style.visibility !== 'hidden',
		ops: layer?.surface?.opStats ? { ...layer.surface.opStats } : null,
		origin: layer?.origin ? layer.origin.join(',') : null,
		overlays: document.querySelectorAll('canvas.rapier-draw-paint-live').length,
		wet: !!layer?.surface?.wetState, drying: !!layer?.dryRaf, owed: layer?.surface?.wetPending || 0, stillWet: !!layer?.surface?.wet,
		press: _rapierPaintLastPress.value, pressFrom: _rapierPaintLastPress.from, patch: _rapierPaintLastPress.patch,
		dip: _rapierPaintDip(_rapierPaintBrushId()), dipOpen: !_rapierPaintDipPanel()?.hidden,
		// `rapier_load` and `loadFuel`). `paint-dip` could only ever read the mark's alpha and infer
		load: layer?.brush ? {whole: layer.brush.rapier?.rapier_load ?? 0, fuel: layer.brush.loadFuel ?? null} : null };
}
const _rapierPaintShownAs = new Map(), _rapierPaintEncodeLinks = new WeakMap();
function _rapierPaintJxlShowable() {
	const test = typeof window !== 'undefined' ? window.__rapierPaintShowJxlTest : undefined;
	if (typeof test === 'boolean') return Promise.resolve(test);
	try {
		const known = globalThis.RapierEmbeddedImages?.whenJxlDisplayKnown;
		if (typeof known === 'function') return Promise.resolve(known()).then(shown => shown !== false, () => true);
		return Promise.resolve(globalThis.RapierEmbeddedImages?.jxlDisplayable?.() !== false);
	} catch (_) { return Promise.resolve(true); }
}
async function _rapierPaintShownFor(source, box) { return (await _rapierPaintJxlShowable()) ? null : _rapierPaintPNG.compressed(await source.readRGBA8(box)); }
function _rapierPaintKeepShown(pieces) { for (const piece of pieces || []) if (piece?.shown && piece.url) _rapierPaintShownAs.set(piece.url, piece.shown); }
const _rapierPaintBlobs = new Map(), RAPIER_PAINT_BLOBS_KEPT = 6;
function _rapierPaintBlobURL(raster) {
	if (typeof raster !== 'string' || typeof URL?.createObjectURL !== 'function') return raster;
	const known = _rapierPaintBlobs.get(raster);
	if (known) return known;
	const match = /^data:(image\/(?:png|jxl));base64,/.exec(raster);
	if (!match) return raster;
	let url;
	try {
		const encoded = raster.slice(match[0].length);
		const bytes = typeof Uint8Array.fromBase64 === 'function' ? Uint8Array.fromBase64(encoded) : RapierBundleIO.fromBase64(encoded);
		url = URL.createObjectURL(new Blob([bytes], {type: match[1]}));
	} catch (_) { return raster; }
	_rapierPaintBlobs.set(raster, url);
	if (_rapierPaintBlobs.size > RAPIER_PAINT_BLOBS_KEPT) {
		const svg = _rapierDrawState.svg;
		for (const [key, old] of _rapierPaintBlobs) {
			if (_rapierPaintBlobs.size <= RAPIER_PAINT_BLOBS_KEPT) break;
			if (key === raster || svg?.querySelector('image[href="' + old + '"]')) continue;
			_rapierPaintBlobs.delete(key); URL.revokeObjectURL(old);
		}
	}
	return url;
}
function _rapierPaintForgetBlobs() { for (const url of _rapierPaintBlobs.values()) URL.revokeObjectURL(url); _rapierPaintBlobs.clear(); }
function _rapierPaintShowable(html) {
	if (!html || !_rapierPaintShownAs.size || !html.includes('data:image/')) return html;
	return html.replace(/(href=")(data:image\/(?:jxl|png);base64,[A-Za-z0-9+/=]+)"/g, (whole, lead, url) => { const shown = _rapierPaintShownAs.get(url); return shown ? lead + shown + '"' : whole; });
}
function _rapierPaintBlobSources(html) {
	if (!html || !_rapierPaintBlobs.size || !html.includes('href="blob:')) return html;
	const sources = new Map([..._rapierPaintBlobs].map(([raster, url]) => [url, raster]));
	return html.replace(/(href=")(blob:[^"]+)"/g, (whole, lead, url) => sources.has(url) ? lead + sources.get(url) + '"' : whole);
}
async function _rapierPaintEncodeJXL(source, box, options = {lossless: true}, work = null) {
	if (options.lossless === true) options = {...options, losslessProfile: 'painting'};
	if (Array.isArray(globalThis.__rapierPaintEncodeLog)) globalThis.__rapierPaintEncodeLog.push({...options});
	if (globalThis.__rapierPaintEncodeHold) await globalThis.__rapierPaintEncodeHold;
	const px = await source.readRGBA8(box);
	const data = px.shared ? new Uint8Array(px.data) : new Uint8Array(px.data.buffer, px.data.byteOffset, px.data.byteLength);
	const out = await globalThis.RapierEmbeddedImages.codec('encode', {width: px.width, height: px.height, data, options}, work || undefined);
	return {url: 'data:image/jxl;base64,' + RapierBundleIO.toBase64(out.bytes || out), options};
}
// (RAPIER_DRAW_RASTER_MAX, the reader's own admission cap) is kept as SEVERAL lossless pictures:
function _rapierPaintRasterBudget() {
	const test = typeof window !== 'undefined' ? window.__rapierPaintRasterMaxTest : undefined;
	return Number.isFinite(test) ? test : globalThis.RapierDrawCore.RAPIER_DRAW_RASTER_MAX;
}
async function _rapierPaintLosslessPieces(encodeBox, box, budget, depth = 0, single = false) {
	if (single) {
		const kept = await encodeBox(box);
		if (kept && kept.url.length <= budget) return [{box,url:kept.url,shown:kept.shown || null}];
		throw Object.assign(new Error('This Water picture is too large to set. The painting remains open.'), {code:'WATER_BUDGET',recoverable:true});
	}
	let kept = null;
	try { kept = await encodeBox(box); }
	catch (error) { if (error?.code !== 'JXL_SIZE') throw error; }
	if (kept && kept.url.length <= budget) return [{ box, url: kept.url, shown: kept.shown || null }];
	const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1;
	if (depth >= 6 || (w < 2 && h < 2)) return null;
	const halves = w >= h
		? [{ ...box, x1: box.x0 + Math.floor(w / 2) - 1 }, { ...box, x0: box.x0 + Math.floor(w / 2) }]
		: [{ ...box, y1: box.y0 + Math.floor(h / 2) - 1 }, { ...box, y0: box.y0 + Math.floor(h / 2) }];
	const out = [];
	for (const half of halves) {
		const pieces = await _rapierPaintLosslessPieces(encodeBox, half, budget, depth + 1);
		if (!pieces) return null;
		out.push(...pieces);
	}
	return out;
}
async function _rapierPaintRasterCanvas(dataUrl) {
	const match = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(String(dataUrl || ''));
	if (!match) throw new Error('not a picture data URL');
	const raw = match[2] ? atob(match[3]) : decodeURIComponent(match[3]);
	const bytes = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
	const bitmap = await createImageBitmap(new Blob([bytes], {type: match[1]}));
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width; canvas.height = bitmap.height;
	canvas.getContext('2d').drawImage(bitmap, 0, 0);
	bitmap.close?.();
	return canvas;
}
async function _rapierPaintEncodeCanvasBox(canvas, box, options = {lossless: true}, work = null) {
	if (options.lossless === true) options = {...options, losslessProfile: 'painting'};
	const b = box || { x0: 0, y0: 0, x1: canvas.width - 1, y1: canvas.height - 1 };
	if (Array.isArray(globalThis.__rapierPaintEncodeLog)) globalThis.__rapierPaintEncodeLog.push({...options});
	const px = canvas.getContext('2d').getImageData(b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
	const data = new Uint8Array(px.data.buffer, px.data.byteOffset, px.data.byteLength);
	const out = await globalThis.RapierEmbeddedImages.codec('encode', {width: px.width, height: px.height, data, options}, work || undefined);
	return {url: 'data:image/jxl;base64,' + RapierBundleIO.toBase64(out.bytes || out), options};
}
function _rapierPaintSplitShapeSync(shapes, shape, pieces) {
	if (shape.paint?.mode === 'water' && pieces.length > 1) throw Object.assign(new Error('This Water layer must stay one picture. The painting remains open.'), {code:'WATER_BUDGET',recoverable:true});
	const state = _rapierDrawState, geom = shape.geom || {}, [pw, ph] = shape.paint?.px || [0, 0];
	if (!(pw > 0 && ph > 0)) return null;
	const sourcePaint = shape.paint || {};
	const frame = geom.p || (geom.rot ? _rapierDrawRectPolygon(geom.cx, geom.cy, geom.w, geom.h, geom.rot) : null);
	const used = new Set(shapes.flatMap(row => [row.id, row.group, row.paint?.group]));
	let seq = 0;
	const nextId = () => {
		let id;
		do { id = shapes === state.recipe?.shapes ? _rapierDrawNextId() : 's' + (++seq); } while (used.has(id));
		used.add(id); return id;
	};
	const at = (u, v) => frame
		? [frame[0][0] + (frame[1][0] - frame[0][0]) * u / pw + (frame[3][0] - frame[0][0]) * v / ph, frame[0][1] + (frame[1][1] - frame[0][1]) * u / pw + (frame[3][1] - frame[0][1]) * v / ph]
		: [geom.cx - geom.w / 2 + geom.w * u / pw, geom.cy - geom.h / 2 + geom.h * v / ph];
	const made = pieces.map((piece, index) => {
		const b = piece.box, c0 = at(b.x0, b.y0), c1 = at(b.x1 + 1, b.y0), c3 = at(b.x0, b.y1 + 1);
		const replay = sourcePaint.replay ? globalThis.RapierDrawAgentPaint.cropPaintReplay(sourcePaint.replay, [b.x0, b.y0, b.x1, b.y1]) : null;
		if (sourcePaint.replay && !replay) throw new Error('The painting changed before its lossless pieces were kept');
		const g = frame ? { p: [c0, c1, [c1[0] + c3[0] - c0[0], c1[1] + c3[1] - c0[1]], c3] }
			: { cx: (c0[0] + c1[0]) / 2, cy: (c0[1] + c3[1]) / 2, w: c1[0] - c0[0], h: c3[1] - c0[1] };
		const next = index === 0 ? shape : { ...shape, id: nextId() };
		next.geom = g; next.raster = piece.url; next.paint = { ...sourcePaint, strokes: undefined, seed: undefined, px: [b.x1 - b.x0 + 1, b.y1 - b.y0 + 1], group: shape.id, ...(replay ? {replay} : {}) };
		return next;
	});
	const i = shapes.indexOf(shape);
	if (i >= 0) shapes.splice(i + 1, 0, ...made.slice(1));
	else console.warn('[rapier] paint pieces: the shape being cut is not in the recipe handed in');
	return made;
}
async function _rapierPaintSplitShape(shapes, shape, pieces) { return _rapierPaintSplitShapeSync(shapes, shape, pieces); }
function _rapierPaintRememberFast(sources, pieces, raster, origin = {x: 0, y: 0}) {
	if (!sources || !raster?.startsWith('data:image/png;base64,')) return;
	for (const piece of pieces || []) sources.set(piece.url, {source: raster, box: {
		x0: piece.box.x0 - origin.x, y0: piece.box.y0 - origin.y, x1: piece.box.x1 - origin.x, y1: piece.box.y1 - origin.y,
	}});
}
async function _rapierPaintRecompress(raster, source, {signal} = {}) {
	signal?.throwIfAborted();
	const make = globalThis.RapierDrawAgentPaint?.paintRecompressionWorker;
	if (typeof Worker !== 'function' || typeof make !== 'function') return null;
	const url = URL.createObjectURL(new Blob(['(' + make.toString() + ')(' + globalThis.RapierDrawPaint.createPaintPNGCodec.toString() + ');'], {type: 'text/javascript'}));
	let worker, pending = null, serial = 0, megapixels = 12;
	const refuse = error => { if (pending) { clearTimeout(pending.timer); pending.reject(error); pending = null; } };
	const abort = () => { worker?.terminate(); refuse(signal.reason || new DOMException('Painting canceled', 'AbortError')); };
	try {
		worker = new Worker(url);
		signal?.addEventListener('abort', abort, {once: true});
		worker.onmessage = ({data}) => {
			if (!pending || data?.id !== pending.id) return;
			const held = pending; pending = null; clearTimeout(held.timer);
			if (data.ok) held.resolve(data); else held.reject(new Error(data.error || 'Painting verification failed'));
		};
		worker.onerror = event => { event.preventDefault(); refuse(new Error(event.message || 'Painting verifier failed')); };
		worker.onmessageerror = () => refuse(new Error('Painting verifier returned unreadable data'));
		const request = (operation, data, transfer = []) => new Promise((resolve, reject) => {
			signal?.throwIfAborted();
			const id = ++serial, timer = setTimeout(() => refuse(new Error('Painting verification took too long')), 45000 + megapixels * 15000);
			pending = {id, resolve, reject, timer};
			worker.postMessage({...data, id, operation}, transfer);
		});
		const {pixels} = await request('open', {raster, ...source});
		if (!pixels) return null;
		megapixels = Math.ceil(pixels.width * pixels.height / 1e6);
		signal?.throwIfAborted();
		const out = await globalThis.RapierEmbeddedImages.codec('encode', {width: pixels.width, height: pixels.height, data: pixels.data,
			options: {lossless: true, losslessProfile: 'painting-search', effort: 7, parallel: false}}, {signal, optional: true});
		signal?.throwIfAborted();
		const bytes = out.bytes || out;
		return (await request('check', {bytes}, [bytes.buffer])).raster;
	} finally {
		signal?.removeEventListener('abort', abort); if (pending) clearTimeout(pending.timer); worker?.terminate(); URL.revokeObjectURL(url);
	}
}
function _rapierPaintPixelsSurface(px) {
	return {width: px.width, height: px.height, readRGBA8(b) {
		if (!b || (b.x0 === 0 && b.y0 === 0 && b.x1 === px.width - 1 && b.y1 === px.height - 1)) return {...px, shared: true};
		const width = b.x1 - b.x0 + 1, height = b.y1 - b.y0 + 1, data = new Uint8ClampedArray(width * height * 4);
		for (let y = 0; y < height; y++) data.set(px.data.subarray(((b.y0 + y) * px.width + b.x0) * 4, ((b.y0 + y) * px.width + b.x1 + 1) * 4), y * width * 4);
		return {width, height, data};
	}};
}
async function _rapierPaintKeepAsJXL(recipe, defer = false, frozen = null, work = null) {
	if (typeof _rapierDefaultImageProfile === 'function' && _rapierDefaultImageProfile() !== 'jxl') { frozen?.(); return []; }
	const state = _rapierDrawState, budget = _rapierPaintRasterBudget(), split = [];
	const encodes = new Map(state.paintEncodes || []);
	const layer = recipe ? null : state.paintLayer;
	const current = state.paintLayer, frozenShape = recipe?.shapes.find(shape => shape.id === current?.id);
	const frozenBox = frozenShape && current?.surface && frozenShape.raster === current.raster && current.checkpoint?.revision === current.surface.revision ? current.surface.bounds() : null;
	const liveBox = defer && layer?.surface ? layer.surface.bounds() : null, readBox = frozenBox || liveBox;
	const shapes = ((recipe || state.recipe)?.shapes || []).slice();
	let frozenPixels = null;
	if (readBox && defer) {
		const surface = current.surface;
		frozenPixels = await _rapierPaintCaptureSnapshot(current, null, {surface, box: readBox, revision: surface.revision, session: state.session, width: surface.width, height: surface.height})();
		if (!frozenPixels) throw Object.assign(new Error('The painting changed before its recovery readout finished'), {code: 'PAINT_CAPTURE_CHANGED'});
	} else if (frozenBox) frozenPixels = await current.surface.readRGBA8(frozenBox);
	const captured = defer && layer && frozenPixels ? _rapierPaintPixelsSurface(frozenPixels) : null;
	frozen?.();
	const owed = Math.max(1, shapes.filter(shape => shape.recognized === 'paint' && shape.raster && !shape.raster.startsWith('data:image/jxl')).length);
	let turn = 0;
	for (const shape of shapes) {
		if (shape.recognized !== 'paint' || !shape.raster || shape.raster.startsWith('data:image/jxl')) continue;
		const share = turn++;
		const each = work ? { signal: work.signal, progress: typeof work.progress === 'function' ? (() => { let top = 0; return fraction => { top = Math.max(top, fraction); work.progress(Math.min(1, (share + top) / owed)); }; })() : undefined } : null;
		const live = layer && layer.id === shape.id && layer.surface ? layer : null;
		const box = live ? (defer ? liveBox : live.surface.bounds()) : null;
		if (live && !box) continue;
		const originalRaster = shape.raster, was = originalRaster.length;
		let pieces;
		const lossless = (encode, box) => _rapierPaintLosslessPieces(encode, box, budget, 0, shape.paint?.mode === 'water');
		if (encodes.has(shape.raster)) { const task = encodes.get(shape.raster), link = _rapierPaintEncodeLinks.get(task); if (link && each?.progress) { link.end(); link.to = each.progress; } pieces = await task; }
		else if (live) pieces = await lossless(b => _rapierPaintEncodeJXL(captured || live.surface, b, { lossless: true }, each), captured ? {x0: 0, y0: 0, x1: frozenPixels.width - 1, y1: frozenPixels.height - 1} : box);
		else {
			const prepared = work?.preparedPixels?.find(row => row.id === shape.id && row.raster === shape.raster);
			const exact = shape === frozenShape && frozenPixels ? frozenPixels : prepared
				? {width: prepared.width, height: prepared.height, data: prepared.data} : await _rapierPaintPNG.decode(shape.raster);
			if (exact) {
				const surface = _rapierPaintPixelsSurface(exact);
				pieces = await lossless(b => _rapierPaintEncodeJXL(surface, b, {lossless: true}, each), {x0: 0, y0: 0, x1: exact.width - 1, y1: exact.height - 1});
			} else {
				const canvas = await _rapierPaintRasterCanvas(shape.raster);
				pieces = await lossless(b => _rapierPaintEncodeCanvasBox(canvas, b, { lossless: true }, each), { x0: 0, y0: 0, x1: canvas.width - 1, y1: canvas.height - 1 });
			}
		}
		if (!pieces) continue;
		_rapierPaintRememberFast(work?.sources, pieces, originalRaster, live && !captured ? {x: box.x0, y: box.y0} : undefined);
		if (pieces.length === 1 && !live) { shape.raster = pieces[0].url; continue; }
		if (pieces.length === 1) { shape.raster = pieces[0].url; continue; }
		const origin = live && !captured ? { x: box.x0, y: box.y0 } : { x: 0, y: 0 };
		const made = await _rapierPaintSplitShape((recipe || state.recipe).shapes, shape, pieces.map(piece => ({ url: piece.url, box: { x0: piece.box.x0 - origin.x, y0: piece.box.y0 - origin.y, x1: piece.box.x1 - origin.x, y1: piece.box.y1 - origin.y } })));
		if (made) split.push({ shape, was, pieces: made.length });
	}
	return split;
}
// (RAPIER_DRAW_RASTER_MAX) -- but the drawing itself is written as ONE SVG asset
async function _rapierPaintReencodeQuality95(recipe) {
	const state = _rapierDrawState, layer = state.paintLayer, options = { lossless: false, quality: 95 }, touched = new Set();
	for (const shape of (recipe?.shapes || [])) {
		if (shape.paint?.mode === 'water' || shape.recognized !== 'paint' || !shape.raster || !shape.raster.startsWith('data:image/jxl')) continue;
		const live = !shape.paint?.group && layer && layer.id === shape.id && layer.surface ? layer : null;
		const box = live ? live.surface.bounds() : null;
		if (live && !box) continue;
		const encoded = live ? await _rapierPaintEncodeJXL(live.surface, box, options)
			: await _rapierPaintEncodeCanvasBox(await _rapierPaintRasterCanvas(shape.raster), null, options);
		shape.raster = encoded.url;
		touched.add(shape.paint?.group || shape.id);
	}
	return touched.size;
}
async function _rapierPaintOfferQuality95(beforeBytes, afterBytes) {
	if (typeof rapierConfirm !== 'function') return false;
	const toKiB = n => Math.round(n / 1024);
	return await rapierConfirm({
		title: 'A very large drawing',
		message: 'At full quality this drawing is ' + toKiB(beforeBytes) + ' KiB, more than one picture can hold. Quality 95 would keep it at ' + toKiB(afterBytes) + ' KiB instead. Save this drawing’s painting at quality 95?',
		confirmLabel: 'quality 95',
	}) === true;
}
async function _rapierPaintSetLayer({ auto = false, kib = 0 } = {}) {
	const state = _rapierDrawState, layer = state.paintLayer;
	if (!layer || state.paintSetting) return;
	const setting = state.paintSetting = { layer, session: state.session, auto };
	if (!auto) srAnnounce('Setting painting as a picture');
	_rapierPaintUpdateStrip();
	let shape = null, laid = null;
	try {
		if(layer.mode==='water')layer.surface.finishWetWork();else layer.surface.settleWet(); await layer.surface.sync();
		if (!auto) {
			await _rapierPaintCommit(true);
			shape = layer.id != null ? _rapierDrawShapeById(layer.id) : null;
			if (!shape) { showToast('There is nothing painted to set yet.', 'info'); return; }
		}
		const budget = _rapierPaintRasterBudget();
		const asJXL = typeof _rapierDefaultImageProfile !== 'function' || _rapierDefaultImageProfile() === 'jxl';
		const behind = !auto && asJXL;
		const encode = (box, options) => asJXL && !behind ? _rapierPaintEncodeJXL(layer.surface, box, options).then(async out => ({ ...out, shown: await _rapierPaintShownFor(layer.surface, box) }))
			: Promise.resolve(layer.surface.readRGBA8(box)).then(px => _rapierPaintPNG.compressed(px)).then(url => ({ url, options }));
		let kept = null, pieces = null;
		if (auto) {
			for (let tries = 0; ; tries++) {
				if(layer.mode==='water')layer.surface.finishWetWork();else layer.surface.settleWet(); await layer.surface.sync();
				const version = layer.paintVersion || 0, box = layer.surface.bounds();
				if (!box) return;
				pieces = await _rapierPaintLosslessPieces(b => encode(b, { lossless: true }), box, budget, 0, layer.mode === 'water');
				kept = pieces ? { url: pieces[0].url, options: { lossless: true } } : null;
				if (!state.open || state.session !== setting.session || state.paintSetting !== setting || state.paintLayer !== layer) return;
				const moving = state.gesture?.kind === 'paint';
				if (kept && (layer.paintVersion || 0) === version && !moving) break;
				if (!kept || tries >= 7) {
					if (!moving) { layer.pendingOverflow = true; await _rapierPaintCommit(true, null, true); layer.pendingOverflow = false; }
					// the real cap (the flip at RAPIER_PAINT_AREA_MAX * 2 bounds the surface at 12M pixels,
					showToast(kept ? 'This painting is bigger than one working picture holds; it is kept as it is and saved when you press Done.'
						: 'This painting is bigger than sixty-four pictures hold; it is kept as it is and saved when you press Done.', 'info');
					return;
				}
			}
			layer.pendingOverflow = false;
			const box = layer.surface.bounds();
			_rapierPaintRememberFast(state.paintFastSources || (state.paintFastSources = new Map()), pieces, layer.raster, {x: box.x0, y: box.y0});
			_rapierPaintKeepShown(pieces);
			await _rapierPaintCommit(true, pieces.length === 1 ? kept.url : pieces, true);
			shape = layer.id != null ? _rapierDrawShapeById(layer.id) : null;
			if (!shape) return;
		} else {
			const box = layer.surface.bounds(), version = layer.paintVersion || 0;
			const session = state.session, currentLayer = state.paintLayer;
			pieces = await _rapierPaintLosslessPieces(b => encode(b, { lossless: true }), box, budget, 0, layer.mode === 'water');
			const same = state.open && state.session === session && state.paintLayer === currentLayer && _rapierDrawShapeById(shape.id) === shape;
			if (!same || (layer.paintVersion || 0) !== version || state.gesture?.kind === 'paint' || (layer.mode !== 'water' && layer.surface.wetState)) {
				if (behind && same) {
					for (let waited = 0; state.gesture?.kind === 'paint' && state.open && state.session === session && waited < 20000; waited += 30) await new Promise(ok => setTimeout(ok, 30));
					if (state.open && state.session === session && state.paintLayer === currentLayer && state.gesture?.kind !== 'paint') {
						await _rapierPaintCommit(true);
						const again = layer.id != null ? _rapierDrawShapeById(layer.id) : null;
						if (again && state.paintLayer === currentLayer) {
							shape = again; kept = { url: again.raster, options: { lossless: true } }; pieces = null;
							void _rapierPaintEncodeShapeLater(again.id, again.raster, null, { entry: state.undoStack.at(-1) });
						}
					}
				}
				if (!kept) {
					if (state.open && state.session === session) showToast('The painting changed while Set was working. Your work is kept; press Set again to finish the current picture.', 'info');
					return;
				}
			}
			if (kept) {  } else {
			if (!pieces) { showToast('This painting is past what even sixty-four pictures can hold. Erase some of it and set it again.', 'info'); return; }
			kept = { url: pieces[0].url, options: { lossless: true } };
			_rapierPaintKeepShown(pieces);
			_rapierDrawSnapshot();
			shape.raster = kept.url;
			if (pieces.length > 1) { _rapierPaintSplitShapeSync(state.recipe.shapes, shape, pieces.map(piece => ({ url: piece.url, box: { x0: piece.box.x0 - box.x0, y0: piece.box.y0 - box.y0, x1: piece.box.x1 - box.x0, y1: piece.box.y1 - box.y0 } }))); _rapierDrawRenderAll(); }
			else _rapierDrawRenderShapes([shape.id]);
			_rapierDrawSealHistory();
			if (behind && pieces.length === 1) void _rapierPaintEncodeShapeLater(shape.id, kept.url, null, { entry: state.undoStack.at(-1) });
			}
		}
		await _rapierPaintCloseLayer();
		_rapierPaintOpenLayer();
		_rapierPaintSyncPaper();
		const how = (kept.options?.lossless ? 'full quality' : 'quality ' + (kept.options?.quality ?? kept.quality)) + (pieces && pieces.length > 1 ? ', in ' + pieces.length + ' pieces' : '');
		if (auto) showToast('This painting reached what one working picture holds (' + kib + ' KiB), so it was set as a ' + (asJXL ? 'JPEG XL' : 'PNG') + ' picture (' + how + ', ' + Math.round((pieces ? pieces.reduce((n, piece) => n + piece.url.length, 0) : kept.url.length) / 1024) + ' KiB)' + (kept.fits === false ? ', still larger than one picture usually holds' : '') + '. You are on a clean sheet over it -- keep going.', 'info');
		else showToast('Set as a picture (' + how + ', ' + Math.round(kept.url.length / 1024) + ' KiB). A clean sheet is open over it.', 'info');
		if (!auto) laid = shape;
	} catch (error) {
		showToast('This painting could not be set: ' + String(error?.message || error), 'error');
	} finally {
		if (state.paintSetting === setting) state.paintSetting = false;
		_rapierPaintUpdateStrip();
	}
	if (laid) _rapierPaintSettle(laid);
}
function _rapierPaintSettle(shape) {
	const state = _rapierDrawState, stage = state.stageEl, group = shape && state.svg?.querySelector('[data-shape-id="' + _rapierDrawEscapeAttr(String(shape.id)) + '"]');
	if (!group || !stage || _rapierDrawStill()) return;
	const box = group.getBoundingClientRect(), frame = stage.getBoundingClientRect();
	const left = Math.max(box.left, frame.left), top = Math.max(box.top, frame.top), width = Math.min(box.right, frame.right) - left, height = Math.min(box.bottom, frame.bottom) - top;
	if (width < 8 || height < 8) return;
	const sheet = document.createElement('div');
	sheet.className = 'rapier-draw-sheet';
	sheet.style.cssText = 'left:' + Math.round(left - frame.left) + 'px;top:' + Math.round(top - frame.top) + 'px;width:' + Math.round(width) + 'px;height:' + Math.round(height) + 'px';
	stage.append(sheet);
	const laying = _rapierDrawPlay(sheet, 'laid');
	if (laying) laying.finished.then(() => sheet.remove(), () => sheet.remove());
	else sheet.remove();
}
async function _rapierPaintRequestSetLayer() {
	const state = _rapierDrawState;
	if (!state.paintLayer || state.paintSetting || !state.open || state.finishing) return;
	await _rapierPaintSetLayer();
}
function _rapierPaintSetPicker(kind, open = true) {
	const state = _rapierDrawState, mode = kind === 'tools' ? 'tools' : 'brushes';
	state.paintPicker = open ? mode : null;
	const row = _rapierPaintStrip();
	if (row) row.dataset.drawPanel = mode === 'tools' ? 'paintTools' : 'paintBrushes';
	for (const [act, value] of [['paintBrushes', 'brushes'], ['paintTools', 'tools']]) state.surface?.querySelector('[data-draw-act="' + act + '"]')?.setAttribute('aria-expanded', String(state.paintPicker === value));
	_rapierPaintUpdateStrip();
}
function _rapierPaintKeepScroll(row) {
	if (!row.hidden && row.dataset.paintShown) row.dataset[row.dataset.paintShown] = String(row.scrollLeft);
}
function _rapierPaintUpdateStrip() {
	const row = _rapierPaintStrip();
	if (!row) return;
	_rapierPaintDipSyncButton();
	_rapierPaintDipSyncPanel();
	if (_rapierDrawTool() !== 'paint') _rapierPaintHeadHide();
	const mode = _rapierDrawState.paintPicker, justPicked = _rapierDrawState.paintPicked;
	_rapierDrawState.paintPicked = null;
	_rapierPaintKeepScroll(row);
	if (_rapierDrawTool() !== 'paint' || (mode !== 'brushes' && mode !== 'tools')) {
		row.hidden = true;
		return;
	}
	const shown = mode === 'tools' ? 'scrollTools' : 'scrollBrushes';
	row.dataset.drawPanel = mode === 'tools' ? 'paintTools' : 'paintBrushes';
	row.setAttribute('aria-label', mode === 'tools' ? 'Paint tools' : 'Brushes');
	row.hidden = false;
	const chosen = _rapierPaintBrushId(), color = _rapierPaintColor(), strengthLight = _rapierDrawState.paintStrength === 'light';
	const entries = _rapierPaintEntries().filter(entry => _rapierPaintIsTool(entry.id) === (mode === 'tools'));
	const tabStop = entries.some(entry => entry.id === chosen) ? chosen : entries[0]?.id;
	const own = mode === 'brushes' && _rapierPaintEntry(chosen)?.own;
	const chip = entry => {
		const on = entry.id === chosen, tool = _rapierPaintIsTool(entry.id);
		const art = tool ? '<span class="rapier-draw-glyph rapier-draw-glyph--tool">' + _rapierPaintToolIcon(entry.id) + '</span>'
			: (u => u ? '<img class="rapier-draw-glyph rapier-draw-glyph--paint" alt="" src="' + u + '">' : '<span class="rapier-draw-glyph"></span>')(_rapierPaintGlyph(entry.id, color, strengthLight));
		return '<button type="button" tabindex="' + (entry.id === tabStop ? '0' : '-1') + '" class="rapier-draw-chip rapier-draw-chip--glyph rapier-draw-chip--paint' + (tool ? ' rapier-draw-chip--tool' : '') + (on ? ' rapier-draw-chip--active' : '') + (entry.own ? ' rapier-draw-chip--own' : '') + '" role="radio" data-draw-paint-kind="' + (tool ? 'tool' : 'paint') + '" data-draw-paint-brush="' + _rapierDrawEscapeAttr(entry.id) +
			'" aria-label="' + _rapierDrawEscapeAttr(_rapierPaintBrushLabel(entry)) + '" data-tip="' + _rapierDrawEscapeAttr(entry.name.toLowerCase()) + '" aria-checked="' + on + '">' +
			art + '<span class="rapier-draw-chip-name">' + _rapierDrawEscapeAttr(tool ? _rapierPaintToolWord(entry.id, entry.name) : _rapierPaintBrushWord(entry.id, entry.name)) + '</span></button>';
	};
	const focused = row.contains(document.activeElement) ? document.activeElement : null;
	const wasKey = focused ? (focused.dataset.drawPaintBrush ? 'brush:' + focused.dataset.drawPaintBrush : focused.dataset.drawPaintAct ? 'act:' + focused.dataset.drawPaintAct : '') : '';
	row.innerHTML = (mode === 'brushes' ? _rapierPaintHeadChipHTML() : '') + entries.map(chip).join('') +
		(own ? '<button type="button" class="rapier-draw-chip rapier-draw-chip--icon" data-draw-paint-act="fit" role="switch" aria-checked="' + _rapierPaintFitsFinger(chosen) + '" aria-label="' +
			(_rapierPaintFitsFinger(chosen) ? 'This brush is fitted for a finger. Turn that off to use its authored response' : 'Use finger fitting for this brush') + '">' + (_rapierPaintFitsFinger(chosen) ? RAPIER_PAINT_ICON_GAUGE_FIRM : RAPIER_PAINT_ICON_GAUGE_LIGHT) + '<span class="rapier-draw-chip-name">fit</span></button>' : '') +
		(own ? '<button type="button" class="rapier-draw-chip rapier-draw-chip--icon rapier-draw-chip--delete" data-draw-paint-act="remove" aria-label="Remove this brush from your set">' + RAPIER_DRAW_ICONS.trash + '<span class="rapier-draw-chip-name">remove</span></button>' : '') +
		(mode === 'brushes' ? '<button type="button" class="rapier-draw-chip rapier-draw-chip--icon" data-draw-paint-act="upload" aria-label="add a MyPaint brush" data-tip="add brush">' + RAPIER_DRAW_ICONS.upload + '<span class="rapier-draw-chip-name">add</span></button>' +
			'<button type="button" class="rapier-draw-chip rapier-draw-chip--icon" data-draw-paint-act="export" aria-label="save the selected MyPaint brush" data-tip="save brush">' + RAPIER_DRAW_ICONS.download + '<span class="rapier-draw-chip-name">save</span></button>' : '');
	if (!row.dataset.paintBound) {
		row.dataset.paintBound = '1';
		row.addEventListener('keydown', evt => {
			if (evt.defaultPrevented || evt.isComposing || evt.keyCode === 229) return;
			const here = evt.target.closest('[data-draw-paint-brush]');
			if (!here) return;
			const ids = [...row.querySelectorAll('[data-draw-paint-brush]')].map(el => el.dataset.drawPaintBrush), at = ids.indexOf(here.dataset.drawPaintBrush);
			const to = evt.key === 'ArrowRight' || evt.key === 'ArrowDown' ? at + 1 : evt.key === 'ArrowLeft' || evt.key === 'ArrowUp' ? at - 1 : evt.key === 'Home' ? 0 : evt.key === 'End' ? ids.length - 1 : -1;
			if (to < 0 || to >= ids.length || at < 0) return;
			evt.preventDefault(); evt.stopPropagation(); _rapierPaintSetBrush(ids[to]);
			row.querySelector('[data-draw-paint-brush="' + _rapierDrawEscapeAttr(ids[to]) + '"]')?.focus({preventScroll: true});
		});
		_rapierDrawBindTap(row, evt => {
			if (evt.target.closest('[data-draw-paint-head]')) { if (!_rapierDrawState.finishing) _rapierPaintAngleOpen(true); return; }
			const act = evt.target.closest('[data-draw-paint-act]')?.dataset.drawPaintAct;
			if (!act || _rapierDrawState.finishing) return;
			if (act === 'remove') _rapierPaintRemoveOwn(_rapierPaintBrushId());
			else if (act === 'fit') _rapierPaintSetFitsFinger(_rapierPaintBrushId(), !_rapierPaintFitsFinger(_rapierPaintBrushId()));
			else if (act === 'upload') void _rapierDrawPaintUpload();
			else if (act === 'export') _rapierPaintExportBrush(_rapierPaintBrushId());
		});
	}
	row.dataset.paintShown = shown;
	row.scrollLeft = Number(row.dataset[shown] || 0);
	if (wasKey) {
		const [kind, value] = [wasKey.slice(0, wasKey.indexOf(':')), wasKey.slice(wasKey.indexOf(':') + 1)];
		row.querySelector('[data-draw-paint-' + (kind === 'brush' ? 'brush' : 'act') + '="' + _rapierDrawEscapeAttr(value) + '"]')?.focus({preventScroll: true});
	}
	const picked = justPicked === chosen && row.querySelector('[aria-checked="true"]');
	if (picked) _rapierDrawPlay(picked.querySelector('.rapier-draw-glyph'), picked.dataset.drawPaintKind === 'tool' ? 'pop' : 'dab');
	const active = row.querySelector('[aria-checked="true"]');
	if (active && row.dataset.paintSeen !== chosen) {
		row.dataset.paintSeen = chosen;
		const left = active.offsetLeft, right = left + active.offsetWidth;
		if (left < row.scrollLeft) row.scrollLeft = left; else if (right > row.scrollLeft + row.clientWidth) row.scrollLeft = right - row.clientWidth;
	}
}

function _rapierPaintPixelsToDataURL(px) { return _rapierPaintPNG.encode(px); }
function _rapierPaintPlace(layer) {
	return {scale: layer.scale, origin: layer.origin ? layer.origin.slice() : null, frame: layer.frame ? {...layer.frame, c0: layer.frame.c0.slice()} : null};
}
function _rapierPaintNotKept(layer, error) {
	layer.pendingOverflow = true;
	if (!_rapierPaintLossSaid(error)) showToast('The painting could not be kept. It is still open: ' + String(error?.message || error), 'error');
}
function _rapierPaintGeomOf(layer, box) {
	const pw = box.x1 - box.x0 + 1, ph = box.y1 - box.y0 + 1, s = layer.scale;
	let geom;
	if (layer.frame) {
		const f = layer.frame, toWorld = (px, py) => [f.c0[0] + px * f.eux + py * f.evx, f.c0[1] + px * f.euy + py * f.evy];
		const px0 = box.x0 - f.pad, py0 = box.y0 - f.pad, px1 = box.x1 - f.pad + 1, py1 = box.y1 - f.pad + 1;
		const c0 = toWorld(px0, py0), c1 = toWorld(px1, py0), c3 = toWorld(px0, py1);
		geom = { p: [c0, c1, [c1[0] + c3[0] - c0[0], c1[1] + c3[1] - c0[1]], c3] };
	} else {
		const ox = layer.origin?.[0] || 0, oy = layer.origin?.[1] || 0;
		geom = { cx: (box.x0 + pw / 2) / s + ox, cy: (box.y0 + ph / 2) / s + oy, w: pw / s, h: ph / s };
	}
	return { geom, pw, ph, s };
}
function _rapierPaintRevisionLayers(layer = _rapierPaintLayer()) {
	const layers = [];
	for (; layer; layer = layer.previousFlip) layers.unshift(layer);
	return layers;
}
async function _rapierPaintObserveDrawing({recipe = _rapierDrawSettledRecipe(), signal, current} = {}) {
	const state = _rapierDrawState, session = state.session, agentSession = state.agentSession;
	const changed = () => Object.assign(new Error('The drawing changed while its painting was being observed.'), {code:'drawing_changed'});
	const check = () => {
		if (signal?.aborted) throw new DOMException('The drawing observation was cancelled.', 'AbortError');
		if (!state.open || state.session !== session || state.agentSession !== agentSession || current && !current()) throw changed();
	};
	check();
	if (!recipe || !state.recipe) throw changed();
	const seenRecipe = _rapierDrawHistoryCopy(state.recipe), result = _rapierDrawHistoryCopy(recipe);
	const gesture = state.gesture, paint = gesture?.paint, points = paint?.points, waiting = paint?.moveEvents?.length;
	const layers = _rapierPaintRevisionLayers(), active = state.paintLayer;
	if (layers.length > 1 || state.paintDeparture || state.paintRehydrate || state.paintRehydrateTask || state.paintEraseFan || paint?.pending) throw changed();
	const held = layers.map(layer => ({layer,surface:layer.surface,id:layer.id,raster:layer.raster,geom:layer.geom,
		mode:layer.mode,brushId:layer.brushId,waterPaper:layer.waterPaper,version:layer.paintVersion,
		place:_rapierPaintPlace(layer),retire:_rapierDrawHistoryCopy(layer.retire),toothOX:layer.surface?.toothOX,toothOY:layer.surface?.toothOY}));
	for (const row of held) if (row.id != null) {
		const target = seenRecipe.shapes.find(shape => shape.id === row.id), requested = result.shapes.find(shape => shape.id === row.id);
		if (!target || target.raster !== row.raster || JSON.stringify(target.geom) !== row.geom || !_rapierDrawHistoryEqual(target, requested)) throw changed();
	}
	const live = () => {
		check();
		if (state.paintLayer !== active || state.gesture !== gesture || gesture?.paint !== paint || paint?.points !== points ||
			paint?.moveEvents?.length !== waiting || !_rapierDrawHistoryEqual(seenRecipe, state.recipe)) throw changed();
		for (const row of held) {
			const {layer,surface} = row;
			if (!surface || surface.gone || surface.failure || surface.materialReady || layer.session !== session || layer.surface !== surface ||
				(row.id != null && surface.pending && !surface.meta?.bounds) ||
				layer.id !== row.id || layer.raster !== row.raster || layer.geom !== row.geom || layer.paintVersion !== row.version ||
				layer.mode !== row.mode || layer.brushId !== row.brushId || layer.waterPaper !== row.waterPaper || surface.toothOX !== row.toothOX || surface.toothOY !== row.toothOY ||
				!_rapierDrawHistoryEqual(row.retire, layer.retire) || !_rapierDrawHistoryEqual(row.place, _rapierPaintPlace(layer))) throw changed();
		}
	};
	live();
	const captures = await Promise.all(held.map(row => row.surface.observe({signal})));
	live();
	const observations = [], capturedIds = new Set();
	for (let index = 0; index < held.length; index++) {
		const row = held[index], {box,pixels,meta} = captures[index];
		const wet = !!(meta.wet || meta.wetState || meta._wetWork || meta.wetPending);
		observations.push({id:row.id ?? null,mode:row.mode,state:wet ? 'wet' : 'settled',revision:meta.revision,...(Number.isSafeInteger(meta.tick) ? {tick:meta.tick} : {})});
		const existing = row.id == null ? null : result.shapes.find(shape => shape.id === row.id);
		const gone = new Set(row.retire || []); if (existing) gone.add(existing.id);
		if (!box || !pixels) {
			result.shapes = result.shapes.filter(shape => !gone.has(shape.id));
			if (gone.size) remapRefractionRecipeSources(result, new Map([...gone].map(id => [id,null])));
			continue;
		}
		const place = _rapierDrawHistoryCopy(row.place), dx = meta.toothOX - row.toothOX, dy = meta.toothOY - row.toothOY;
		if (place.frame) { const f = place.frame; f.c0[0] += dx * f.eux + dy * f.evx; f.c0[1] += dx * f.euy + dy * f.evy; }
		else { place.origin ||= [0,0]; place.origin[0] += dx / place.scale; place.origin[1] += dy / place.scale; }
		const {geom,pw,ph,s} = _rapierPaintGeomOf(place, box);
		const raster = await _rapierPaintPNG.compressed(pixels);
		live();
		let shape = existing;
		if (!shape) {
			let serial = index, id;
			do { id = 'observed-paint-' + serial++; } while (result.shapes.some(item => item.id === id || item.group === id || item.paint?.group === id));
			shape = {id,stroke:null,recognized:'paint',asDrawn:false,brush:'ink',style:null};
			result.shapes.push(shape);
		}
		shape.geom = geom; shape.raster = raster;
		shape.paint = _rapierPaintMetadata(row, row.brushId, pw, ph, s, null);
		capturedIds.add(shape.id);
		result.shapes = result.shapes.filter(item => item === shape || !gone.has(item.id));
		if (gone.size) remapRefractionRecipeSources(result, new Map([...gone].map(id => [id,shape.id])));
	}
	live();
	const storedWater = result.shapes.some(shape => shape.paint?.mode === 'water' && !capturedIds.has(shape.id));
	return {recipe:result,state:observations.some(row => row.state === 'wet') ? 'wet' : storedWater ? 'stored' : 'settled',layers:observations};
}
function _rapierPaintRetireRevisionLayer(layer) {
	const next = layer.nextFlip;
	if (!next) return;
	_rapierPaintDropSnapshots(layer);
	if (next.previousFlip === layer) next.previousFlip = layer.previousFlip || null;
	if (layer.previousFlip) layer.previousFlip.nextFlip = next;
	layer.previousFlip = layer.nextFlip = null;
	if (layer.pngWorker) { layer.pngWorker.worker.terminate(); URL.revokeObjectURL(layer.pngWorker.url); layer.pngWorker = null; }
	layer.mount?.remove();
	if (layer.canvas && !layer.gpuDisplay) layer.canvas.width = layer.canvas.height = 0;
	_rapierPaintReleaseSurface(layer);
	_rapierPaintReattachLive();
	return next;
}
function _rapierPaintSealRevision(layer, stroke, priorShift, grown) {
	const state = _rapierDrawState, canvas = state.recipe.canvas;
	const entry = _rapierDrawSealHistory();
	if (stroke) {
  const fresh=!stroke.entry;
  stroke.entry = entry;
  const part=stroke.histories?.find(h=>h.surfaceId===layer.surface.id)||stroke.history;
  if(part)part.shapeId=layer.id;
  if(fresh&&typeof _rapierPaintHistoryWalk==='function')_rapierPaintHistoryWalk({paintHistory:{parts:stroke.histories||[]}},null);
  const parts=(stroke.histories||[stroke.history]).filter(h=>h?.after);
  const other=entry?.paintHistory?.parts.filter(h=>!parts.some(p=>p.remote===h.remote&&p.surfaceId===h.surfaceId))||[];
  if(entry&&parts.length)Object.defineProperty(entry,'paintHistory',{value:{parts:[...other,...parts.map(h=>({...h}))]},configurable:true});
 }
 if(typeof _rapierPaintTrimHistory==='function')_rapierPaintTrimHistory();
	const shift = entry?.shift ? {dx: entry.shift.dx - (priorShift?.dx || 0), dy: entry.shift.dy - (priorShift?.dy || 0)} : grown;
	if (grown || state.recipe.canvas !== canvas) _rapierPaintFollowGrowth(layer, shift || {dx: 0, dy: 0});
 for(const part of stroke?.histories||[]){
  if(!part.after)continue;
  if(part.surfaceId===layer.surface.id)part.after.place=_rapierPaintPlace(layer);
  else if(shift){const place=part.after.place;if(place?.frame){place.frame.c0[0]+=shift.dx;place.frame.c0[1]+=shift.dy;}else if(place?.origin){place.origin[0]+=shift.dx;place.origin[1]+=shift.dy;}}
 }
	const shape = _rapierDrawShapeById(layer.id);
	if (shape) {
		layer.geom = JSON.stringify(shape.geom);
		if (layer.mode === 'water') globalThis.RapierDrawAgentPaint.rememberWaterPainting(shape, _rapierWaterSession());
	}
	if (typeof _rapierDrawBackupPublished === 'function') _rapierDrawBackupPublished();
}
function _rapierPaintWorker(layer) {
	if (typeof Worker !== 'function') return null;
	let owner = layer.pngWorker;
	if (!owner) {
		let url;
		try {
			url = URL.createObjectURL(new Blob(['const codec = (' + globalThis.RapierDrawPaint.createPaintPNGCodec.toString() + ')(); self.onmessage = async e => { const {id, stored, px, cancel} = e.data; if (cancel) return; try { const raster = stored ? codec.encode(px) : await codec.compressed(px); let shown = null; if (stored) { try { shown = await codec.compressed(px); } catch (_) {} } self.postMessage({id, raster, shown}); } catch (e) { self.postMessage({id, error: String(e.message || e)}); } };'], {type: 'text/javascript'}));
			owner = layer.pngWorker = {worker: new Worker(url), url, snapshots: new Map()};
		} catch (_) { if (url) URL.revokeObjectURL(url); return null; }
		const worker = owner.worker;
		worker.onmessage = event => {
			const snapshot = owner.snapshots.get(event.data.id);
			if (snapshot) { snapshot.finish(event.data.raster || null); return; }
			const job = (layer.revisions || []).find(item => item.id === event.data.id);
			if (!job || job.raster) return;
			try { job.raster = event.data.raster || _rapierPaintPNG.encode(job.px); }
			catch (error) { _rapierPaintNotKept(layer, error); return; }
			job.shown = event.data.shown || null;
			_rapierPaintDrainRevisions(layer);
		};
		worker.onerror = worker.onmessageerror = () => { _rapierPaintDropSnapshots(layer); const wait = _rapierPaintFlushRevision(layer); wait?.catch(error => _rapierPaintNotKept(layer, error)); };
	}
	return owner;
}
function _rapierPaintEncodeRevision(layer, keep = false, {retire = false, release = false, custody = false, compressor = true, peek = false} = {}) {
	const state = _rapierDrawState, owner = compressor ? _rapierPaintWorker(layer) : null;
	let resolve, reject;
	layer.pngSerial = (layer.pngSerial || 0) + 1;
	const job = {id: layer.pngSerial, keep, custody, retire, release, place: _rapierPaintPlace(layer), px: null, box: null, raster: null, shown: null, empty: false, revision: 0, read: null, replay: peek ? _rapierPaintPeekReplay(layer.surface) : layer.surface.takeReplay?.() ?? null,
		stored: !!layer.nextFlip, stroke: layer.flipStroke, brushId: layer.brushId, worker: owner?.worker, url: owner?.url, session: state.session,
		promise: new Promise((ok, no) => { resolve = ok; reject = no; }), resolve: () => resolve(), reject: error => reject(error)};
	job.promise.catch(() => {});
	if (layer.mode !== 'water') job.surface = layer.surface;
	const readout = layer.mode === 'water' ? globalThis.__rapierWaterStats : null;
	if (readout) { const asked = performance.now(); job.promise.then(() => { readout.publication = performance.now() - asked; }, () => {}); }
	layer.revisions = layer.revisions || [];
	layer.revisions.push(job);
	layer.pendingCommit = layer.revisions[0];
	_rapierDrawRenderHistory();
	job.timer = setTimeout(() => { if ((layer.revisions || []).includes(job)) { const wait = _rapierPaintFlushRevision(layer); wait?.catch(error => _rapierPaintNotKept(layer, error)); } }, 15000);
	job.read = layer.surface.readBounds(layer.mode === 'water' ? {waterCheckpoint:true,waterPrior:layer.paintReplay || null} : {}).then(result => _rapierPaintRevisionRead(layer, job, result), () => _rapierPaintDropRevision(layer, job));
	return job;
}
function _rapierPaintPeekReplay(surface) {
	const records = surface.peekReplay?.() || [];
	return records.length ? records : null;
}
function _rapierPaintRevisionRead(layer, job, result) {
	job.read = null;
	if (_rapierDrawState.session !== job.session || !_rapierPaintRevisionLayers().includes(layer)) { _rapierPaintDropRevision(layer, job); return; }
	if (!(layer.revisions || []).includes(job)) return;
	job.box = result.box; job.revision = result.meta?.revision ?? 0;
	if(result.history)job.history={...result.history,digest:result.digest,box:result.box,meta:result.meta,place:job.place};
	if(job.history&&job.release){
		const part=job.stroke?.histories?.find(h=>h.surfaceId===layer.surface.id)||job.stroke?.history;
		if(part)part.after=job.history;
		_rapierPaintTrimHistory();
	}
	if (layer.mode !== 'water' && result.verified && result.box) job.capture = {surface:job.surface, box:{...result.box}, width:result.meta.width, height:result.meta.height, toothOX:result.meta.toothOX, toothOY:result.meta.toothOY};
	if (layer.mode === 'water') { job.waterCapture = result.waterReplay; job.waterSheet = result.waterSheet; }
	if (!result.box) job.empty = true; else job.px = {width: result.pixels.width, height: result.pixels.height, data: result.pixels.data};
	if (job.retire) { if (layer.surface) layer.surface.display = null; if (job.release) _rapierPaintReleaseSurface(layer); }
	if (!job.empty && !job.raster) {
		if (job.worker) {
			try { const wire = new Uint8ClampedArray(job.px.data); job.worker.postMessage({id: job.id, stored: job.stored, px: {width: job.px.width, height: job.px.height, data: wire}}, [wire.buffer]); return; }
			catch (_) {}
		}
		try { job.raster = _rapierPaintPNG.encode(job.px); }
		catch (error) { _rapierPaintDropRevision(layer, job, error); return; }
	}
	_rapierPaintDrainRevisions(layer, job.keep);
}
function _rapierPaintDropRevision(layer, job, error = null) {
	job.read = null;
	const queue = layer.revisions || [], at = queue.indexOf(job);
	if (at >= 0) queue.splice(at, 1);
	layer.pendingCommit = queue[0] || null;
	clearTimeout(job.timer);
	if (layer.publicationTask === job) layer.publicationTask = null;
	if (error) {
		if (at >= 0 && job.replay?.length) {
			const last = job.replay.at(-1), box = job.box;
			if (!last.crop && box) last.crop = [box.x0, box.y0, box.x1, box.y1];
			if (queue[at]) queue[at].replay = [...job.replay, ...(queue[at].replay || [])];
			else layer.surface?.restoreReplay(job.replay);
			job.replay = null;
		}
		_rapierPaintNotKept(layer, error); job.reject(error);
	} else job.resolve();
	if (at >= 0) _rapierPaintDrainRevisions(layer);
}
function _rapierPaintTask(update, failed = null) {
	if (globalThis.scheduler?.postTask) { const task = globalThis.scheduler.postTask(update, {priority: 'user-visible'}); if (failed) void task.catch(failed); return 0; }
	return setTimeout(update, 0);
}
function _rapierPaintDropSnapshots(layer) {
	let dropped = false;
	if (layer?.recoveryCapture?.cancel) { dropped = true; layer.recoveryCapture.cancel(); }
	for (const job of layer?.pngWorker?.snapshots?.values() || []) { dropped = true; job.finish(null); }
	return dropped;
}
function _rapierPaintCaptureSnapshot(layer, owner, held) {
	const state = _rapierDrawState, {surface, box, revision, session, width, height} = held;
	const current = () => state.open && state.session === session && state.paintLayer === layer && layer.surface === surface && surface.revision === revision && !surface._wetWork && surface.width === width && surface.height === height && !state.gesture && (!owner || layer.pngWorker === owner) && !(typeof document !== 'undefined' && document.hidden);
	const capture = {surface, box, timer: 0};
	let started = false, finished = false, resolve;
	const promise = new Promise(ok => { resolve = ok; });
	const release = () => { if (layer.recoveryCapture === capture) layer.recoveryCapture = null; };
	const job = {id: layer.pngSerial = (layer.pngSerial || 0) + 1, worker: owner?.worker};
	job.finish = raster => {
		if (finished) return;
		finished = true; owner?.snapshots.delete(job.id); clearTimeout(job.timer);
		release();
		if (!raster) { try { owner?.worker.postMessage({id: job.id, cancel: true}); } catch (_) {} }
		resolve(raster);
	};
	capture.cancel = () => job.finish(null);
	owner?.snapshots.set(job.id, job);
	job.timer = setTimeout(() => job.finish(null), 15000);
	return () => {
		if (!started && !finished) {
			started = true;
			if (!current()) job.finish(null);
			else {
				layer.recoveryCapture = capture;
				try {
					surface.readRGBA8(box).then(px => {
						if (finished) return;
						if (!current()) { job.finish(null); return; }
						if (!owner) { job.finish(px); return; }
						try { owner.worker.postMessage({id: job.id, stored: false, px: {width: px.width, height: px.height, data: px.data}}, [px.data.buffer]); }
						catch (_) { job.finish(null); }
					}, () => job.finish(null));
				} catch (_) { job.finish(null); }
			}
		}
		return promise;
	};
}
function _rapierPaintDrainRevisions(layer, now = false) {
	if (layer.previousFlip?.pendingCommit) return;
	const job = layer.revisions?.[0];
	if (!(job?.raster || job?.empty) || layer.publicationTask) return;
	layer.publicationTask = job;
	const publish = () => {
		if (layer.publicationTask !== job) return;
		layer.publicationTask = null;
		if (layer.revisions?.[0] !== job || layer.previousFlip?.pendingCommit) return;
		if (layer.departing && (_rapierDrawState.gesture || _rapierDrawState.markerPress)) { setTimeout(() => _rapierPaintDrainRevisions(layer), 32); return; }
		try { _rapierPaintFinishRevision(layer, job.raster); }
		catch (error) { _rapierPaintNotKept(layer, error); job.reject(error); }
	};
	if (now) publish(); else _rapierPaintTask(publish);
}
function _rapierPaintFinishRevision(layer, raster, cancel = false) {
	const queue = layer.revisions || [];
	const job = queue[0] || (!queue.length ? layer.pendingCommit : null);
	if (!job) return;
	if (layer.publicationTask === job) layer.publicationTask = null;
	if (queue[0] === job) queue.shift();
	layer.revisions = queue;
	layer.pendingCommit = queue[0] || null;
	clearTimeout(job.timer);
	if (cancel && !queue.length) { _rapierPaintDropSnapshots(layer); try { job.worker.terminate(); } catch (_) {} try { URL.revokeObjectURL(job.url); } catch (_) {} layer.pngWorker = null; }
	try {
		if (_rapierDrawState.session !== job.session || !_rapierPaintRevisionLayers().includes(layer)) {
			_rapierPaintDropSnapshots(layer);
			for (const abandoned of queue) { clearTimeout(abandoned.timer); abandoned.resolve(); }
			queue.length = 0; layer.pendingCommit = null;
			if (layer.pngWorker) { layer.pngWorker.worker.terminate(); URL.revokeObjectURL(layer.pngWorker.url); layer.pngWorker = null; }
			const next = _rapierPaintRetireRevisionLayer(layer);
			if (next) _rapierPaintDrainRevisions(next);
			return;
		}
		if (job.shown) _rapierPaintKeepShown([{url: raster, shown: job.shown}]);
		const history=job.stroke?.histories?.find(h=>h.surfaceId===layer.surface.id)||job.stroke?.history;
		if(history&&job.history)history.after=job.history;
		const live = !layer.nextFlip && layer.surface?.revision === job.revision && !_rapierDrawState.gesture && !queue.length;
		if (job.empty) { if (live) _rapierPaintPublishEmpty(layer); }
		else if (live) _rapierPaintPublish(layer, job.keep, raster, job.custody, false, job.replay, job);
		else _rapierPaintPublishFrozen(layer, job, raster);
		if (layer.mode !== 'water' && job.capture && layer.checkpoint?.revision === job.revision && layer.checkpoint.raster === raster) layer.checkpoint.capture = job.capture;
	} catch (error) { job.failed = true; queue.unshift(job); layer.pendingCommit = job; layer.pendingOverflow = true; throw error; }
	finally { if (!queue.includes(job)) job.resolve(); }
	if (!queue.length && layer.nextFlip) {
		const next = _rapierPaintRetireRevisionLayer(layer);
		if (next) _rapierPaintDrainRevisions(next);
	} else _rapierPaintDrainRevisions(layer);
}
function _rapierPaintPublishFrozen(layer, job, raster) {
	const state = _rapierDrawState;
	if (!job.box || !job.place) throw new Error('The painting changed before its revision was kept');
	const built = _rapierPaintGeomOf(job.place, job.box);
	const geom = built.geom;
	const pw = built.pw, ph = built.ph, s = built.s;
	const existing = layer.id != null ? _rapierDrawShapeById(layer.id) : null;
	const stroke = job.stroke || layer.flipStroke;
	const history=stroke?.histories?.find(h=>h.surfaceId===layer.surface.id)||stroke?.history;
	if(history&&job.history)history.after=job.history;
	const joins = !!stroke?.entry && stroke.entry === state.undoStack.at(-1);
	const priorShift = joins ? state.undoStack.at(-1)?.shift : null;
	const replay = layer.mode === 'water' ? _rapierPaintWaterReplay(layer, job.waterCapture, job.box, job.waterSheet) : _rapierPaintReplayAt(layer, job.replay, job.box);
	_rapierDrawSnapshot(undefined, joins);
	if (layer.mode === 'water' && typeof _rapierWaterAdoptPaper === 'function') _rapierWaterAdoptPaper();
	const grown = !layer.frame && _rapierDrawGrowCanvas(geom.cx - geom.w / 2, geom.cy - geom.h / 2, geom.cx + geom.w / 2, geom.cy + geom.h / 2);
	state.paintLastGrown = grown || null;
	if (grown) { geom.cx += grown.dx; geom.cy += grown.dy; }
	if (replay) layer.paintReplay = replay;
	if (layer.mode === 'water') { layer.waterCapture = job.waterCapture; layer.waterSheet = job.waterSheet; }
	let shape = existing;
	if (shape) { shape.geom = geom; shape.raster = raster; shape.paint = _rapierPaintMetadata(layer, job.brushId, pw, ph, s, replay); }
	else {
		shape = { id: _rapierDrawNextId(), stroke: null, recognized: 'paint', asDrawn: false, brush: 'ink', style: null, geom, raster, paint: _rapierPaintMetadata(layer, job.brushId, pw, ph, s, replay) };
		state.recipe.shapes.push(shape);
		_rapierPaintChooseCreated(shape);
	}
	layer.id = shape.id; layer.raster = raster; layer.geom = JSON.stringify(geom);
	layer.checkpoint = {revision: job.revision, raster};
	const retired = !!layer.retire?.length;
	if (retired) {
		const gone = new Set(layer.retire);
		state.recipe.shapes = state.recipe.shapes.filter(row => row === shape || !gone.has(row.id));
		remapRefractionRecipeSources(state.recipe, new Map([...gone].map(id => [id, shape.id])));
		layer.retire = null;
	}
	if (grown || retired) _rapierDrawRenderAll(); else { _rapierDrawRenderShapes([shape.id]); _rapierDrawUpdateMenu(); }
	_rapierPaintReattachLive();
	_rapierPaintSealRevision(layer, stroke, priorShift, grown);
	_rapierPaintSyncPaper();
	if (layer.nextFlip) void _rapierPaintEncodeShapeLater(shape.id, raster, job.px, stroke);
}
function _rapierPaintFollowGrowth(layer, grown) {
	for (const current of _rapierPaintRevisionLayers()) {
		if (current.frame) { current.frame.c0[0] += grown.dx; current.frame.c0[1] += grown.dy; }
		else if (current.origin) { current.origin[0] += grown.dx; current.origin[1] += grown.dy; }
		for (const job of current.revisions || []) {
			const place = job.place;
			if (place?.frame) { place.frame.c0[0] += grown.dx; place.frame.c0[1] += grown.dy; }
			else if (place?.origin) { place.origin[0] += grown.dx; place.origin[1] += grown.dy; }
		}
		_rapierPaintPlaceLive(current);
	}
	const gesture = _rapierDrawState.gesture;
	if (gesture?.kind === 'paint' && gesture.paint && !gesture.paint.pending) gesture.paint.geom = _rapierDrawPointerGeometry();
}
function _rapierPaintFlushRevision(layer = _rapierPaintLayer(), keepWorker = false) {
	const layers = _rapierPaintRevisionLayers(layer);
	if (!layers.some(pending => pending.pendingLift || pending.pendingCommit)) return null;
	return _rapierPaintFlushLayers(layers, keepWorker);
}
async function _rapierPaintFlushLayers(layers, keepWorker = false) {
	for (const pending of layers) {
		_rapierPaintDropSnapshots(pending);
		const lift = pending.pendingLift;
		if (lift?.deciding) await lift.decided;
		_rapierPaintFlushLift(pending);
		if (keepWorker && pending.pngWorker && !pending.pendingCommit?.failed) {
			while (pending.pendingCommit) await pending.pendingCommit.promise;
			continue;
		}
		const owner = pending.pngWorker;
		if (owner) {
			owner.worker.onmessage = owner.worker.onerror = owner.worker.onmessageerror = null;
			try { owner.worker.terminate(); } catch (_) {}
			try { URL.revokeObjectURL(owner.url); } catch (_) {}
			pending.pngWorker = null;
		}
		while (pending.pendingCommit) {
			const job = pending.pendingCommit;
			if (job.read) await job.read;
			if (pending.pendingCommit !== job) continue;
			if (!job.raster && !job.empty) {
				if (!job.px) { _rapierPaintDropRevision(pending, job); continue; }
				try { job.raster = _rapierPaintPNG.encode(job.px); }
				catch (error) { _rapierPaintDropRevision(pending, job, error); throw error; }
			}
			try { _rapierPaintFinishRevision(pending, job.raster); }
			catch (error) { job.reject(error); throw error; }
		}
	}
}



function _rapierPaintLayer() { return _rapierDrawState.paintLayer || null; }
// never under the base scale, never above RAPIER_PAINT_SCALE_MAX, and reduced until the surface
function _rapierPaintLayerScale() {
	const state = _rapierDrawState, recipe = state.recipe, svg = state.svgRoot;
	let scale = RAPIER_PAINT_SCALE;
	if (svg) {
		const t = _rapierDrawViewTransform(svg.getBoundingClientRect(), svg.viewBox.baseVal);
		scale = _rapierDrawClamp(Math.ceil(t.scale * (globalThis.devicePixelRatio || 1) - 0.05), RAPIER_PAINT_SCALE, RAPIER_PAINT_SCALE_MAX);
	}
	while (scale > 1 && recipe.canvas.w * recipe.canvas.h * scale * scale > RAPIER_PAINT_AREA_MAX) scale--;
	return scale;
}
function _rapierPaintEligiblePaint(shape) {
	return !!shape && shape.recognized === 'paint' && !shape.locked && !!shape.raster && !!shape.geom && !!_rapierPaintTargetFrame(shape);
}
function _rapierPaintChooseCreated(shape) {
	const chosen = _rapierDrawShapeById(_rapierDrawState.paintChosenId);
	if (_rapierPaintEligiblePaint(chosen) && (chosen.paint?.mode === 'water') !== (shape.paint?.mode === 'water')) {
		_rapierDrawSetSelection([shape.id]); _rapierDrawSetSelection([]);
	}
}
function _rapierPaintTarget(mode = _rapierPaintMode()) {
	const state = _rapierDrawState;
	const accepts = shape => _rapierPaintEligiblePaint(shape) && (shape.paint?.mode === 'water' ? 'water' : 'paint') === mode;
	if (state.paintChosenId != null) {
		const shape = _rapierDrawShapeById(state.paintChosenId);
		if (accepts(shape)) return shape;
		if (_rapierPaintEligiblePaint(shape)) return null;
		state.paintChosenId = null;
	}
	const shapes = state.recipe?.shapes || [];
	for (let i = shapes.length - 1; i >= 0; i--) if (accepts(shapes[i])) return shapes[i];
	return null;
}
function _rapierPaintTargetFrame(shape) {
	const g = shape.geom, px = shape.paint?.px, scale = shape.paint?.scale;
	if (!g || !Array.isArray(px) || px.length !== 2 || !(scale > 0)) return null;
	const pw = px[0], ph = px[1];
	if (!(pw > 0) || !(ph > 0)) return null;
	const corners = g.p ? g.p.map(p => [p[0], p[1]]) : _rapierDrawRectPolygon(g.cx, g.cy, g.w, g.h, g.rot || 0);
	if (corners.length !== 4) return null;
	const [c0, c1, , c3] = corners;
	if (![c0, c1, c3].every(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))) return null;
	const eux = (c1[0] - c0[0]) / pw, euy = (c1[1] - c0[1]) / pw, evx = (c3[0] - c0[0]) / ph, evy = (c3[1] - c0[1]) / ph;
	if (![eux, euy, evx, evy].every(Number.isFinite)) return null;
	return { pw, ph, scale, c0, eux, euy, evx, evy };
}
function _rapierPaintFrameIsSimple(frame) {
	const u = 1 / frame.scale, tol = u * 1e-6;
	return Math.abs(frame.eux - u) <= tol && Math.abs(frame.euy) <= tol && Math.abs(frame.evx) <= tol && Math.abs(frame.evy - u) <= tol;
}
function _rapierPaintFramePad(pw, ph, scale) {
	let pad = Math.round(Math.max(pw, ph, 64 * scale) * 0.35);
	pad = Math.min(pad, Math.round(400 * scale));
	while (pad > 0 && (pw + 2 * pad) * (ph + 2 * pad) > RAPIER_PAINT_AREA_MAX * 2) pad -= Math.max(1, Math.round(pad * 0.1));
	return Math.max(0, pad);
}
const RAPIER_PAINT_REACH_FRINGE = 48;
function _rapierPaintTargetKey(shape) { return shape.id + ':' + (shape.raster ? _rapierPaintDigest(shape.raster) : '0') + ':' + JSON.stringify(shape.geom); }
function _rapierPaintMemberKey(shape) {
	const px = shape?.paint?.px;
	return _rapierPaintTargetKey(shape) + '|' + (Array.isArray(px) ? px.join('x') : '?') + '|' + (shape?.paint?.scale ?? '?')
		+ '|' + (shape?.paint?.group ?? '?') + '|' + JSON.stringify(shape?.effect || null) + '|' + (_rapierPaintEligiblePaint(shape) ? '1' : '0');
}
function _rapierPaintGroupMembers(target, frame) {
	const state = _rapierDrawState;
	if (!target || target.paint?.group == null || !frame || !_rapierPaintFrameIsSimple(frame)) return [];
	return (state.recipe?.shapes || []).filter(shape => shape.id !== target.id && shape.recognized === 'paint' && shape.paint?.group === target.paint.group && shape.raster && _rapierPaintEligiblePaint(shape))
		.filter(shape => JSON.stringify(shape.effect || null) === JSON.stringify(target.effect || null))
		.filter(shape => { const f = _rapierPaintTargetFrame(shape); return f && _rapierPaintFrameIsSimple(f) && Math.abs(f.scale - frame.scale) < 1e-6; });
}
function _rapierPaintGroupKey(target, members) {
	return [target, ...members].map(_rapierPaintMemberKey).join(';');
}
function _rapierPaintWaterTargetUnion(target, frame, members) {
	let x0 = 0, y0 = 0, x1 = frame.pw, y1 = frame.ph;
	for (const shape of members) {
		const other = _rapierPaintTargetFrame(shape), x = Math.round((other.c0[0] - frame.c0[0]) * frame.scale), y = Math.round((other.c0[1] - frame.c0[1]) * frame.scale);
		x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + other.pw); y1 = Math.max(y1, y + other.ph);
	}
	if (!members.length && globalThis.RapierDrawAgentPaint.waterPaintingIsLive(target, _rapierWaterSession())) {
		const replay = target.paint.replay, entry = replay.entries.at(-1);
		if (entry?.actor === 'human' && !replay.views?.some(view => view.at === replay.entries.length)) {
			x0 = Math.min(x0, -entry.crop[0]); y0 = Math.min(y0, -entry.crop[1]);
			x1 = Math.max(x1, entry.sheet.width - entry.crop[0]); y1 = Math.max(y1, entry.sheet.height - entry.crop[1]);
		}
	}
	return {x0:frame.c0[0]+x0/frame.scale, y0:frame.c0[1]+y0/frame.scale, w:(x1-x0)/frame.scale, h:(y1-y0)/frame.scale};
}
function _rapierPaintLayerValid(forMaterialTool = false, geom = null, mode = _rapierPaintMode()) {
	const layer = _rapierPaintLayer(), state = _rapierDrawState;
	if (!layer || layer.mode !== mode || layer.session !== state.session || !layer.surface || layer.surface.failure || layer.surface.gone) return false;
	if (layer.warmView && (state.recipe.shapes.length || state.recipe.strokes.length || layer.warmView !== _rapierPaintWarmView(geom || undefined))) return false;
	if (layer.id == null) return !(forMaterialTool && _rapierPaintTarget(mode) && !layer.surface.bounds());
	const target = _rapierPaintTarget(mode);
	if (!target || target.id !== layer.id) return false;
	return target.raster === layer.raster && JSON.stringify(target.geom) === layer.geom;
}
function _rapierPaintCloseLayer(current = null) {
	const departing = _rapierPaintDeparting();
	if (departing) return departing.then(() => _rapierPaintCloseLayer(current));
	const state = _rapierDrawState, layer = _rapierPaintLayer(), session = state.session;
	const owns = () => state.session === session && _rapierPaintLayer() === layer && (!current || current());
	return _rapierPaintAfter(_rapierPaintFlushRevision(layer, true), () => _rapierPaintCloseNow(false, owns));
}
function _rapierPaintLeaveForHistory(current) {
	const departing = _rapierPaintDeparting();
	if (departing) return departing.then(() => current() ? _rapierPaintLeaveForHistory(current) : false);
	const state = _rapierDrawState, layer = state.paintLayer;
	if (!layer) return null;
	const live = () => current() && state.paintLayer === layer && !state.gesture && !state.markerPress;
	return _rapierPaintAfter(_rapierPaintFlushRevision(layer, true), () => {
		if (!live()) return false;
		const surface = layer.surface, again = () => live() ? _rapierPaintLeaveForHistory(current) : false;
		if (surface && !surface.settled && !surface.failure) return surface.sync().then(again, again);
		if (layer.pendingLift || layer.pendingCommit || layer.previousFlip?.pendingCommit || layer.dryFinishing || layer.pendingOverflow) return _rapierPaintCloseLayer(live);
		if (surface?._wetWork) return new Promise(ok => (layer.wetWaiters = layer.wetWaiters || []).push(ok)).then(again);
  if(layer.flipStroke?.entry && surface.revision!==layer.checkpoint?.revision)
   return _rapierPaintEncodeRevision(layer,false,{peek:true}).promise.then(again);
		_rapierPaintDropSnapshots(layer); _rapierPaintDropNextSheet(layer); _rapierPaintFinishClose(layer);
		return null;
	});
}
function _rapierPaintCloseNow(synced = false, current = null) {
	if (current && !current()) return false;
	const state = _rapierDrawState, layer = state.paintLayer, session = state.session;
	if (!synced && layer?.surface && !layer.surface.settled && !layer.surface.failure) return layer.surface.sync().then(() => _rapierPaintCloseNow(true, current), () => _rapierPaintCloseNow(true, current));
	_rapierPaintDropSnapshots(layer);
	_rapierPaintDropNextSheet(layer);
	if ((layer?.pendingOverflow || layer?.surface?.wetState || layer?.dryFinishing) && !state.paintClosing) {
		if (current) {
			const pending = _rapierPaintFlushRevision(layer, true);
			if (pending) return pending.then(() => _rapierPaintCloseNow(false, current));
		}
		const closing = {layer}; state.paintClosing = closing;
		const release = () => { if (state.session === session && state.paintClosing === closing) state.paintClosing = false; };
		const failed = error => { release(); if (state.session === session && state.paintLayer === layer && (!current || current()) && !_rapierPaintLossSaid(error)) showToast('The painting could not be kept. It is still open: ' + String(error?.message || error), 'error'); throw error; };
		let kept;
		try { kept = _rapierPaintCommit(true, null, false, current); }
		catch (error) { return failed(error); }
		return Promise.resolve(kept).then(() => { release(); if (state.session !== session || state.paintLayer !== layer || current && !current()) return false; _rapierPaintFinishClose(layer); }, failed);
	}
	_rapierPaintFinishClose(layer);
	return null;
}
function _rapierPaintFinishClose(layer) {
	const state = _rapierDrawState;
	state.paintLayer = null;
	if (state.paintSetting?.layer === layer) { state.paintSetting = false; _rapierPaintUpdateStrip(); }
	if (layer?.pngWorker) { layer.pngWorker.worker.terminate(); URL.revokeObjectURL(layer.pngWorker.url); layer.pngWorker = null; }
	if (layer?.raf) cancelAnimationFrame(layer.raf);
	if (layer?.holdRaf) cancelAnimationFrame(layer.holdRaf);
	if (layer?.dryRaf) cancelAnimationFrame(layer.dryRaf);
	const leave = () => {
		if (layer?.mount) layer.mount.remove();
		if (layer?.id != null && state.svg && state.paintLayer?.id !== layer.id) state.svg.querySelector('[data-shape-id="' + layer.id + '"]')?.removeAttribute('data-paint-live');
		if (layer && state.gesture?.paintRollback?.layer !== layer) _rapierPaintReleaseSurface(layer);
		_rapierPaintSweepBrushes();
	};
	const node = () => layer?.id != null ? state.svg?.querySelector('[data-shape-id="' + layer.id + '"]') : null;
	const under = layer?.mode === 'water' && layer.gpuDisplay && layer.canvas?.style.visibility !== 'hidden' && !!node();
	const decoded = layer?.decoding?.promise || (under ? _rapierPaintHandBack(layer, [layer.id]) : null);
	if (!under) { if (decoded) decoded.then(leave); else leave(); return; }
	let gone = false;
	const once = () => { if (gone) return; gone = true; _rapierPaintClosing.delete(layer); leave(); };
	_rapierPaintClosing.set(layer, once);
	Promise.resolve(decoded).then(() => {
		if (gone) return;
		if (!layer.mount?.isConnected || state.paintLayer?.id === layer.id) { once(); return; }
		node()?.setAttribute('data-paint-live', 'under');
		requestAnimationFrame(() => requestAnimationFrame(once));
	}, once);
}
const _rapierPaintClosing = new Map();
function _rapierPaintSettleClosing() {
	for (const [layer, leave] of [..._rapierPaintClosing]) if (_rapierDrawShapeById(layer.id)?.raster !== layer.raster) leave();
}
function _rapierPaintReleaseSurface(layer) {
	const surface = layer?.surface;
	if (!surface) return;
	if (layer.mode === 'water' && layer.gpuDisplay) { try { layer.canvas?.getContext('bitmaprenderer')?.transferFromImageBitmap(null); } catch (_) {} }
	try { surface.drop(); } catch (_) {}
}
function _rapierPaintSweepBrushes(keep = _rapierDrawState.gesture?.paint?.brush || null) {
	const set = _rapierDrawState.paintBrushes;
	if (!set) return;
	for (const brush of [...set]) if (brush !== keep && brush !== _rapierPaintLayer()?.brush && !brush.inStroke) { set.delete(brush); try { brush.drop(); } catch (_) {} }
}
function _rapierPaintMountLive(canvas, atShapeId) {
	const mount = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
	mount.setAttribute('x', '0'); mount.setAttribute('y', '0');
	mount.style.overflow = 'visible';
	if (canvas.getAttribute?.('data-water') != null) mount.setAttribute('data-water', '');
	canvas.style.display = 'block';
	mount.appendChild(canvas);
	_rapierPaintPositionMount(mount, atShapeId);
	return mount;
}
function _rapierPaintPositionMount(mount, id) {
	const host = _rapierDrawState.svg, at = id != null ? host?.querySelector('[data-shape-id="' + id + '"]') : null;
	const parent = at ? at.parentNode : host?.querySelector('[data-rapier-effect-scene]') || host;
	if (at ? at.nextSibling !== mount : parent && (mount.parentNode !== parent || parent.lastChild !== mount)) { if (at) at.after(mount); else parent?.appendChild(mount); }
	const shape = id != null ? _rapierDrawShapeById(id) : null;
	if (shape?.opacity != null && !mount.closest('[data-rapier-effect-layer]')) mount.setAttribute('opacity', String(shape.opacity));
	else mount.removeAttribute('opacity');
}
function _rapierPaintReattachLive() {
	for (const layer of _rapierPaintRevisionLayers()) {
		if (!layer.mount || !layer.canvas) continue;
		_rapierPaintPositionMount(layer.mount, layer.id);
		_rapierPaintShowLive(layer.liveWanted ?? layer.canvas.style.visibility !== 'hidden', layer);
	}
}
const RAPIER_PAINT_EDGE_PAD = 56;
function _rapierPaintStageUnion(recipe, pad = RAPIER_PAINT_EDGE_PAD) {
	const state = _rapierDrawState, svg = state.svgRoot;
	let x0 = 0, y0 = 0, x1 = recipe.canvas.w, y1 = recipe.canvas.h;
	const frame = state.resize?.frame || recipe.frame;
	if (frame) { x0 = Math.min(x0, Math.floor(frame.x)); y0 = Math.min(y0, Math.floor(frame.y)); x1 = Math.max(x1, Math.ceil(frame.x + frame.w)); y1 = Math.max(y1, Math.ceil(frame.y + frame.h)); }
	if (svg) {
		const rect = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
		if (rect.width && rect.height && vb.width && vb.height) {
			const a = _rapierDrawMapPoint(0, 0, rect, vb), b = _rapierDrawMapPoint(innerWidth, innerHeight, rect, vb);
			x0 = Math.min(x0, Math.floor(a[0])); y0 = Math.min(y0, Math.floor(a[1])); x1 = Math.max(x1, Math.ceil(b[0])); y1 = Math.max(y1, Math.ceil(b[1]));
		}
	}
	return { x0: x0 - pad, y0: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}
function _rapierPaintBlankSheet(w, h, scale, prepared = null, mode = _rapierPaintMode(), material = null, waterMaterial = null) {
	const remote = _rapierPaintRemoteNow(mode);
	if (!remote) throw new Error('The painter is not ready');
	const restoredCanvas = waterMaterial ? _rapierPaintBlankCanvas(w, h, prepared, mode) : null;
	const surface = remote.surface(w, h, mode === 'water' ? {mode: 'water', pixelScale: scale, paper: _rapierWaterState().paper, waterSession: _rapierWaterSession(), trackedGrowth: true, ...material} : {wet: RAPIER_PAINT_WET, trackedGrowth: true}, waterMaterial ? {...waterMaterial, display:!!restoredCanvas.ctx} : null);
	if (mode !== 'water') { surface.set('paper', RAPIER_PAINT_PAPER); surface.set('scale', scale / RAPIER_PAINT_GRAIN); }
	const {canvas, ctx} = restoredCanvas || _rapierPaintBlankCanvas(w, h, prepared, mode);
	if (!ctx) surface.bindDisplay(mode === 'water' ? new OffscreenCanvas(w, h) : canvas.transferControlToOffscreen()).catch(() => {});
	return {surface, canvas, ctx};
}
function _rapierPaintBlankCanvas(w, h, prepared = null, mode = 'paint') {
	const canvas = prepared?.canvas || document.createElement('canvas');
	canvas.className = 'rapier-draw-paint-live';
	if (mode === 'water') canvas.setAttribute('data-water', '');
	if (canvas.width !== w) canvas.width = w;
	if (canvas.height !== h) canvas.height = h;
	canvas.setAttribute('aria-hidden', 'true');
	if (mode === 'water' && typeof OffscreenCanvas === 'function') {
		if (!canvas.getContext('bitmaprenderer')) throw new Error('Water could not create its bitmap display');
		return {canvas, ctx:null};
	}
	if (typeof canvas.transferControlToOffscreen === 'function') return {canvas, ctx:null};
	const ctx = prepared?.ctx || canvas.getContext('2d');
	ctx.putImageData(new ImageData(1, 1), 0, 0);
	return {canvas, ctx};
}
function _rapierPaintOpenLayer(scale = _rapierPaintLayerScale(), atShapeId = null, emptyUnion = null, prepared = null, mode = _rapierPaintMode(), material = null, waterMaterial = null) {
	const state = _rapierDrawState, recipe = state.recipe;
	_rapierPaintCloseLayer();
	let union = emptyUnion || _rapierPaintStageUnion(recipe);
	if (mode === 'water' && !emptyUnion && !waterMaterial) while (scale > 1 && union.w * union.h * scale * scale > RAPIER_WATER_SHEET_PIXELS) scale--;
	let w = Math.max(1, Math.round(union.w * scale)), h = Math.max(1, Math.round(union.h * scale));
	if (!emptyUnion && w * h > RAPIER_PAINT_AREA_MAX * 2) {
		union = { x0: -RAPIER_PAINT_EDGE_PAD, y0: -RAPIER_PAINT_EDGE_PAD, w: recipe.canvas.w + RAPIER_PAINT_EDGE_PAD * 2, h: recipe.canvas.h + RAPIER_PAINT_EDGE_PAD * 2 };
		w = Math.max(1, Math.round(union.w * scale)); h = Math.max(1, Math.round(union.h * scale));
	}
	if (!emptyUnion && w * h > RAPIER_PAINT_AREA_MAX * 2) { union = { x0: 0, y0: 0, w: recipe.canvas.w, h: recipe.canvas.h }; w = Math.max(1, Math.round(union.w * scale)); h = Math.max(1, Math.round(union.h * scale)); }
	if (w * h > RAPIER_PAINT_AREA_MAX * 2) throw new Error('Canvas is too large to paint on');
	if (mode === 'water' && typeof _rapierWaterPaperFrame === 'function') material = {...material, ..._rapierWaterPaperFrame(union.x0 * scale, union.y0 * scale, h, scale)};
	const initial = waterMaterial ? {replay:waterMaterial.replay, session:waterMaterial.session, offset:[Math.round((waterMaterial.origin[0] - union.x0) * scale), Math.round((waterMaterial.origin[1] - union.y0) * scale)]} : null;
	const {surface, canvas, ctx} = _rapierPaintBlankSheet(w, h, scale, prepared, mode, material, initial);
	canvas.style.visibility = atShapeId == null ? '' : 'hidden';
	const mount = _rapierPaintMountLive(canvas, atShapeId);
	if (!Object.getOwnPropertyDescriptor(state.surface, 'rapierPaintFacts')) Object.defineProperty(state.surface, 'rapierPaintFacts', { enumerable: false, get: _rapierPaintFacts });
	surface.tilt(_rapierPaintTilt.gx, _rapierPaintTilt.gy); _rapierPaintTiltOn();
	const layer = { mode, gpuDisplay:!ctx, displayReady:!!ctx, liveWanted:!ctx ? atShapeId == null : undefined, waterPaper: mode === 'water' ? _rapierWaterState().paper : null, session: state.session, surface, canvas, mount, ctx, scale, id: null, raster: null, geom: null, brush: null, brushId: null, raf: 0, holdRaf: 0, dryRaf: 0, dryAt: 0, frame: null, origin: [union.x0, union.y0], setPending: true, liveBox: null };
	surface.display = reply => _rapierPaintDisplay(layer, reply);
	state.paintLayer = layer;
	if (layer.gpuDisplay) _rapierPaintShowLive(layer.liveWanted,layer);
	_rapierPaintWatchOverlay(layer);
	_rapierPaintPlaceLive();
	return layer;
}
function _rapierPaintOpenLocalLayer(frame, atShapeId = null, mode = _rapierPaintMode(), waterMaterial = null) {
	const state = _rapierDrawState;
	_rapierPaintCloseLayer();
	const pad = _rapierPaintFramePad(frame.pw, frame.ph, frame.scale);
	const w = Math.max(1, Math.round(frame.pw + pad * 2)), h = Math.max(1, Math.round(frame.ph + pad * 2));
	if (w * h > RAPIER_PAINT_AREA_MAX * 2) throw new Error('Painting is too large to reopen for painting');
	const initial = waterMaterial ? {replay:waterMaterial.replay, session:waterMaterial.session, offset:[pad,pad]} : null;
	const {surface, canvas, ctx} = _rapierPaintBlankSheet(w, h, frame.scale, null, mode, mode === 'water' && typeof _rapierWaterPaperFrame === 'function' ? {..._rapierWaterPaperFrame(0, 0, h, frame.scale), paperOrigin: [0, 0]} : null, initial);
	canvas.style.visibility = 'hidden';
	const mount = _rapierPaintMountLive(canvas, atShapeId);
	if (!Object.getOwnPropertyDescriptor(state.surface, 'rapierPaintFacts')) Object.defineProperty(state.surface, 'rapierPaintFacts', { enumerable: false, get: _rapierPaintFacts });
	surface.tilt(_rapierPaintTilt.gx, _rapierPaintTilt.gy); _rapierPaintTiltOn();
	const layer = { mode, gpuDisplay:!ctx, displayReady:!!ctx, liveWanted:!ctx ? false : undefined, waterPaper: mode === 'water' ? _rapierWaterState().paper : null, session: state.session, surface, canvas, mount, ctx, scale: frame.scale, id: null, raster: null, geom: null, brush: null, brushId: null, raf: 0, holdRaf: 0, dryRaf: 0, dryAt: 0, frame: { ...frame, pad }, setPending: true, liveBox: null };
	surface.display = reply => _rapierPaintDisplay(layer, reply);
	state.paintLayer = layer;
	_rapierPaintWatchOverlay(layer);
	_rapierPaintPlaceLive();
	return layer;
}
function _rapierPaintPlaceLive(layer = _rapierDrawState.paintLayer) {
	if (!layer?.mount || !layer.canvas) return;
	const mount = layer.mount, canvas = layer.canvas, display = layer.gpuDisplay ? layer.displayMeta : null;
	const w = display?.width ?? canvas.width, h = display?.height ?? canvas.height;
	mount.setAttribute('width', w); mount.setAttribute('height', h);
	canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
	const f = layer.frame;
	const matrix = f
		? [f.eux, f.euy, f.evx, f.evy, f.c0[0] - f.pad * f.eux - f.pad * f.evx, f.c0[1] - f.pad * f.euy - f.pad * f.evy]
		: [1 / layer.scale, 0, 0, 1 / layer.scale, layer.origin?.[0] || 0, layer.origin?.[1] || 0];
	if (display) {
		const dx = display.toothOX - layer.surface.toothOX, dy = display.toothOY - layer.surface.toothOY;
		matrix[4] += dx * matrix[0] + dy * matrix[2]; matrix[5] += dx * matrix[1] + dy * matrix[3];
	}
	mount.setAttribute('transform', 'matrix(' + matrix.map(n => (Number.isFinite(n) ? n : 0)).join(',') + ')');
}
function _rapierPaintWatchOverlay(layer) {
	const canvas = layer.canvas;
	canvas.addEventListener('contextlost', () => { if (layer.canvas !== canvas) return; layer.lost = true; _rapierPaintShowLive(layer.liveWanted ?? canvas.style.visibility !== 'hidden', layer); });
	canvas.addEventListener('contextrestored', () => {
		if (layer.canvas !== canvas) return;
		const wanted = layer.liveWanted ?? canvas.style.visibility !== 'hidden';
		layer.lost = false;
		if (_rapierDrawState.paintLayer !== layer) return;
		if (layer.gpuDisplay) layer.displayReady = false;
		_rapierPaintRepaintAll(layer);
		_rapierPaintShowLive(wanted, layer);
	});
}
function _rapierPaintOverlayLost(layer) { return !!layer?.lost || !!layer?.ctx?.isContextLost?.(); }
function _rapierPaintRecordLiveBox(layer, box) {
	const material = layer.surface.growBox;
	if (material === null) return;
	if (material) {
		box = {x0: Math.max(box.x0, material.x0), y0: Math.max(box.y0, material.y0), x1: Math.min(box.x1, material.x1), y1: Math.min(box.y1, material.y1)};
		if (box.x1 < box.x0 || box.y1 < box.y0) return;
	}
	const b = layer.liveBox;
	if (b) { b.x0 = Math.min(b.x0, box.x0); b.y0 = Math.min(b.y0, box.y0); b.x1 = Math.max(b.x1, box.x1); b.y1 = Math.max(b.y1, box.y1); }
	else layer.liveBox = {...box};
}
function _rapierPaintReplaceDisplay(layer, meta) {
	const surface = layer.surface;
	if (surface.gone || layer.pendingDisplay?.generation === surface.displayGeneration) return;
	layer.pendingDisplay?.canvas.remove();
	const {canvas} = _rapierPaintBlankCanvas(meta.width, meta.height, null, layer.mode);
	canvas.style.visibility = 'hidden';
	layer.pendingDisplay = {canvas, generation: surface.displayGeneration + 1};
	surface.bindDisplay(canvas.transferControlToOffscreen(), layer.canvasGeneration || 0).catch(() => {});
}
function _rapierPaintDisplay(layer, reply) {
	const canvas = layer.canvas, meta = reply.meta, patch = reply.patch;
	if (!canvas || layer.surface?.gone) { reply.display?.bitmap?.close(); return; }
	if (layer.gpuDisplay && layer.mode === 'water') { _rapierPaintWaterFrame(layer, reply); return; }
	if (layer.gpuDisplay) {
		const display = reply.display;
		if (display?.generation !== layer.surface.displayGeneration) return;
		if (display.lost) { layer.lost = true; _rapierPaintShowLive(layer.liveWanted,layer); return; }
		if (display.replace) { _rapierPaintReplaceDisplay(layer, meta); return; }
		if (!display.submitted) return;
		const pending = layer.pendingDisplay;
		let swapped = false;
		if (pending?.generation === display.canvasGeneration) {
			pending.reply = reply;
			if (!pending.ready) { _rapierPaintAwaitFrame(layer, pending, pending.canvas, true); return; }
			pending.canvas.style.opacity = ''; pending.canvas.style.visibility = 'hidden';
			canvas.remove(); layer.canvas = pending.canvas; layer.pendingDisplay = null; swapped = true;
			_rapierPaintWatchOverlay(layer);
		} else if (layer.canvasGeneration && layer.canvasGeneration !== display.canvasGeneration) return;
		else if (!layer.canvasGeneration && layer.id != null) {
			const first = layer.firstDisplay ??= {generation: display.canvasGeneration};
			first.reply = reply;
			if (!first.ready) { _rapierPaintAwaitFrame(layer, first, canvas, false); return; }
			canvas.style.opacity = ''; layer.firstDisplay = null;
		}
		const was = layer.displayMeta, moved = swapped || !was || ['width','height','toothOX','toothOY'].some(key => was[key] !== meta[key]);
		layer.canvasGeneration = display.canvasGeneration;
		layer.displayMeta = {...meta}; layer.displayReady = true; layer.lost = false; layer.liveBox = null;
		if (meta.bounds) _rapierPaintRecordLiveBox(layer,meta.bounds);
		if (moved || layer.mode === 'water') _rapierPaintPlaceLive(layer);
		_rapierPaintShowLive(layer.liveWanted,layer);
		if (swapped) _rapierPaintAdoptAfterSwap(layer, layer.surface, display.canvasGeneration);
		else if (layer.adoptWait !== display.canvasGeneration) layer.surface.adoptDisplay(display.canvasGeneration);
		if (layer.setPending) { layer.setPending = false; _rapierPaintAfterFrame(_rapierPaintSyncSet); }
		if (meta.bounds && _rapierPaintFrameReadable === null) _rapierPaintLearnReadback(layer, layer.canvas, meta.bounds);
		return;
	}
	if (canvas.width !== meta.width || canvas.height !== meta.height) {
		const whole = patch && patch.box.x0 === 0 && patch.box.y0 === 0 && patch.box.x1 === meta.width - 1 && patch.box.y1 === meta.height - 1;
		if (!whole) { _rapierPaintRepaintAll(layer); return; }
		canvas.width = meta.width; canvas.height = meta.height;
		layer.liveBox = null;
		_rapierPaintPlaceLive(layer);
	}
	if (patch) {
		layer.ctx.putImageData(new ImageData(patch.data, patch.width, patch.height), patch.box.x0, patch.box.y0);
		_rapierPaintRecordLiveBox(layer, patch.box);
	}
	if (layer.setPending) { layer.setPending = false; _rapierPaintAfterFrame(_rapierPaintSyncSet); }
	const timing = _rapierDrawState.paintTiming;
	if (timing && timing.seat && !timing.blit) timing.blit = performance.now();
}
function _rapierPaintWaterFrame(layer, reply) {
	const surface = layer.surface, display = reply.display, bitmap = display?.bitmap, meta = reply.meta;
	if (!bitmap) return;
	let accepted = false;
	try {
		if (!display.complete || display.generation !== surface.displayGeneration || reply.surfaceId !== surface.id ||
			!Number.isSafeInteger(display.frame) || display.frame <= (layer.displayFrame || 0) || display.revision !== meta.revision ||
			bitmap.width !== meta.width || bitmap.height !== meta.height || display.width !== meta.width || display.height !== meta.height ||
			_rapierPaintOverlayLost(layer)) return;
		const kept = layer.checkpoint;
		if (layer.raster && (!meta.revision || kept?.raster === layer.raster && meta.revision < kept.revision)) return;
		const canvas = layer.canvas, context = canvas.getContext('bitmaprenderer');
		if (!context) return;
		if (canvas.width !== meta.width) canvas.width = meta.width;
		if (canvas.height !== meta.height) canvas.height = meta.height;
		try { context.transferFromImageBitmap(bitmap); } catch (_) { return; }
		accepted = true;
		layer.canvasGeneration = display.canvasGeneration; layer.displayFrame = display.frame;
		layer.displayMeta = {...meta}; layer.displayReady = true; layer.lost = false; layer.liveBox = null;
		if (meta.bounds) _rapierPaintRecordLiveBox(layer, meta.bounds);
		_rapierPaintPlaceLive(layer); _rapierPaintShowLive(layer.liveWanted, layer);
		if (layer.setPending) { layer.setPending = false; _rapierPaintAfterFrame(_rapierPaintSyncSet); }
	} finally {
		if (RAPIER_WATER_CAPTURE) _rapierWaterNote({ev: 'frame', frame: display.frame, accepted, shown: layer.displayFrame, revision: display.revision, meta: meta.revision, kept: layer.checkpoint?.revision ?? null, generation: display.generation, current: surface.displayGeneration, complete: !!display.complete, canvas: [layer.canvas?.width, layer.canvas?.height]});
		bitmap.close(); surface.adoptDisplay(display.canvasGeneration, display.frame, accepted);
	}
}
// while its replacement stands at 1%. The swap is adopted once the page has drawn RAPIER_PAINT_ADOPT_FRAMES frames since it.
const RAPIER_PAINT_ADOPT_FRAMES = 3;
function _rapierPaintAdoptAfterSwap(layer, surface, canvasGeneration) {
	let frames = 0;
	layer.adoptWait = canvasGeneration;
	const look = () => {
		if (layer.adoptWait !== canvasGeneration) return;
		if (layer.surface !== surface || surface.gone) { layer.adoptWait = null; return; }
		if (++frames < RAPIER_PAINT_ADOPT_FRAMES) { requestAnimationFrame(look); return; }
		layer.adoptWait = null;
		surface.adoptDisplay(canvasGeneration);
	};
	requestAnimationFrame(look);
}
const RAPIER_WATER_STATS = typeof location !== 'undefined' && new URLSearchParams(location.search).has('waterstats');
const _rapierWaterStats = {frames: 0, last: null, at: 0, publication: null, el: null, timer: 0};
function _rapierWaterStatsTick() {
	const stats = _rapierWaterStats, state = _rapierDrawState;
	const stage = state.open && _rapierDrawTool() === 'water' ? state.surface?.querySelector('.rapier-draw-stage') : null;
	if (!stage) { stats.el?.remove(); stats.el = null; return; }
	if (!stats.el || !stats.el.isConnected) {
		stats.el = document.createElement('div'); stats.el.className = 'rapier-draw-water-stats'; stats.el.setAttribute('aria-hidden', 'true');
		stage.appendChild(stats.el);
	}
	const now = performance.now(), seconds = stats.at ? (now - stats.at) / 1000 : 0, meta = _rapierPaintLayer()?.surface?.meta, timing = meta?.timing || null, last = stats.last;
	const fps = seconds ? stats.frames / seconds : 0;
	const rows = ['page ' + fps.toFixed(0) + ' fps'];
	if (timing && last && seconds) {
		const presents = timing.presents - last.presents, per = n => presents > 0 ? (n / presents).toFixed(1) + ' ms' : '-';
		rows.push('shown ' + (presents / seconds).toFixed(0) + ' /s');
		rows.push('worker ' + per(timing.busy - last.busy));
		const gpuFrames = timing.gpuFrames - last.gpuFrames;
		rows.push('gpu ' + (gpuFrames > 0 ? ((timing.gpu - last.gpu) / gpuFrames).toFixed(1) + ' ms' : '-') + (timing.stampBuffers > last.stampBuffers ? ' · ' + per(timing.stamp - last.stamp) + (timing.stampSkipped > last.stampSkipped ? '+' : '') : ''));
	} else rows.push('shown -', 'worker -', 'gpu -');
	const sim = meta?.stats?.simulation;
	rows.push('sheet ' + (meta ? meta.width + '×' + meta.height : '-') + (sim ? ' · sim ' + sim[0] + '×' + sim[1] : ''));
	rows.push('publish ' + (stats.publication == null ? '-' : Math.round(stats.publication) + ' ms'));
	stats.el.textContent = rows.join('\n');
	stats.frames = 0; stats.at = now; stats.last = timing ? {...timing} : null;
}
function _rapierWaterStatsStart() {
	_rapierWaterCaptureStart();
	if (!RAPIER_WATER_STATS || _rapierWaterStats.timer) return;
	globalThis.__rapierWaterStats = _rapierWaterStats;
	const count = () => { _rapierWaterStats.frames++; requestAnimationFrame(count); };
	requestAnimationFrame(count);
	_rapierWaterStats.timer = setInterval(_rapierWaterStatsTick, 250);
}
const RAPIER_WATER_CAPTURE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('water-capture');
const _rapierWaterCapture = {rows: [], on: false, live: ''};
function _rapierWaterNote(row) {
	const rows = _rapierWaterCapture.rows;
	rows.push({t: Math.round((performance.timeOrigin + performance.now()) * 10) / 10, ...row});
	if (rows.length > 4096) rows.shift();
}
function _rapierWaterCaptureStart() {
	if (!RAPIER_WATER_CAPTURE || _rapierWaterCapture.on) return;
	_rapierWaterCapture.on = true;
	const size = ev => _rapierWaterNote({ev, visibility: document.visibilityState, view: [innerWidth, innerHeight], dpr: devicePixelRatio});
	size('page'); addEventListener('resize', () => size('resize')); document.addEventListener('visibilitychange', () => size('visibility'));
	let last = 0;
	const frame = now => { if (last && now - last > 34) _rapierWaterNote({ev: 'gap', ms: Math.round(now - last)}); last = now; requestAnimationFrame(frame); };
	requestAnimationFrame(frame);
}
async function _rapierWaterCaptureSave() {
	const client = _rapierDrawPaintWorkers.get('human-water')?.client;
	let painter = null;
	try { painter = client ? (await client.request('capture')).rows : null; } catch (error) { painter = {error: String(error?.message || error)}; }
	const text = JSON.stringify({rapierWaterCapture: 1, saved: new Date().toISOString(), painter, lostPainter: globalThis.__rapierWaterCaptureLost ?? null, page: _rapierWaterCapture.rows});
	return _download(new Blob([text], {type: 'application/json'}), 'water-capture.json');
}
let _rapierPaintFrameReadable = null, _rapierPaintFrameProbe = null;
const RAPIER_PAINT_FRAME_WAIT = 120;
function _rapierPaintFrameUp(canvas, bounds) {
	if (!bounds) return true;
	if (!_rapierPaintFrameProbe) { const probe = document.createElement('canvas'); probe.width = probe.height = 64; _rapierPaintFrameProbe = probe.getContext('2d', {willReadFrequently: true}); _rapierPaintFrameProbe.imageSmoothingQuality = 'medium'; }
	const ctx = _rapierPaintFrameProbe, w = bounds.x1 - bounds.x0 + 1, h = bounds.y1 - bounds.y0 + 1;
	try {
		ctx.clearRect(0, 0, 64, 64);
		ctx.drawImage(canvas, bounds.x0, bounds.y0, w, h, 0, 0, Math.min(64, w), Math.min(64, h));
		const data = ctx.getImageData(0, 0, 64, 64).data;
		for (let i = 3; i < data.length; i += 4) if (data[i]) return true;
		return false;
	} catch (_) { return null; }
}
const RAPIER_PAINT_FRAME_LEARN = 60;
function _rapierPaintLearnReadback(layer, canvas, bounds) {
	let frames = 0;
	const look = () => {
		if (_rapierPaintFrameReadable !== null || layer.canvas !== canvas || _rapierDrawState.paintLayer !== layer) return;
		const up = _rapierPaintFrameUp(canvas, bounds);
		if (up !== false || ++frames >= RAPIER_PAINT_FRAME_LEARN) { _rapierPaintFrameReadable = up === true; return; }
		requestAnimationFrame(look);
	};
	requestAnimationFrame(look);
}
function _rapierPaintAwaitFrame(layer, entry, canvas, beside) {
	if (entry.up) return;
	entry.up = true;
	canvas.style.opacity = '0.01'; canvas.style.visibility = '';
	if (beside) layer.canvas.after(canvas);
	let frames = 0;
	const shown = layer.canvas, surface = layer.surface, generation = surface?.displayGeneration;
	const look = () => {
		const current = beside ? layer.pendingDisplay : layer.firstDisplay;
		if (current !== entry || layer.surface !== surface || !surface || surface.gone || surface.displayGeneration !== generation || beside && layer.canvas !== shown ||
			_rapierDrawState.paintLayer !== layer && !_rapierPaintRevisionLayers().includes(layer)) return;
		frames++;
		const meta = entry.reply.meta, up = _rapierPaintFrameUp(canvas, meta.bounds);
		const blind = up === null || _rapierPaintFrameReadable === false;
		if (up === true || blind && frames >= 2 || frames >= RAPIER_PAINT_FRAME_WAIT) { entry.ready = true; _rapierPaintDisplay(layer, entry.reply); return; }
		requestAnimationFrame(look);
	};
	requestAnimationFrame(look);
}
function _rapierPaintRepaintAll(layer) {
	const surface = layer.surface;
	if (!surface || surface.gone || surface.failure) return;
	if (layer.gpuDisplay) { surface.repaintDisplay().catch(() => {}); return; }
	surface.readRGBA8().then(px => {
		if (layer.surface !== surface || surface.gone || !layer.canvas) return;
		if (layer.canvas.width !== px.width || layer.canvas.height !== px.height) { layer.canvas.width = px.width; layer.canvas.height = px.height; _rapierPaintPlaceLive(layer); }
		layer.liveBox = null;
		layer.ctx.putImageData(new ImageData(px.data, px.width, px.height), 0, 0);
		_rapierPaintRecordLiveBox(layer, {x0: 0, y0: 0, x1: px.width - 1, y1: px.height - 1});
	}, () => {});
}
function _rapierPaintAfterFrame(update) {
	const state = _rapierDrawState, session = state.session;
	requestAnimationFrame(() => requestAnimationFrame(() => { if (state.open && state.session === session) update(); }));
}
function _rapierPaintScheduleDry(layer) {
	if (!layer || !layer.surface?.wetState) return;
	if (layer.raf) { cancelAnimationFrame(layer.raf); layer.raf = 0; }
	if (layer.dryRaf || layer.dryBusy) return;
	layer.dryFinishing = true;
	layer.dryAt = performance.now();
	layer.dryRaf = requestAnimationFrame(() => _rapierPaintDryTick(layer));
}
function _rapierPaintDryTick(layer) {
	const state = _rapierDrawState;
	layer.dryRaf = 0;
	if (state.paintLayer !== layer || !layer.surface || (!layer.surface.wetState && !layer.dryFinishing)) return;
	const admitted = layer.mode === 'water' && state.waterStrokes?.some(receipt => !receipt.finished && receipt.session === state.session && receipt.tool === _rapierDrawTool() && receipt.gesture?.paint && !receipt.gesture.paint.discarded);
	if (state.gesture || admitted || layer.dryBusy) { layer.dryRaf = requestAnimationFrame(() => _rapierPaintDryTick(layer)); return; }
	const now = performance.now(), elapsed = Math.max(0, now - layer.dryAt);
	layer.dryAt = now;
	layer.dryBusy = true;
	const surface = layer.surface;
	const sliced = layer.mode === 'water' ? surface.advanceWet(elapsed) : surface.dryWet(RAPIER_PAINT_DRY_FEED, RAPIER_PAINT_DRY_SLICE);
	surface.remote.flush().catch(() => {});
	sliced.then(done => {
		layer.dryBusy = false;
		_rapierPaintWetWake(layer);
		if (state.paintLayer !== layer || layer.surface !== surface || !layer.dryFinishing) return;
		if (!done) { layer.dryRaf = requestAnimationFrame(() => _rapierPaintDryTick(layer)); return; }
		layer.dryFinishing = false;
		_rapierPaintCommitSoon(layer);
	}, error => { layer.dryBusy = false; _rapierPaintWetWake(layer); _rapierPaintNotKept(layer, error); });
}
function _rapierPaintWetWake(layer) {
	if (layer.surface?._wetWork || !layer.wetWaiters?.length) return;
	for (const ok of layer.wetWaiters.splice(0)) ok();
}
function _rapierPaintFlushWet(owedOnly = false, current = null) {
	const departing = _rapierPaintDeparting();
	if (departing) return departing.then(() => !current || current() ? _rapierPaintFlushWet(owedOnly, current) : false);
	const state = _rapierDrawState, layer = _rapierPaintLayer(), surface = layer?.surface, session = state.session;
	const live = () => state.open && state.session === session && _rapierPaintLayer() === layer && layer.surface === surface && (!current || current());
	if (!surface || !live()) return null;
	return _rapierPaintAfter(_rapierPaintFlushRevision(layer, true), () => {
		if (!live()) return false;
		return _rapierPaintAfter(surface.settled || surface.failure ? null : surface.sync(), () => {
			if (!live()) return false;
			if (!surface.wetState && !layer.dryFinishing) return false;
			if (owedOnly && layer.mode === 'water' && !layer.dryFinishing) return false;
			if (layer.dryRaf) { cancelAnimationFrame(layer.dryRaf); layer.dryRaf = 0; }
			layer.dryBox = null; layer.dryFinishing = false;
			const committed = _rapierPaintCommit(false, null, false, live);
			return Promise.resolve(committed).then(() => live() ? _rapierPaintFlushRevision(layer, true) : null).then(() => live());
		});
	});
}
function _rapierPaintLeaveWash(current, finish = false) {
	const departing = _rapierPaintDeparting();
	if (departing) return departing.then(() => current() ? _rapierPaintLeaveWash(current, finish) : false);
	const state = _rapierDrawState, layer = state.paintLayer, surface = layer?.surface, session = state.session;
	if (!surface || layer.mode === 'water' || state.gesture || state.paintSetting || layer.pendingOverflow || layer.nextFlip || layer.retire?.length) return null;
	if (!(surface.wetState || layer.dryFinishing) || !layer.flipStroke?.entry) return null;
	const live = () => state.open && state.session === session && state.paintLayer === layer && layer.surface === surface && !state.gesture && current();
	const resume = () => { if (state.paintLayer === layer && layer.surface === surface && !surface.gone && surface.wetState) _rapierPaintScheduleDry(layer); return false; };
	if (layer.dryRaf) { cancelAnimationFrame(layer.dryRaf); layer.dryRaf = 0; }
	layer.dryFinishing = false; layer.dryBox = null;
	const close = () => {
		if (!live()) return resume();
		if (layer.pendingLift || layer.pendingCommit || layer.pendingOverflow || layer.flipStroke?.entry !== state.undoStack.at(-1)) return _rapierPaintCloseLayer(live);
		_rapierPaintDropSnapshots(layer); _rapierPaintDropNextSheet(layer); _rapierPaintFinishClose(layer);
		return null;
	};
	return _rapierPaintAfter(_rapierPaintFlushRevision(layer, true), () => {
		if (!live()) return resume();
		if (!finish) return _rapierPaintAfter(surface.sync(), () => {
   if(!live())return resume();
   if(layer.published?.revision===surface.revision)return close();
   return _rapierPaintEncodeRevision(layer,false,{peek:true}).promise.then(close);
  });
		surface.finishWetWork();
		surface.settleWet(false);
		return _rapierPaintAfter(surface.sync(), () => {
			if (!live()) { if (state.paintLayer === layer && layer.surface === surface && !surface.gone) _rapierPaintCommitSoon(layer); return false; }
			if (layer.published?.revision === surface.revision) return close();
			return _rapierPaintEncodeRevision(layer, false, {peek: true}).promise.then(close);
		});
	});
}
function _rapierPaintDepart() {
	const state = _rapierDrawState, layer = state.paintLayer, surface = layer?.surface, session = state.session;
	if (state.paintDeparture || !surface || layer.mode === 'water' || state.gesture || state.paintSetting || layer.pendingOverflow || layer.nextFlip || layer.previousFlip || layer.retire?.length) return null;
	if (!(surface.wetState || layer.dryFinishing) || !layer.flipStroke?.entry) return null;
	const departure = {layer, session, promise: null};
	const live = () => state.open && state.session === session && state.paintLayer === layer && layer.surface === surface && state.paintDeparture === departure;
	if (layer.dryRaf) { cancelAnimationFrame(layer.dryRaf); layer.dryRaf = 0; }
	layer.dryFinishing = false; layer.dryBox = null;
	state.paintDeparture = layer.departing = departure;
	const close = () => live() ? _rapierPaintAfter(_rapierPaintFlushRevision(layer, true), () => live() ? _rapierPaintCloseNow(false, live) : false) : false;
	const run = _rapierPaintAfter(_rapierPaintFlushRevision(layer, true), () => {
		if (!live()) return false;
		surface.finishWetWork();
		surface.settleWet(false);
		return _rapierPaintAfter(surface.sync(), () => {
			if (!live()) return false;
			if (layer.published?.revision === surface.revision) return close();
			return _rapierPaintEncodeRevision(layer, false, {peek: true}).promise.then(close);
		});
	});
	const end = () => {
		if (layer.departing === departure) layer.departing = null;
		if (state.paintDeparture === departure) state.paintDeparture = null;
		if (typeof _rapierDrawReleaseHeldPress === 'function') _rapierDrawReleaseHeldPress(departure);
	};
	departure.promise = Promise.resolve(run).then(end, error => {
		end();
		if (state.session === session && state.paintLayer === layer && !_rapierPaintLossSaid(error)) showToast('The painting could not be kept. It is still open: ' + String(error?.message || error), 'error');
	});
	return departure.promise;
}
function _rapierPaintDeparting() { return _rapierDrawState.paintDeparture?.promise || null; }
function _rapierPaintAmendDeparted(layer, stroke, geom, raster, paint) {
	const state = _rapierDrawState, entry = stroke?.entry, canvas = state.recipe.canvas, shape = layer.id != null ? _rapierDrawShapeById(layer.id) : null;
	if (!layer.departing || !shape || !entry || entry === state.undoStack.at(-1) || layer.retire?.length) return null;
	if (geom.cx - geom.w / 2 < 0 || geom.cy - geom.h / 2 < 0 || geom.cx + geom.w / 2 > canvas.w || geom.cy + geom.h / 2 > canvas.h) return null;
	if (!_rapierDrawStepAmendable(entry, [shape.id])) return null;
	shape.geom = geom; shape.raster = raster; shape.paint = paint;
	_rapierDrawAmendStep(entry, [shape]);
	_rapierDrawRenderShapes([shape.id]); _rapierDrawUpdateMenu();
	if (typeof _rapierDrawBackupPublished === 'function') _rapierDrawBackupPublished();
	return shape;
}
function _rapierPaintScheduleBlit() {
	(_rapierPaintLayer()?.surface?.remote || _rapierPaintRemoteNow())?.requestFrame();
}
function _rapierPaintShowLive(on, layer = _rapierDrawState.paintLayer) {
	const state = _rapierDrawState;
	if (!layer?.canvas || !_rapierPaintRevisionLayers().includes(layer)) return;
	layer.liveRequest = on;
	const showing = layer.gpuDisplay && layer.mode === 'water' && state.paintLayer === layer && layer.canvas.style.visibility !== 'hidden' &&
		(layer.id == null || _rapierDrawShapeById(layer.id)?.raster === layer.raster);
	if (layer.gpuDisplay) { layer.liveWanted = on; on = (on || showing) && layer.displayReady && !_rapierPaintOverlayLost(layer); }
	if (!on && layer.decoding && (!layer.gpuDisplay || layer.displayReady) && !_rapierPaintOverlayLost(layer)) on = true;
	if (on && !showing && layer.gpuDisplay && layer.mode === 'water' && layer.raster) {
		const shown = layer.displayMeta?.revision, kept = layer.checkpoint;
		on = shown > 0 && (!!layer.decoding || kept?.raster !== layer.raster || shown >= kept.revision);
	}
	const visibility = on || layer.firstDisplay?.up ? '' : 'hidden';
	if (layer.canvas.style.visibility !== visibility) layer.canvas.style.visibility = visibility;
	const aside = on && !_rapierPaintOverlayLost(layer);
	if (layer.id != null) { const g = state.svg?.querySelector('[data-shape-id="' + layer.id + '"]'); if (g && g.hasAttribute('data-paint-live') !== !!aside) { if (aside) g.setAttribute('data-paint-live', ''); else g.removeAttribute('data-paint-live'); } }
	if (RAPIER_WATER_CAPTURE && layer.mode === 'water') {
		const row = {ev: 'live', wanted: layer.liveRequest, visible: !visibility, keptAside: aside, ready: !!layer.displayReady, decoding: !!layer.decoding, lost: !!_rapierPaintOverlayLost(layer), shown: layer.displayMeta?.revision ?? null, kept: layer.checkpoint?.revision ?? null}, key = JSON.stringify(row);
		if (key !== _rapierWaterCapture.live) { _rapierWaterCapture.live = key; _rapierWaterNote(row); }
	}
}
const RAPIER_PAINT_FINGER_DABS = 1.5;
function _rapierPaintFitFinger(def, finger) {
	const at = RAPIER_PAINT_SETTING_AT, changed = [];
	if (finger && typeof finger === 'object') {
		if (finger.gain > 1) { const o = def.settings[at['opaque']]; o.base = Math.min(1, o.base * finger.gain); changed.push('one pass lays ink you can see'); }
		if (finger.fatten > 0) { def.settings[at['radius_logarithmic']].base += finger.fatten; changed.push('the mark is wide enough for a finger'); }
	}
	const gate = def.settings[at['smudge_transparency']];
	if (gate && (gate.base > 0 || Object.keys(gate.inputs).length)) { gate.base = 0; gate.inputs = {}; changed.push('it can paint on bare paper'); }
	const perRadius = def.settings[at['dabs_per_actual_radius']], perBasic = def.settings[at['dabs_per_basic_radius']], perSecond = def.settings[at['dabs_per_second']];
	const sparse = perRadius.base < 1.2 && perBasic.base < 1.2 && perSecond.base <= 0;
	if (sparse) { perRadius.base = RAPIER_PAINT_FINGER_DABS; changed.push('one pass is a stroke, not a row of dots'); }
	return changed;
}
function _rapierPaintFitsFinger(id) {
	if (!id || !id.startsWith('own/')) return false;
	try { return localStorage.getItem(RAPIER_PAINT_FIT_KEY + id) !== 'off'; } catch (_) { return true; }
}
function _rapierPaintSetFitsFinger(id, on) {
	try { if (on) localStorage.removeItem(RAPIER_PAINT_FIT_KEY + id); else localStorage.setItem(RAPIER_PAINT_FIT_KEY + id, 'off'); } catch (_) {}
	try { const fits = JSON.parse(_rapierPersonal.values('drawing/').paintFits || '{}'); fits[id] = !!on; _rapierPersonal.rememberDrawing('paintFits', JSON.stringify(fits)); } catch (_) {}

	_rapierDrawGlyphCache.clear(); _rapierPaintGlyphCache.clear();
	const layer = _rapierPaintLayer(); if (layer) { layer.brush = null; layer.brushId = null; }
	_rapierPaintUpdateStrip();
}
function _rapierPaintBrushFor(layer, id, settings = null) {
	if (layer.mode === 'water') {
		const def = settings?.definition || _rapierWaterDefinition(), key = JSON.stringify(def);
		if (layer.brush && layer.brushDip === key) return layer.brush;
		layer.brush = layer.surface.remote.brush(def,layer.surface); (_rapierDrawState.paintBrushes ||= new Set()).add(layer.brush);
		layer.brushId = id; layer.brushDip = key; layer.brushRadius = def.settings[3].base; layer.waterPaper = def.water.paper;
		_rapierPaintSweepBrushes(); return layer.brush;
	}
	const dip = settings?.definition ? JSON.stringify(settings.definition) : JSON.stringify(_rapierPaintDefFor(id));
	if (layer.brush && layer.brushId === id && layer.brushDip === dip) return layer.brush;
	layer.brush = null;
	const def = settings?.definition || _rapierPaintDefFor(id);
	const state = _rapierDrawState;
	layer.brush = _rapierPaintRemoteNow().brush(def,layer.surface); (state.paintBrushes ||= new Set()).add(layer.brush);
	layer.brushId = id; layer.brushDip = dip; layer.brushRadius = def.settings[3].base;
	_rapierPaintSweepBrushes();
	return layer.brush;
}

function _rapierPaintEventPoint(evt, geom, layer) {
	const p = _rapierDrawMapPoint(evt.clientX, evt.clientY, geom.rect, geom.vb);
	let x = p[0], y = p[1], reach = true;
	const f = layer?.frame;
	if (f) {
		const dx = x - f.c0[0], dy = y - f.c0[1], det = f.eux * f.evy - f.evx * f.euy;
		if (det) {
			const px = (dx * f.evy - dy * f.evx) / det, py = (dy * f.eux - dx * f.euy) / det;
			const pxPad = px + f.pad, pyPad = py + f.pad, fringe = RAPIER_PAINT_REACH_FRINGE;
			reach = pxPad >= -fringe && pxPad <= layer.surface.width + fringe && pyPad >= -fringe && pyPad <= layer.surface.height + fringe;
			x = pxPad / layer.scale; y = pyPad / layer.scale;
		} else reach = false;
	} else if (layer?.origin) { x -= layer.origin[0]; y -= layer.origin[1]; }
	const tiltX = Number.isFinite(evt.tiltX) ? _rapierDrawClamp(evt.tiltX / 90, -1, 1) : 0, tiltY = Number.isFinite(evt.tiltY) ? _rapierDrawClamp(evt.tiltY / 90, -1, 1) : 0;
	const twist = Number.isFinite(evt.twist) ? ((evt.twist % 360) + 360) % 360 / 360 : 0;
	return { x, y, tiltX, tiltY, twist, t: evt.timeStamp, reach };
}
// lighter one still -- see RAPIER_PAINT_SIM_LIGHT_* above).
function _rapierPaintPressure(evt, paint, p) {
	if (evt.pointerType === 'pen' && Number.isFinite(evt.pressure)) {
		if (evt.pressure > 0 && evt.pressure !== .5) paint.ownPressure = true;
		return _rapierPaintPressed(Math.min(1, Math.max(0, evt.pressure)), 'pen', 0);
	}
	const level = paint.settings.touch;
	const speedConst = _rapierPaintTouchAt(level).speed;
	const elapsed = _rapierDrawClamp((p.t - paint.last) / 1000, 0, 0.5);
	const speed = Math.hypot(p.x - paint.x, p.y - paint.y) / Math.max(1e-4, elapsed);
	paint.q += (Math.exp(-speed / speedConst) - paint.q) * -Math.expm1(-elapsed * 1000 / RAPIER_PAINT_SIM_TAU);
	const bySpeed = _rapierPaintFeel(paint.q, level);

	const patch = evt.pointerType === 'touch' ? _rapierPaintPatch(evt) : 0;
	let value = bySpeed, from = 'speed';
	if (patch > 0) {
		const seen = _rapierPaintPatchSeen;
		seen.lo = Math.min(seen.lo, patch); seen.hi = Math.max(seen.hi, patch);
		seen.min = Math.min(seen.min, patch); seen.max = Math.max(seen.max, patch);
		const q = _rapierDrawClamp((patch - seen.min) / Math.max(1, seen.max - seen.min), 0, 1);
		const trust = _rapierDrawClamp((seen.hi - seen.lo) / RAPIER_PAINT_PATCH_TRUST, 0, 1);
		value += (_rapierPaintFeel(q, level) - value) * trust;
		if (trust > .5) from = 'patch';
	}
	if (evt.pointerType === 'touch' && Number.isFinite(evt.pressure) && evt.pressure > 0) {
		const seen = _rapierPaintTouchSeen;
		seen.min = Math.min(seen.min, evt.pressure); seen.max = Math.max(seen.max, evt.pressure);
		const spread = seen.max - seen.min, trust = _rapierDrawClamp(spread / RAPIER_PAINT_TOUCH_VARIES, 0, 1);
		if (trust > 0) {
			const q = _rapierDrawClamp((evt.pressure - seen.min) / spread, 0, 1);
			value += (_rapierPaintFeel(q, level) - value) * trust;
			if (trust > .5) from = 'pressure';
		}
	}
	return _rapierPaintPressed(value, from, patch);
}
function _rapierPaintPressed(value, from, patch) {
	_rapierPaintLastPress.value = value; _rapierPaintLastPress.from = from; _rapierPaintLastPress.patch = patch;
	return value;
}
function _rapierPaintHoldNeeded(brush) { try { return brush.getBaseValue('dabs_per_second') > 0; } catch (_) { return false; } }
function _rapierPaintScheduleHold(gesture) {
	const layer = _rapierPaintLayer(), paint = gesture?.paint;
	if (!layer || !paint || !paint.holdNeeded || paint.pending || paint.holdPending || layer.holdRaf) return;
	layer.holdRaf = requestAnimationFrame(() => _rapierPaintHoldTick(gesture));
}
function _rapierPaintHoldTick(gesture) {
	const state = _rapierDrawState, layer = _rapierPaintLayer(), paint = gesture?.paint;
	if (layer) layer.holdRaf = 0;
	if (!layer || !paint || paint.pending || paint.holdPending || paint.discarded || state.gesture !== gesture) return;
	const now = performance.now() - paint.clockOffset, dt = _rapierDrawClamp((now - paint.last) / 1000, 0.001, 0.5);
	paint.last = now;
	if (layer.mode === 'water') {
		const frameDt = _rapierDrawClamp((now - (paint.waterFrameAt ?? now - dt * 1000)) / 1000, 0.001, 0.5);
		paint.waterFrameAt = now;
		const surface = layer.surface, pending = surface.advanceWet(frameDt * 1000);
		paint.holdPending = pending;
		const current = () => state.gesture === gesture && _rapierPaintLayer() === layer && layer.surface === surface && !paint.discarded;
		void pending.then(() => {
			if (paint.holdPending !== pending) return;
			paint.holdPending = null;
			if (current() && !surface.failure && !surface.gone) _rapierPaintScheduleHold(gesture);
		}, error => {
			if (paint.holdPending !== pending) return;
			paint.holdPending = null;
			if (current()) _rapierPaintStrokeFailed(gesture, error);
		});
		_rapierPaintScheduleBlit();
		return;
	}
	const at = paint.drawn;
	const hx = at ? at.p.x : paint.x, hy = at ? at.p.y : paint.y;
	const htx = at ? at.p.tiltX : paint.tiltX, hty = at ? at.p.tiltY : paint.tiltY, hw = at ? at.p.twist : paint.twist;
	paint.brush.strokeTo(layer.surface, hx * RAPIER_PAINT_GRAIN, hy * RAPIER_PAINT_GRAIN, paint.pressure, htx, hty, dt, 1, 0, hw, paint.inputKind);
	_rapierPaintScheduleBlit();
	_rapierPaintScheduleHold(gesture);
}
function _rapierPaintAdmitSettings(erasing, tool = _rapierDrawTool()) {
	erasing = !!erasing || tool === 'erase';
	if (_rapierPaintMode(erasing) === 'water') {
		const paintEraser = !erasing && tool === 'paint' && _rapierPaintBrushId() === RAPIER_PAINT_ERASER_ID;
		const settings = _rapierWaterAdmitSettings(erasing || paintEraser);
		if (paintEraser) settings.radiusOffset = RAPIER_PAINT_ERASER_LOGR + _rapierPaintRadiusOffset(_rapierPaintSize()) - settings.definition.settings[3].base;
		return settings;
	}
	if (erasing) {
		const r = _rapierDrawEraseRadius();
		return { brushId: RAPIER_PAINT_ERASER_ID, color: _rapierPaintColor(), radiusOffset: Math.log(Math.max(2, r * RAPIER_PAINT_GRAIN)) - RAPIER_PAINT_ERASER_LOGR, strength: 'firm', touch: 0, edgeSoftness: _rapierDrawEraseSoftness() / 100, seed: (Math.random() * 0x3fffffff) | 0, erasing: true };
	}
	return { definition: _rapierPaintDefFor(_rapierPaintBrushId()), brushId: _rapierPaintBrushId(), color: _rapierPaintColor(), radiusOffset: _rapierPaintRadiusOffset(_rapierPaintSize()), strength: _rapierDrawState.paintStrength === 'light' ? 'light' : 'firm', touch: _rapierPaintTouchLevel(_rapierPaintBrushId(), _rapierDrawState.paintStrength === 'light'), lift: _rapierPaintLiftOf(_rapierPaintBrushId()), seed: (Math.random() * 0x3fffffff) | 0, ..._rapierPaintHeadSettings(_rapierPaintBrushId()) };
}
async function _rapierPaintStrokeCheckpoint(gesture, layer, settings = {}) {
	const state = _rapierDrawState, session = state.session, surface = layer.surface;
	surface.finishWetWork();
	if (!surface.settled) await surface.sync();
	if (layer.dryFinishing && !surface.wetState) { const flushed = _rapierPaintFlushWet(); if (flushed) await flushed; }
	const flush = _rapierPaintFlushRevision(layer, layer.mode === 'water' || state.paintSetting?.layer === layer);
	if (flush) await flush;
	if (layer.flipStroke?.entry && surface.revision !== layer.checkpoint?.revision) {
		await _rapierPaintEncodeRevision(layer).promise;
	}
	if (!state.open || state.session !== session || gesture.paint?.discarded) return 'gone';
	if (_rapierPaintLayer() !== layer) return false;
	if (layer.mode === 'water' && layer.waterMaterial) {
		const material=layer.waterMaterial,target=_rapierDrawShapeById(layer.id);
		if(!target || target.raster!==layer.raster || !globalThis.RapierDrawAgentPaint.waterPaintingIsLive(target,material.session))throw Object.assign(new Error('This Water layer changed before the stroke was ready.'),{code:'paint_target_changed'});
		await surface.fromWaterMaterial(material.replay,material.session);
		delete layer.waterMaterial;
		if (layer.gpuDisplay) { layer.displayReady = false; _rapierPaintShowLive(layer.liveWanted, layer); }
		if (!state.open || state.session !== session || gesture.paint?.discarded) return 'gone';
		if (_rapierPaintLayer() !== layer) return false;
	}
	const previousStroke = layer.flipStroke;
	layer.flipStroke = null;
	const props = {};
	for (const key of ['id', 'raster', 'geom', 'origin', 'frame', 'retire', 'checkpoint', 'pendingOverflow', 'setPending', 'paintVersion', 'paintReplay', 'waterCapture', 'waterSheet', 'waterPaper', 'waterResume']) props[key] = _rapierDrawHistoryCopy(layer[key]);
 const input={tool:settings.brushId || layer.brushId, color:settings.water?.pigment || settings.color, strength:settings.water ? globalThis.RapierDrawWater.waterStrengthOf(settings.water.load,settings.water.water) : settings.strength, paper:settings.water?.paper || surface.paper, time:performance.now(), seed:settings.seed};
	gesture.paintRollback = {layer, props, previousStroke, pixels: surface.beginStroke({record: !!layer.paintReplay, history: input}), recipe: _rapierDrawHistoryRecipe(), undo: state.undoStack.slice(), redo: state.redoStack.slice(), view: {..._rapierDrawView()}};
 const before={meta:{...surface.meta},place:_rapierPaintPlace(layer),box:surface.bounds(),replay:gesture.paintRollback.pixels.replay,...previousStroke?.history?.after,stroke:gesture.paintRollback.pixels.id,before:true};
 const history={remote:surface.remote,surfaceId:surface.id,before,after:null,input};
 layer.flipStroke={entry:null,history,histories:[history]};
}
function _rapierPaintReleaseStroke(gesture, cancel = false) {
	const saved = gesture.paintRollback, state = _rapierDrawState;
	const unstarted = !gesture.paint || gesture.paint.pending || gesture.paint.discarded;
	if (gesture.paint?.brush) gesture.paint.brush.inStroke = false;
	if (!gesture.paint?.mouse) _rapierPaintHeadHide();
	if (gesture.paint?.pending) gesture.paint.discarded = true;
	if (gesture.waterStroke && (cancel || gesture.paint?.discarded || !gesture.paint?.lifted)) _rapierPaintWaterFinish(gesture);
	if (!saved) return;
	delete gesture.paintRollback;
	_rapierPaintDropNextSheet(saved.layer); _rapierPaintDropNextSheet(state.paintLayer);
	if (!cancel) {
		if (unstarted && state.paintLayer === saved.layer && saved.layer.session === state.session && !saved.layer.flipStroke) saved.layer.flipStroke = saved.previousStroke;
		if (!saved.restored) saved.layer.surface?.endStroke(saved.pixels);
		if (saved.layer !== state.paintLayer) _rapierPaintReleaseSurface(saved.layer);
		return;
	}
	const layers = new Set([saved.layer, ..._rapierPaintRevisionLayers()].filter(Boolean));
	for (const layer of layers) {
		_rapierPaintDropNextSheet(layer);
		for (const key of ['raf', 'holdRaf', 'dryRaf']) { if (layer[key]) cancelAnimationFrame(layer[key]); layer[key] = 0; }
		for (const job of layer.revisions || []) { clearTimeout(job.timer); job.resolve(); }
		layer.revisions = []; layer.pendingCommit = null; layer.dryBusy = false;
		_rapierPaintDropSnapshots(layer);
		if (layer.pngWorker) { layer.pngWorker.worker.terminate(); URL.revokeObjectURL(layer.pngWorker.url); layer.pngWorker = null; }
		layer.previousFlip = layer.nextFlip = null; layer.flipStroke = null;
		layer.mount?.remove();
		if (layer !== saved.layer) { _rapierPaintReleaseSurface(layer); if (layer.canvas && !layer.gpuDisplay) layer.canvas.width = layer.canvas.height = 0; }
	}
	state.paintSetting = false;
	const layer = saved.layer;
	if (!saved.restored) layer.surface.endStroke(saved.pixels, true);
	Object.assign(layer, saved.props); layer.flipStroke = saved.previousStroke;
	state.paintLayer = layer; state.recipe = _rapierDrawRestoreRecipe(saved.recipe);
	state.undoStack = saved.undo; state.redoStack = saved.redo; state.view = saved.view;
 _rapierPaintTrimHistory();
	if (!layer.surface || layer.surface.gone || layer.surface.failure) return;
	layer.surface.display = reply => _rapierPaintDisplay(layer, reply);
	if (layer.gpuDisplay) { layer.displayReady = false; _rapierPaintShowLive(layer.liveWanted,layer); }
	else { layer.canvas.width = layer.surface.width; layer.canvas.height = layer.surface.height; }
	layer.liveBox = null;
	layer.mount = _rapierPaintMountLive(layer.canvas, layer.id);
	_rapierPaintPlaceLive(); _rapierPaintRepaintAll(layer);
	layer.surface.sync().then(() => { if (state.paintLayer === layer && layer.surface?.wetState) _rapierPaintScheduleDry(layer); }, () => {});
}
function _rapierPaintOpenGestureLayer(evt, settings, geom) {
	if (settings.mode !== 'water') return _rapierPaintOpenLayer(undefined, null, null, null, settings.mode || 'paint');
	let scale = _rapierPaintLayerScale();
	const nominal = _rapierPaintStageUnion(_rapierDrawState.recipe);
	while (scale > 1 && nominal.w * nominal.h * scale * scale > RAPIER_WATER_SHEET_PIXELS) scale--;
	const width = Math.max(1, Math.round(nominal.w * scale)), height = Math.max(1, Math.round(nominal.h * scale));
	if (globalThis.RapierDrawWater.waterHandSheetFits(width, height, 0, settings.definition.water?.tip)) return _rapierPaintOpenLayer(scale, null, nominal, null, 'water');
	const point = _rapierDrawMapPoint(evt.clientX, evt.clientY, geom.rect, geom.vb);
	const radius = Math.exp(settings.definition.settings[3].base + settings.radiusOffset) / RAPIER_PAINT_GRAIN;
	const reach = globalThis.RapierDrawWater.waterBrushReach({...settings.definition.water, erase:!!settings.clear}, radius) * scale + RAPIER_PAINT_GROW_MARGIN;
	const x0 = Math.floor(point[0] * scale - reach), y0 = Math.floor(point[1] * scale - reach);
	const x1 = Math.ceil(point[0] * scale + reach + 1), y1 = Math.ceil(point[1] * scale + reach + 1);
	return _rapierPaintOpenLayer(scale, null, {x0:x0/scale, y0:y0/scale, w:(x1-x0)/scale, h:(y1-y0)/scale}, null, 'water');
}
async function _rapierPaintInitStroke(evt, gesture, settings, geom) {
	const state = _rapierDrawState, session = state.session;
	const gone = () => !state.open || state.session !== session || !!gesture.paint?.discarded;
	let layer = state.paintLayer, checkpoint = layer ? await _rapierPaintStrokeCheckpoint(gesture, layer, settings) : false;
	if (checkpoint === 'gone' || gone()) return;
	if (!layer || checkpoint === false) {
		layer = _rapierPaintLayer();
		if (!_rapierPaintLayerValid(_rapierPaintIsMaterialTool(settings.brushId, settings), geom, settings.mode || 'paint')) {
			const target = _rapierPaintTarget(settings.mode || 'paint');
			if (target) { _rapierPaintQueueGesture(target, evt, gesture, settings, geom); return; }
			const closing = _rapierPaintCloseLayer();
			if (closing) { await closing; if (gone()) return; }
			layer = _rapierPaintOpenGestureLayer(evt, settings, geom);
		}
		checkpoint = await _rapierPaintStrokeCheckpoint(gesture, layer, settings);
		if (checkpoint === 'gone' || gone()) return;
	}
	delete layer.warmView;
	layer.setPending = true;
	if (gesture.trail && !('base' in gesture.trail)) { gesture.trail.base = _rapierDrawHistoryRecipe(); gesture.trail.top = state.undoStack.at(-1); }
	const id = settings.brushId, brush = _rapierPaintBrushFor(layer, id, settings);
	brush.inStroke = true;
	const timing = _rapierDrawState.paintTiming;
	if (timing && !timing.brush) timing.brush = performance.now();
	if (layer.dryRaf) { cancelAnimationFrame(layer.dryRaf); layer.dryRaf = 0; }
	_rapierPaintShowLive(true);
	brush.seed(settings.seed);
	brush.setColor(settings.color[0], settings.color[1], settings.color[2]);
	brush.setBaseValue('radius_logarithmic', layer.brushRadius + settings.radiusOffset);
	if (settings.erasing && settings.edgeSoftness > 0) brush.setBaseValue('hardness', 0.72 - 0.64 * _rapierDrawClamp(settings.edgeSoftness, 0, 1));
	brush.setHead(settings.held ?? null, settings.clear);
	brush.reset(); brush.newStroke();
	const p = _rapierPaintEventPoint(evt, geom, layer);
	const holdNeeded = layer.mode === 'water' || _rapierPaintHoldNeeded(brush);
	// samples are, and the brush works at RAPIER_PAINT_GRAIN of them.
	const radius = Math.exp(layer.brushRadius + settings.radiusOffset) / RAPIER_PAINT_GRAIN;
	const reach = layer.mode === 'water' ? globalThis.RapierDrawWater.waterBrushReach({...settings.definition.water, erase:!!settings.clear}, radius) : radius;
	gesture.paint = { brush, last: p.t, clockOffset: performance.now() - p.t, x: p.x, y: p.y, tiltX: p.tiltX, tiltY: p.tiltY, twist: p.twist, geom, points: 0, brushId: id, scale: layer.scale, q: RAPIER_PAINT_SIM_START, pressure: 0, holdNeeded, pending: false, settings, reached: p.reach, rollback: gesture.paintRollback,
		travel: 0, tail: [], drawn: null, drained: false, reach, land: Math.max(RAPIER_PAINT_LAND_MIN, reach * RAPIER_PAINT_LAND),
		lift: brush.wet ? Math.max(1, reach * RAPIER_PAINT_LIFT_WET) : Math.max(RAPIER_PAINT_LIFT_MIN, reach * RAPIER_PAINT_LIFT * (settings.lift || 1)) };
	gesture.paint.inputKind = ['pen', 'touch', 'mouse'].includes(evt.pointerType) ? evt.pointerType : 'mouse';
	const pressure = gesture.paint.pressure = layer.mode === 'water' ? _rapierWaterPointerPressure(evt, gesture.paint.inputKind) : _rapierPaintPressure(evt, gesture.paint, p);
	const seat = pressure * RAPIER_PAINT_SEAT;
	layer = _rapierPaintGrowToHold(layer, gesture.paint, p) || layer;
	if (layer.mode === 'water') brush.strokeTo(layer.surface, p.x * RAPIER_PAINT_GRAIN, p.y * RAPIER_PAINT_GRAIN, pressure, p.tiltX, p.tiltY, 1 / 60, 1, 0, p.twist, gesture.paint.inputKind, p.t);
	else {
		brush.strokeTo(layer.surface, p.x * RAPIER_PAINT_GRAIN, p.y * RAPIER_PAINT_GRAIN, seat, p.tiltX, p.tiltY, 0.0001, 1, 0, p.twist, gesture.paint.inputKind, p.t);
		brush.strokeTo(layer.surface, p.x * RAPIER_PAINT_GRAIN, p.y * RAPIER_PAINT_GRAIN, seat, p.tiltX, p.tiltY, 0.012, 1, 0, p.twist, gesture.paint.inputKind, p.t);
	}
	if (timing && !timing.seat) timing.seat = performance.now();
	gesture.paint.mouse = evt.pointerType === 'mouse'; _rapierPaintHeadAt(evt.clientX, evt.clientY);
	_rapierPaintScheduleBlit();
	if (holdNeeded) _rapierPaintScheduleHold(gesture);
}
async function _rapierPaintApplyQueued(gesture, admitted = false) {
	if (gesture?.waterStroke && !admitted) return _rapierPaintWaterRun(gesture, () => _rapierPaintApplyQueued(gesture, true));
	const state = _rapierDrawState, paint = gesture?.paint;
	if (!paint?.pending || paint.discarded || !state.open || state.session !== paint.session || _rapierDrawTool() !== paint.tool) { if (gesture?.waterStroke) _rapierPaintWaterFinish(gesture); return; }
	const queued = paint;
	try {
		await _rapierPaintInitStroke(queued.downEvt, gesture, queued.settings, queued.geom);
		if (gesture.paint === queued || gesture.paint?.discarded) return;
		if (queued.moveEvents.length) _rapierPaintMove(queued.moveEvents, gesture);
		if (queued.ended) _rapierPaintEnd(queued.endEvt, gesture);
	} catch (error) { _rapierPaintStrokeFailed(gesture, error); throw error; }
}
function _rapierPaintQueueFallback(gesture) {
	const state = _rapierDrawState, paint = gesture?.paint;
	if (!paint?.pending || paint.discarded || !state.open || state.session !== paint.session || _rapierDrawTool() !== paint.tool) { if (gesture?.waterStroke) _rapierPaintWaterFinish(gesture); return; }
	if (_rapierPaintIsMaterialTool(paint.settings?.brushId)) {
		_rapierPaintDiscardChangedTarget(gesture);
		showToast('This browser could not read this painting back, so the stroke was not applied. The painting is unchanged.', 'info');
		return;
	}
	_rapierPaintOpenLayer();
	return _rapierPaintApplyQueued(gesture).catch(() => {});
}
function _rapierPaintDiscardChangedTarget(gesture) {
	if (gesture?.waterStroke) _rapierPaintWaterFinish(gesture);
	const paint = gesture?.paint;
	if (!paint || paint.discarded) return;
	paint.discarded = true; paint.pending = false;
}
async function _rapierPaintDecodeStraight(raster) {
	return globalThis.RapierDrawAgentPaint.decodeNativePaintJXL(raster);
}
function _rapierPaintRehydrateFor(target, pendingGesture = null) {
	const state = _rapierDrawState;
	if (!state.open) { if (pendingGesture) _rapierPaintQueueFallback(pendingGesture); return; }
	const frame = _rapierPaintTargetFrame(target);
	if (!frame) { if (pendingGesture) _rapierPaintQueueFallback(pendingGesture); return; }
	const mode = target.paint?.mode === 'water' ? 'water' : 'paint';
	const targetKey = _rapierPaintTargetKey(target), key = state.session + ':' + targetKey;
	if (state.paintRehydrate === key) { if (pendingGesture) (state.paintRehydrateWaiters = state.paintRehydrateWaiters || []).push(pendingGesture); return; }
	if (state.paintRehydrateFailed === key) { if (pendingGesture) { if (mode === 'water') _rapierPaintDiscardChangedTarget(pendingGesture); else _rapierPaintQueueFallback(pendingGesture); } return; }
	state.paintRehydrate = key;
	const waiters = state.paintRehydrateWaiters = pendingGesture ? [pendingGesture] : [];
	const session = state.session, tool = _rapierDrawTool(), targetId = target.id;
	const decoded = () => { if (state.paintRehydrate === key) state.paintRehydrate = null; };
	const finished = task => { if (state.paintRehydrateTask === task) { state.paintRehydrateWaiters = null; state.paintRehydrateTask = null; } };
	const simple = _rapierPaintFrameIsSimple(frame);
	const group = simple ? _rapierPaintGroupMembers(target, frame) : [];
	const history = !group.length && _rapierPaintHistoryFor(target);
	const native = !history && mode === 'water' && !group.length && globalThis.RapierDrawAgentPaint.waterPaintingIsLive(target, _rapierWaterSession());
	const groupKey = _rapierPaintGroupKey(target, group);
	const load = async shape => {
		if(history)return {shape,history};
		if (native) return {shape, waterMaterial:true};
		const pixels = await _rapierPaintPNG.decode(shape.raster) || await _rapierPaintDecodeStraight(shape.raster);
		if (pixels) return {shape, pixels};
		if(shape.paint?.mode==='water')throw Object.assign(new Error('This host cannot reopen the exact Water pixels.'),{code:'paint_raster_decoder_unavailable'});
		return new Promise((ok, no) => { const image = new Image(); image.onload = () => ok({ shape, image }); image.onerror = () => no(new Error('a painting could not be read back')); image.src = shape.raster; });
	};
	let task = null;
	const adopt = async loaded => {
		try {
			if (!state.open || state.session !== session) { for (const g of waiters) _rapierPaintQueueFallback(g); return; }
			const again = _rapierDrawShapeById(targetId);
			if (!again || _rapierPaintTargetKey(again) !== targetKey) { for (const g of waiters) _rapierPaintDiscardChangedTarget(g); return; }
			if (_rapierPaintGroupKey(again, simple ? _rapierPaintGroupMembers(again, frame) : []) !== groupKey) {
				let refused = false;
				for (const g of waiters) {
					if (g.paint && !g.paint.reresolved) { g.paint.reresolved = true; _rapierPaintRehydrateFor(again, g); }
					else {
						if (g.paint?.pending && !g.paint.discarded) refused = true;
						_rapierPaintDiscardChangedTarget(g);
					}
				}
				if (refused) showToast('Some strokes could not be added because the painting changed meanwhile.', 'error');
				return state.paintRehydrateTask;
			}
			const erasing = waiters.some(g => g.eraseInk && g.paint?.pending && !g.paint.discarded && g.paint.tool === _rapierDrawTool());
			const material = waiters.some(g => _rapierPaintIsMaterialTool(g.paint?.settings?.brushId, g.paint?.settings));
			if (!(_rapierPaintToolPaints() || erasing) || _rapierPaintLayerValid(material || erasing, null, mode)) { await Promise.all(waiters.map(g => _rapierPaintApplyQueued(g).catch(() => {}))); return; }
			const closing = _rapierPaintCloseLayer();
			if (closing) { await closing; return adopt(loaded); }
			const initial = native ? {replay:again.paint.replay, session:_rapierWaterSession(), origin:frame.c0} : null;
			if (initial && !globalThis.RapierDrawAgentPaint.waterPaintingIsLive(again, initial.session)) throw Object.assign(new Error('This Water layer changed before it could reopen.'), {code:'paint_target_changed'});
			const layer = history ? _rapierPaintOpenHistoryLayer(history,again.id,mode) : simple ? _rapierPaintOpenLayer(frame.scale, again.id, mode === 'water' ? _rapierPaintWaterTargetUnion(again, frame, group) : null, null, mode, null, initial) : _rapierPaintOpenLocalLayer(frame, again.id, mode, initial);
			let restoring = null;
			for (const { shape, image, pixels, waterMaterial, history:heldHistory } of loaded) {
    if(heldHistory){restoring=layer.surface.restoreHistory(heldHistory.surfaceId,heldHistory.point).then(()=>{layer.checkpoint=layer.published={revision:layer.surface.revision,raster:layer.raster};});continue;}
				if (waterMaterial) {
					restoring = layer.surface.materialReady.then(() => {
						if (state.paintLayer === layer && state.session === session) layer.checkpoint = layer.published = {revision:layer.surface.meta.revision,raster:layer.raster};
					});
					if (layer.gpuDisplay) { layer.displayReady = false; _rapierPaintShowLive(layer.liveWanted, layer); }
					continue;
				}
				let px = pixels;
				if (!px) {
				const canvas = document.createElement('canvas');
				canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
				const ctx = canvas.getContext('2d', { willReadFrequently: true });
				ctx.drawImage(image, 0, 0);
				px = ctx.getImageData(0, 0, canvas.width, canvas.height);
				}
				if (simple) {
					const f = shape === target ? frame : _rapierPaintTargetFrame(shape);
					const x0 = Math.round((f.c0[0] - (layer.origin?.[0] || 0)) * f.scale), y0 = Math.round((f.c0[1] - (layer.origin?.[1] || 0)) * f.scale);
					layer.surface.fromRGBA8(px.data, px.width, px.height, x0, y0);
				} else {
					layer.surface.fromRGBA8(px.data, px.width, px.height, layer.frame.pad, layer.frame.pad);
				}
			}
			layer.id = again.id; layer.raster = again.raster; layer.geom = JSON.stringify(again.geom); layer.brushId = again.paint?.brush || null;
			layer.paintReplay = again.paint?.replay ? _rapierDrawHistoryCopy(again.paint.replay) : null;
			layer.waterPaper = again.paint?.paper || layer.waterPaper;
			if (mode === 'water' && !globalThis.RapierDrawAgentPaint.waterPaintingIsLive(again, _rapierWaterSession())) {
				const resumed = globalThis.RapierDrawAgentPaint.resumeWaterReplay(again, _rapierWaterSession());
				layer.paintReplay = resumed.replay; layer.waterResume = resumed.resume;
			}
			else if(mode==='water' && !group.length && !native && !history)layer.waterMaterial={replay:_rapierDrawHistoryCopy(layer.paintReplay),session:_rapierWaterSession()};
			layer.retire = group.map(shape => shape.id);
			if (restoring) await restoring;
			await Promise.all(waiters.map(g => _rapierPaintApplyQueued(g).catch(() => {})));
		} catch (error) { state.paintRehydrateFailed = key; try { _rapierPaintCloseLayer(); } catch (_) {}
			if (target.paint?.mode === 'water') { for (const g of waiters) _rapierPaintDiscardChangedTarget(g); if (!_rapierPaintLossSaid(error)) showToast('This Water layer could not be reopened: ' + String(error.message || error), 'error'); }
			else for (const g of waiters) _rapierPaintQueueFallback(g); }
	};
	task = state.paintRehydrateTask = Promise.all([_rapierPaintStartPainter(mode), load(target), ...group.map(load)]).then(([, ...loaded]) => { decoded(); return adopt(loaded); }, error => {
		decoded(); state.paintRehydrateFailed = key;
		if (mode === 'water') { for (const g of waiters) _rapierPaintDiscardChangedTarget(g); if (!_rapierPaintLossSaid(error)) showToast('This Water layer could not be reopened: ' + String(error.message || error), 'error'); }
		else for (const g of waiters) _rapierPaintQueueFallback(g);
	}).finally(() => finished(task));
}
function _rapierPaintPendingStroke(finishWet = false, asked = false) {
	return _rapierDrawState.waterAction || _rapierDrawState.paintEraseFan?.promise || _rapierPaintDeparting() || _rapierPaintPendingStrokeOwed(finishWet, asked);
}
function _rapierPaintPendingStrokeOwed(finishWet = false, asked = false) {
	const state = _rapierDrawState;
	const water = _rapierPaintWaterPending();
	if (water) {
		if (finishWet || (typeof document !== 'undefined' && document.hidden)) for (const layer of _rapierPaintRevisionLayers()) {
			_rapierPaintDropSnapshots(layer); if (!asked || layer.surface?._wetWork) layer.surface?.finishWetWork?.();
			if (layer.pendingLift) _rapierPaintWakeLift(layer, layer.pendingLift);
		}
		return water;
	}
	for (const layer of _rapierPaintRevisionLayers()) {
		const surface = layer.surface;
		if (finishWet || (typeof document !== 'undefined' && document.hidden)) { _rapierPaintDropSnapshots(layer); if (!asked || surface?._wetWork) surface?.finishWetWork?.(); }
		if (surface && !surface.settled && !surface.failure) return surface.sync().then(() => {}, () => {});
		if (surface?._wetWork) return new Promise(ok => (layer.wetWaiters = layer.wetWaiters || []).push(ok));
		if (layer.pendingCommit?.failed) return _rapierPaintFlushRevision(layer);
		if (layer.pendingCommit) return layer.pendingCommit.promise;
		if (layer.pendingLift) {
			_rapierPaintWakeLift(layer, layer.pendingLift);
			return layer.pendingLift.promise;
		}
	}
	return state.paintRehydrateWaiters?.some(g => g.paint?.pending && g.paint.ended && !g.paint.discarded)
		? state.paintRehydrateTask : null;
}
function _rapierPaintShapeBox(shape) {
	const f = _rapierPaintTargetFrame(shape);
	if (!f) return null;
	const xs = [], ys = [];
	for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { xs.push(f.c0[0] + a * f.eux * f.pw + b * f.evx * f.ph); ys.push(f.c0[1] + a * f.euy * f.pw + b * f.evy * f.ph); }
	return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
function _rapierPaintEraseReach(settings) {
	try { return 1.5 * Math.exp((settings.definition || _rapierPaintDefFor(settings.brushId)).settings[3].base + settings.radiusOffset) / RAPIER_PAINT_GRAIN + 2; } catch (_) { return 64; }
}
async function _rapierPaintSettled(gesture, alive) {
	for (let waited = 0; ; waited += 16) {
		const paint = gesture.paint;
		if (!alive() || !paint || paint.discarded) return false;
		if (paint.lifted) break;
		if (waited > 120000) return false;
		await new Promise(ok => setTimeout(ok, 16));
	}
	const end = Date.now() + 60000;
	for (;;) {
		const owed = _rapierPaintPendingStrokeOwed() || _rapierPaintFlushRevision();
		if (!owed) return alive();
		await Promise.race([owed, new Promise(ok => setTimeout(ok, 50))]);
		if (!alive() || Date.now() > end) return false;
		await new Promise(ok => setTimeout(ok, 16));
	}
}
function _rapierPaintEraseWanted() { return !!_rapierPaintTarget(); }
function _rapierPaintEraseFan(gesture) {
	const state = _rapierDrawState, trail = gesture?.trail;
	if (!trail || trail.fanned || !state.open) return null;
	trail.fanned = true;
	const session = state.session, fan = state.paintEraseFan = { session, promise: null };
	fan.promise = _rapierPaintEraseFanRun(gesture, trail, session).catch(error => { showToast('The erase could not reach every painting: ' + String(error?.message || error), 'error'); })
		.finally(() => { if (state.paintEraseFan === fan) state.paintEraseFan = null; });
	return fan.promise;
}
async function _rapierPaintEraseFanRun(gesture, trail, session) {
	const state = _rapierDrawState, alive = () => state.open && state.session === session;
	if (gesture.kind === 'paint' && !await _rapierPaintSettled(gesture, alive)) return;
	if (!alive()) return;
	if (!('base' in trail)) { trail.base = _rapierDrawHistoryRecipe(); trail.top = state.undoStack.at(-1); }
	const first = new Set(), layer = _rapierPaintLayer();
	if (gesture.kind === 'paint' && layer?.id != null) first.add(layer.id);
	if (trail.vector) { const cut = _rapierDrawEraseWith(trail.vector); if (cut && typeof cut.then === 'function') await cut; if (!alive()) return; }
	const settings = _rapierPaintAdmitSettings(!!gesture.eraseInk, gesture.tool), reach = _rapierPaintEraseReach(settings);
	const points = [trail.down, ...trail.moves, trail.end].filter(Boolean).map(evt => _rapierDrawMapPoint(evt.clientX, evt.clientY, trail.geom.rect, trail.geom.vb));
	const path = { x0: Math.min(...points.map(p => p[0])) - reach, y0: Math.min(...points.map(p => p[1])) - reach, x1: Math.max(...points.map(p => p[0])) + reach, y1: Math.max(...points.map(p => p[1])) + reach };
	const reached = state.recipe.shapes.filter(shape => {
		if (first.has(shape.id) || !_rapierPaintEligiblePaint(shape)) return false;
		const box = _rapierPaintShapeBox(shape);
		return box && box.x1 >= path.x0 && box.x0 <= path.x1 && box.y1 >= path.y0 && box.y0 <= path.y1;
	}).map(shape => shape.id).reverse();
	const chosen = state.paintChosenId;
	try {
		for (const id of reached) {
			const shape = _rapierDrawShapeById(id);
			if (!shape || !_rapierPaintEligiblePaint(shape)) continue;
			if (!alive() || _rapierDrawTool() !== gesture.tool) break;
			state.paintChosenId = id;
			const replay = { kind: 'paint', tool: gesture.tool, eraseInk: gesture.eraseInk, fanReplay: true, touch: gesture.touch, pointerType: gesture.pointerType };
			_rapierPaintBegin(trail.down, replay);
			_rapierPaintMove(trail.moves, replay);
			_rapierPaintEnd(trail.end, replay);
			if (!await _rapierPaintSettled(replay, alive)) break;
		}
	} finally { state.paintChosenId = chosen; }
	if (alive()) _rapierPaintEraseOneStep(trail);
}
function _rapierPaintEraseOneStep(trail) {
	const state = _rapierDrawState, stack = state.undoStack, at = trail.top ? stack.lastIndexOf(trail.top) : -1;
	if (trail.top && at < 0) return;
	const mine = stack.slice(at + 1);
	if (mine.length < 2 || !trail.base || mine.some(entry => entry.agent)) return;
	const entry = _rapierDrawHistoryDelta({ ...trail.base.recipe, fonts: trail.base.fonts }, state.recipe);
	entry.selection = (trail.base.selection || []).slice();
	if (mine[0].act) entry.act = mine[0].act;
	const shift = mine.reduce((sum, row) => row.shift ? { dx: sum.dx + row.shift.dx, dy: sum.dy + row.shift.dy } : sum, { dx: 0, dy: 0 });
	if (shift.dx || shift.dy) entry.shift = shift;
 const parts=new Map();
 for(const row of mine)for(const part of row.paintHistory?.parts||[]){const key=part.remote._identity+':'+part.surfaceId,prior=parts.get(key);parts.set(key,{...part,before:prior?.before||part.before});}
 if(parts.size)Object.defineProperty(entry,'paintHistory',{value:{parts:[...parts.values()]},configurable:true});
	state.undoStack = stack.slice(0, at + 1).concat(entry);
	for (const layer of _rapierPaintRevisionLayers()) {
		if (mine.includes(layer.flipStroke?.entry)) layer.flipStroke.entry = entry;
	}
 _rapierPaintTrimHistory();
	_rapierDrawRenderHistory();
}
function _rapierPaintQueueGesture(target, evt, gesture, settings, geom) {
	const state = _rapierDrawState;
	const paint = gesture.paint?.pending && !gesture.paint.discarded ? gesture.paint
		: (gesture.paint = { pending: true, session: state.session, tool: _rapierDrawTool(), settings, geom, downEvt: evt, moveEvents: [], ended: false, endEvt: null });
	paint.targetId = target.id;
	_rapierPaintRehydrateFor(target, gesture);
}
function _rapierPaintWaterPending() {
	return _rapierDrawState.waterStrokes?.findLast(receipt => receipt.ended)?.promise || null;
}
function _rapierPaintWaterFinish(gesture) {
	const receipt = gesture?.waterStroke;
	if (!receipt) return;
	receipt.finished = true;
	if (receipt.running) return;
	const queue = _rapierDrawState.waterStrokes, at = queue?.indexOf(receipt) ?? -1;
	if (at >= 0) queue.splice(at, 1);
	receipt.resolve();
}
async function _rapierPaintWaterRun(gesture, work) {
	const receipt = gesture.waterStroke, state = _rapierDrawState;
	receipt.running++;
	try {
		await receipt.before;
		if (receipt.finished || gesture.paint?.discarded || !state.open || state.session !== receipt.session || _rapierDrawTool() !== receipt.tool) {
			if (gesture.paint) gesture.paint.discarded = true;
			_rapierPaintWaterFinish(gesture); return;
		}
		return await work();
	} finally {
		receipt.running--;
		if (receipt.finished || gesture.paint?.discarded || !state.open || state.session !== receipt.session || _rapierDrawTool() !== receipt.tool) _rapierPaintWaterFinish(gesture);
	}
}
function _rapierPaintBegin(evt, gesture) {
	const timing = _rapierDrawState.paintTiming = { begin: performance.now(), layer: 0, brush: 0, seat: 0, blit: 0, opened: false };
	const settings = _rapierPaintAdmitSettings(gesture.eraseInk, gesture.tool), geom = _rapierDrawPointerGeometry();
	if (!gesture.fanReplay && !gesture.trail && (gesture.eraseInk || settings.erasing || settings.brushId === RAPIER_PAINT_ERASER_ID)) gesture.trail = { down: evt, moves: [], end: null, geom };
	const queued = gesture.paint = { pending: true, session: _rapierDrawState.session, tool: _rapierDrawTool(), settings, geom, downEvt: evt, moveEvents: [], ended: false, endEvt: null };
	let start;
	if (settings.mode === 'water') {
		const queue = _rapierDrawState.waterStrokes || (_rapierDrawState.waterStrokes = []);
		let resolve;
		const receipt = gesture.waterStroke = {gesture, session: queued.session, tool: queued.tool, before: queue.at(-1)?.promise, promise: new Promise(ok => { resolve = ok; }), resolve: () => resolve(), running: 0, finished: false, ended: false};
		queue.push(receipt);
		start = _rapierPaintWaterRun(gesture, () => _rapierPaintStart(evt, gesture, queued, timing));
	} else start = _rapierPaintStart(evt, gesture, queued, timing);
	void start.catch(error => _rapierPaintStrokeFailed(gesture, error));
}
async function _rapierPaintStart(evt, gesture, queued, timing) {
	const state = _rapierDrawState, {settings, geom} = queued;
	const live = () => gesture.paint === queued && !queued.discarded && state.open && state.session === queued.session;
	if (settings.mode === 'water' && !settings.erasing) { await _rapierWaterProAuthorizeActions([settings.water]); if (!live()) return; }
	if (!_rapierPaintRemoteNow(settings.mode || 'paint')) { await _rapierPaintStartPainter(settings.mode || 'paint'); if (!live()) return; }
	for (let departing; (departing = _rapierPaintDeparting());) { await departing; if (!live()) return; }
	const preceding = _rapierPaintLayer();
	if (preceding?.previousFlip || preceding?.pendingLift) { const wait = _rapierPaintFlushRevision(preceding, settings.mode === 'water'); if (wait) { await wait; if (!live()) return; } }
	const drying = _rapierPaintLayer();
	if (drying?.dryFinishing) {
		drying.surface.finishWetWork();
		if (!drying.surface.settled) { await drying.surface.sync(); if (!live()) return; }
		if (!drying.surface.wetState) { const wait = _rapierPaintFlushWet(); if (wait) { await wait; if (!live()) return; } }
	}
	if (!_rapierPaintLayerValid(_rapierPaintIsMaterialTool(settings.brushId, settings), geom, settings.mode || 'paint')) {
		const target = _rapierPaintTarget(settings.mode || 'paint');
		if (target) { _rapierPaintQueueGesture(target, evt, gesture, settings, geom); return; }
		const closing = _rapierPaintCloseLayer();
		if (closing) { await closing; if (!live()) return; }
		_rapierPaintOpenGestureLayer(evt, settings, geom);
		timing.opened = true;
	}
	timing.layer = performance.now();
	const selected = _rapierDrawSelection().length;
	if (selected) _rapierDrawSetSelection([]);
	await _rapierPaintApplyQueued(gesture);
	if (selected) _rapierPaintAfterFrame(() => { _rapierDrawMarkSelection(); _rapierDrawUpdateMenu(); });
}
// RAPIER_PAINT_LIFT radii of travel back and `_rapierPaintEnd` draws them with the load falling to
const RAPIER_PAINT_GROW_MARGIN = 96;
function _rapierPaintGrowthAt(layer, paint, p) {
	const surface = layer.surface, k = layer.scale, reach = (paint?.reach || 0) * k + RAPIER_PAINT_GROW_MARGIN;
	const x = p.x * k, y = p.y * k;
	const left = Math.max(0, Math.ceil(reach - x)), top = Math.max(0, Math.ceil(reach - y));
	const right = Math.max(0, Math.ceil(x + reach - (surface.width - 1))), bottom = Math.max(0, Math.ceil(y + reach - (surface.height - 1)));
	if (!(left || top || right || bottom)) return null;
	const quantise = globalThis.RapierDrawPaint.paintGrowStep;
	const L = quantise ? quantise(left) : left, T = quantise ? quantise(top) : top, R = quantise ? quantise(right) : right, B = quantise ? quantise(bottom) : bottom;
	return (surface.width + L + R) * (surface.height + T + B) > RAPIER_PAINT_AREA_MAX * 2
		? {left, top, right, bottom} : {left: L, top: T, right: R, bottom: B};
}
function _rapierPaintFlipBox(layer, paint, p) {
	const scale = layer.scale, reach = Math.ceil((paint.reach || 0) * scale + RAPIER_PAINT_GROW_MARGIN);
	const ox = layer.origin?.[0] || 0, oy = layer.origin?.[1] || 0;
	const px = p.x + ox, py = p.y + oy;
	let x = Math.floor((px - ox) * scale) - reach, y = Math.floor((py - oy) * scale) - reach;
	let w = reach * 2 + 2, h = w;
	if (paint.drawn) {
		const previous = paint.drawn.p, left = Math.floor((Math.min(px, previous.x + ox) - ox) * scale) - reach;
		const top = Math.floor((Math.min(py, previous.y + oy) - oy) * scale) - reach;
		const right = Math.floor((Math.max(px, previous.x + ox) - ox) * scale) + reach + 2;
		const bottom = Math.floor((Math.max(py, previous.y + oy) - oy) * scale) + reach + 2;
		if ((right - left) * (bottom - top) <= RAPIER_PAINT_AREA_MAX * 2) { x = left; y = top; w = right - left; h = bottom - top; }
	}
	return {x, y, w, h};
}
function _rapierPaintDropNextSheet(layer) {
	const next = layer?.nextSheet;
	if (!next) return;
	layer.nextSheet = null; clearTimeout(next.timer);
	if (next.canvas) next.canvas.width = next.canvas.height = 0;
}
function _rapierPaintPrepareNextSheet(layer, paint, p) {
	if (!paint || layer.mode === 'water' || layer.frame || layer.surface.width * layer.surface.height < RAPIER_PAINT_AREA_MAX) return;
	const box = _rapierPaintFlipBox(layer, paint, p), state = _rapierDrawState;
	let next = layer.nextSheet;
	if (next && (next.scale !== layer.scale || next.reach !== paint.reach || next.session !== state.session)) { _rapierPaintDropNextSheet(layer); next = null; }
	if (next?.canvas && next.canvas.width * next.canvas.height >= box.w * box.h) return;
	if (next && !next.canvas) { next.box = box; return; }
	_rapierPaintDropNextSheet(layer);
	next = layer.nextSheet = {session: state.session, scale: layer.scale, reach: paint.reach, box};
	next.timer = setTimeout(() => {
		if (layer.nextSheet !== next || !state.open || state.session !== next.session || state.paintLayer !== layer || state.gesture?.paint !== paint) return;
		try { Object.assign(next, _rapierPaintBlankCanvas(next.box.w, next.box.h)); }
		catch (_) { _rapierPaintDropNextSheet(layer); }
	}, 0);
}
function _rapierPaintGrowToHold(layer, paint, p) {
	if (!layer?.surface) return layer;
	const surface = layer.surface, k = layer.scale;
	_rapierPaintPrepareNextSheet(layer, paint, p);
	const growth = _rapierPaintGrowthAt(layer, paint, p);
	if (!growth) return layer;
	let {left: L, top: T, right: R, bottom: B} = growth;
	if (layer.mode === 'water') {
		const shows = (l, t, r, b) => globalThis.RapierDrawWater.waterSheetShows(surface.width + l + r, surface.height + t + b, surface.width, surface.height);
		if (!shows(L, T, R, B)) {
			const x = Math.floor(p.x * k), y = Math.floor(p.y * k);
			L = Math.max(0, -x + 1); T = Math.max(0, -y + 1); R = Math.max(0, x + 2 - surface.width); B = Math.max(0, y + 2 - surface.height);
			if (!(L || T || R || B)) return layer;
			if (!shows(L, T, R, B)) throw Object.assign(new Error('This Water layer cannot grow further. Set it and paint on a new layer.'), {code:'WATER_BUDGET',recoverable:true});
		}
	}
	const w = surface.width + L + R, h = surface.height + T + B;
	if (w * h > RAPIER_PAINT_AREA_MAX * 2) {
		if (layer.mode === 'water') throw Object.assign(new Error('This Water layer cannot grow further. Set it and paint on a new layer.'), {code:'WATER_BUDGET',recoverable:true});
		return _rapierPaintFlipAtCap(layer, paint, p);
	}
	const { dx, dy } = surface.grow(L, T, R, B);
	if (paint && layer.frame) paint.reached = true;
	if (!(dx || dy)) return layer;
	const ux = dx / k, uy = dy / k;
	if (layer.origin) { layer.origin[0] -= ux; layer.origin[1] -= uy; }
	if (layer.frame) {
		const f = layer.frame;
		f.c0 = [f.c0[0] - dx * f.eux - dy * f.evx, f.c0[1] - dx * f.euy - dy * f.evy];
	}
	if (paint) {
		paint.brush?.rebase?.(ux * RAPIER_PAINT_GRAIN, uy * RAPIER_PAINT_GRAIN);
	}
	const points = new Set([p]);
	if (paint) { points.add(paint); for (const s of paint.tail) points.add(s.p); if (paint.drawn) points.add(paint.drawn.p); }
	for (const q of points) { q.x += ux; q.y += uy; }
	return layer;
}
// RAPIER_PAINT_AREA_MAX * 2 (at a phone's pixel density the whole window is already millions of
function _rapierPaintFlipAtCap(layer, paint, p) {
	const state = _rapierDrawState;
	if (!paint || state.paintSetting || state.paintFlipping || !state.open) return layer;
	const frame = layer.frame;
	const nextBox = frame ? null : _rapierPaintFlipBox(layer, paint, p);
	const origin = layer.origin ? layer.origin.slice() : [-frame.pad / layer.scale, -frame.pad / layer.scale];
	const carried = new Set([p, paint, ...paint.tail.map(s => s.p)]);
	if (paint.drawn) carried.add(paint.drawn.p);
	state.paintFlipping = true;
	try {
		for (const q of carried) { q.x += origin[0]; q.y += origin[1]; }
		layer.surface.settleWet();
		for (const key of ['raf', 'holdRaf', 'dryRaf']) { if (layer[key]) cancelAnimationFrame(layer[key]); layer[key] = 0; }
		layer.dryBox = null;
		state.paintLayer = null;
		let fresh, o;
		if (frame) {
			const x = Math.floor(p.x * layer.scale), y = Math.floor(p.y * layer.scale);
			fresh = _rapierPaintOpenLocalLayer({ ...frame, pw: 1, ph: 1, c0: [frame.c0[0] + x * frame.eux + y * frame.evx, frame.c0[1] + x * frame.euy + y * frame.evy] });
			o = [(x - fresh.frame.pad) / layer.scale, (y - fresh.frame.pad) / layer.scale];
			fresh.surface.set('toothOX', layer.surface.toothOX + (o[0] - origin[0]) * layer.scale);
			fresh.surface.set('toothOY', layer.surface.toothOY + (o[1] - origin[1]) * layer.scale);
		} else {
			const scale = layer.scale, {x, y, w, h} = nextBox;
			let prepared = layer.nextSheet;
			if (prepared?.session !== state.session || prepared?.scale !== scale || prepared?.reach !== paint.reach || !prepared?.canvas) { _rapierPaintDropNextSheet(layer); prepared = null; }
			if (prepared) { clearTimeout(prepared.timer); layer.nextSheet = null; }
			fresh = _rapierPaintOpenLayer(scale, null, {x0: origin[0] + x / scale, y0: origin[1] + y / scale, w: w / scale, h: h / scale}, prepared);
			o = fresh.origin;
			fresh.surface.set('toothOX', layer.surface.toothOX + x);
			fresh.surface.set('toothOY', layer.surface.toothOY + y);
		}
		for (const q of carried) { q.x -= o[0]; q.y -= o[1]; }
		fresh.brush = paint.brush; fresh.brushId = layer.brushId; fresh.brushDip = layer.brushDip; fresh.brushRadius = layer.brushRadius;
		fresh.flipStroke = layer.flipStroke || (layer.flipStroke = {entry: null});
  if(fresh.flipStroke.history){
   const input=fresh.flipStroke.history.input,token=fresh.surface.startHistory(input);
   const history={remote:fresh.surface.remote,surfaceId:fresh.surface.id,before:{stroke:token,before:true},after:null,input};
   fresh.flipStroke.histories.push(history);fresh.flipStroke.history=history;
  }
		fresh.previousFlip = layer; layer.nextFlip = fresh;
		paint.brush?.rebase?.((origin[0] - o[0]) * RAPIER_PAINT_GRAIN, (origin[1] - o[1]) * RAPIER_PAINT_GRAIN);
		paint.scale = fresh.scale;
		const holding = paint.rollback?.layer === layer && !paint.rollback.restored;
		_rapierPaintEncodeRevision(layer, true, {retire: true, release: !holding, compressor: true});
		if (holding) { layer.surface.endStroke(paint.rollback.pixels, true, true); paint.rollback.restored = true; }
		_rapierPaintGrowToHold(fresh, paint, p);
		_rapierPaintShowLive(true);
		state.paintFlips = (state.paintFlips || 0) + 1;
		showToast('This painting reached what memory holds, so it was set as a picture. You are on a clean sheet over it -- keep going.', 'info');
		return fresh;
	} catch (error) {
		console.warn('[rapier] paint flip at cap', error);
		if (!state.paintLayer) { state.paintLayer = layer; for (const q of carried) { q.x -= origin[0]; q.y -= origin[1]; } }
		return _rapierPaintLayer() || layer;
	} finally { state.paintFlipping = false; }
}
async function _rapierPaintEncodeShapeLater(shapeId, was, captured = null, stroke = null) {
	const state = _rapierDrawState, session = state.session;
	const encodes = state.paintEncodes || (state.paintEncodes = new Map());
	const notice = typeof _rapierProgressOpen === 'function' ? _rapierProgressOpen({label: 'Finishing at full quality', after: 1500}) : null;
	const link = {to: null}, work = notice ? {progress: fraction => link.to ? link.to(fraction) : notice.set(fraction)} : null;
	let task;
	try {
		if (typeof _rapierDefaultImageProfile === 'function' && _rapierDefaultImageProfile() !== 'jxl') return;
		task = (async () => {
			await new Promise(ok => _rapierPaintTask(ok));
			const pixels = captured || await _rapierPaintPNG.decode(was), surface = pixels ? _rapierPaintPixelsSurface(pixels) : null;
			const canvas = surface ? null : await _rapierPaintRasterCanvas(was), source = surface || canvas;
			const encode = async box => {
				if (!surface) return _rapierPaintEncodeCanvasBox(canvas, box, {lossless: true});
				const out = await _rapierPaintEncodeJXL(surface, box, {lossless: true}, work);
				return {...out, shown: await _rapierPaintShownFor(surface, box)};
			};
			return _rapierPaintLosslessPieces(encode, {x0: 0, y0: 0, x1: source.width - 1, y1: source.height - 1}, _rapierPaintRasterBudget(), 0, _rapierDrawShapeById(shapeId)?.paint?.mode === 'water');
		})();
		encodes.set(was, task); _rapierPaintEncodeLinks.set(task, Object.assign(link, {end: () => notice?.end()}));
		const pieces = await task.finally(() => notice?.end());
		if (!pieces || !state.open || state.session !== session) return;
		const shape = _rapierDrawShapeById(shapeId);
		if (!shape || shape.raster !== was) return;
		if (stroke && stroke.entry !== state.undoStack.at(-1)) return;
		if (stroke) _rapierDrawSnapshot(undefined, true);
		_rapierPaintRememberFast(state.paintFastSources || (state.paintFastSources = new Map()), pieces, was);
		_rapierPaintKeepShown(pieces);
		if (pieces.length === 1) { shape.raster = pieces[0].url; _rapierDrawRenderShapes([shape.id]); }
		else if (_rapierPaintSplitShapeSync(state.recipe.shapes, shape, pieces)) _rapierDrawRenderAll();
		if (stroke) stroke.entry = _rapierDrawSealHistory();
		if (captured) _rapierPaintShownAs.delete(was);
		_rapierPaintReattachLive();
	} catch (error) { console.warn('[rapier] paint flip encode', error); }
	finally { notice?.end(); if (encodes.get(was) === task) encodes.delete(was); }
}
function _rapierPaintSample(paint, layer, s, lift) {
	layer = _rapierPaintLayer() || layer;
	layer = _rapierPaintGrowToHold(layer, paint, s.p) || layer;
	const land = paint.ownPressure ? 1 : RAPIER_PAINT_TOUCH_FLOOR + (1 - RAPIER_PAINT_TOUCH_FLOOR) * _rapierPaintSmooth(_rapierDrawClamp(s.at / paint.land, 0, 1));
	paint.brush.strokeTo(layer.surface, s.p.x * RAPIER_PAINT_GRAIN, s.p.y * RAPIER_PAINT_GRAIN, s.press * land * lift, s.p.tiltX, s.p.tiltY, s.dt, 1, 0, s.p.twist, paint.inputKind, s.p.t);
	paint.drawn = s;
}
function _rapierPaintMove(events, gesture) {
	let layer = _rapierPaintLayer();
	const paint = gesture.paint;
	if (!paint || paint.discarded) return;
	if (paint.pending) { paint.moveEvents.push(...events); return; }
	if (!layer) return;
	for (const sample of events) {
		layer = _rapierPaintLayer() || layer;
		const p = _rapierPaintEventPoint(sample, paint.geom, layer), dt = _rapierDrawClamp((p.t - paint.last) / 1000, 0.0005, 0.5);
		const pressure = paint.pressure = layer.mode === 'water' ? _rapierWaterPointerPressure(sample, paint.inputKind) : _rapierPaintPressure(sample, paint, p);
		paint.travel += Math.hypot(p.x - paint.x, p.y - paint.y);
		paint.last = p.t; paint.x = p.x; paint.y = p.y; paint.tiltX = p.tiltX; paint.tiltY = p.tiltY; paint.twist = p.twist; paint.points++;
		paint.reached = paint.reached || p.reach;
		if (layer.mode === 'water') {
			layer = _rapierPaintGrowToHold(layer, paint, p) || layer;
			paint.brush.strokeTo(layer.surface, p.x * RAPIER_PAINT_GRAIN, p.y * RAPIER_PAINT_GRAIN, pressure, p.tiltX, p.tiltY, dt, 1, 0, p.twist, paint.inputKind, p.t);
			paint.drawn = {p, dt, press: pressure, at: paint.travel};
			continue;
		}
		paint.tail.push({ p, dt, press: pressure, at: paint.travel });
		while (paint.tail.length && (paint.travel - paint.tail[0].at > paint.lift || paint.tail.length > RAPIER_PAINT_TAIL_MAX)) {
			_rapierPaintSample(paint, layer, paint.tail.shift(), 1); paint.drained = true;
		}
	}
	if (events.length) _rapierPaintHeadAt(events.at(-1).clientX, events.at(-1).clientY);
	_rapierPaintScheduleBlit();
	if (paint.holdNeeded) _rapierPaintScheduleHold(gesture);
}
function _rapierPaintEnd(evt, gesture) {
	if (typeof _rapierDrawBackupTouch === 'function') _rapierDrawBackupTouch();
	if (gesture.waterStroke) gesture.waterStroke.ended = true;
	const layer = _rapierPaintLayer(), paint = gesture.paint;
	if (!paint || paint.discarded) { if (gesture.waterStroke) _rapierPaintWaterFinish(gesture); return; }
	if (paint.pending) { paint.ended = true; paint.endEvt = evt; return; }
	paint.lifted = true;
	if (!layer) { if (gesture.waterStroke) _rapierPaintWaterFinish(gesture); return; }
	if (layer.holdRaf) { cancelAnimationFrame(layer.holdRaf); layer.holdRaf = 0; }
	const p = _rapierPaintEventPoint(evt, paint.geom, layer);
	paint.reached = paint.reached || p.reach;
	paint.travel += Math.hypot(p.x - paint.x, p.y - paint.y);
	if (layer.mode === 'water') {
		paint.brush.strokeTo(layer.surface, p.x * RAPIER_PAINT_GRAIN, p.y * RAPIER_PAINT_GRAIN, 0, p.tiltX, p.tiltY, Math.max(0, (p.t - paint.last) / 1000), 1, 0, p.twist, paint.inputKind, p.t);
		const held = _rapierPaintLiftHold(layer);
		const receipt = gesture.waterStroke;
		if (receipt) receipt.running++;
		void _rapierWaterPreflight(layer).then(() => {
			_rapierPaintReleaseStroke(gesture); layer.paintVersion = (layer.paintVersion || 0) + 1;
			return layer.surface.sync().then(() => { _rapierPaintEndDecide(layer,held); return held.promise; });
		}).catch(error => {
			if (layer.pendingLift === held) layer.pendingLift = null; held.decide(); held.resolve();
			_rapierPaintStrokeFailed(gesture,error);
		}).finally(() => { if (receipt) { receipt.running--; _rapierPaintWaterFinish(gesture); } });
		_rapierPaintScheduleBlit(); return;
	}
	paint.tail.push({ p, dt: _rapierDrawClamp((p.t - paint.last) / 1000, 0.0005, 0.5), press: 0, at: paint.travel });
	const end = paint.travel;
	const span = Math.max(1e-4, Math.min(paint.lift, end - (paint.tail.length ? paint.tail[0].at : end)));
	paint.tail.forEach((s, i) => _rapierPaintSample(paint, layer, s,
		i === 0 && !paint.drained || paint.ownPressure ? 1 : _rapierPaintSmooth(_rapierDrawClamp((end - s.at) / span, 0, 1))));
	paint.tail.length = 0;
	_rapierPaintReleaseStroke(gesture);
	const ended = _rapierPaintLayer() || layer;
	ended.paintVersion = (ended.paintVersion || 0) + 1;
	if (ended.frame && !paint.reached) { _rapierPaintRefuseUnreached(); return; }
	const held = _rapierPaintLiftHold(ended);
	_rapierPaintScheduleBlit();
	ended.surface.sync({materialOnly: true}).then(() => _rapierPaintEndDecide(ended, held), () => { if (ended.pendingLift === held) ended.pendingLift = null; held.decide(); held.resolve(); });
}
function _rapierPaintEndDecide(layer, held) {
	if (layer.pendingLift !== held) { held.decide(); return; }
	const wash = layer.mode !== 'water' && layer.surface.wetState && !_rapierDrawState.paintSetting && !layer.pendingOverflow;
	if (layer.mode === 'water' || wash) {
		layer.flipStroke ||= {entry:null};
		const job = _rapierPaintEncodeRevision(layer, false, {peek: wash});
		layer.pendingLift = null; held.deciding = false; held.decide();
		job.promise.then(() => {
			if (_rapierDrawState.paintLayer === layer && !layer.surface?.gone && layer.surface?.wetState) {
				_rapierPaintShowLive(true); _rapierPaintScheduleDry(layer);
			}
		}, error => _rapierPaintNotKept(layer,error)).finally(() => held.resolve());
		return;
	}
	if (layer.surface.wetState && !_rapierDrawState.paintSetting?.auto) {
		layer.pendingLift = null; held.deciding = false; held.decide(); held.resolve();
		_rapierPaintScheduleBlit(); _rapierPaintScheduleDry(layer); _rapierDrawRenderHistory();
		return;
	}
	_rapierPaintCommitSoon(layer);
}
function _rapierPaintLiftHold(layer) {
	if (layer.pendingLift) return layer.pendingLift;
	let resolve, decide;
	const held = {session: _rapierDrawState.session, raf: 0, deciding: true, promise: new Promise(ok => { resolve = ok; }), resolve: () => resolve(), decided: new Promise(ok => { decide = ok; }), decide: () => decide()};
	layer.pendingLift = held;
	_rapierDrawRenderHistory();
	return held;
}
function _rapierPaintCommitSoon(layer = _rapierPaintLayer()) {
	if (!layer) return null;
	const held = layer.pendingLift || _rapierPaintLiftHold(layer);
	if (!held.deciding) return held.promise;
	held.deciding = false; held.decide();
	_rapierPaintScheduleBlit();
	_rapierDrawRenderHistory();
	if (typeof document !== 'undefined' && document.hidden) _rapierPaintWakeLift(layer, held);
	else held.raf = requestAnimationFrame(() => {
		held.raf = 0;
		_rapierPaintWakeLift(layer, held);
	});
	return held.promise;
}
function _rapierPaintWakeLift(layer, held) {
	if (layer.pendingLift !== held || held.queued || held.deciding) return;
	held.queued = true;
	_rapierPaintTask(() => {
		held.queued = false;
		try { _rapierPaintFlushLift(layer, held); }
		catch (error) { layer.pendingOverflow = true; if (!_rapierPaintLossSaid(error)) showToast('The painting could not be kept. It is still open: ' + String(error?.message || error), 'error'); }
	});
}
function _rapierPaintFlushLift(layer, held = layer?.pendingLift) {
	if (!held || layer.pendingLift !== held) return;
	if (held.raf) cancelAnimationFrame(held.raf);
	layer.pendingLift = null;
	try {
		if (_rapierDrawState.session === held.session && _rapierPaintLayer() === layer) _rapierPaintCommit();
	} catch (error) { layer.pendingLift = held; throw error; }
	finally { if (layer.pendingLift !== held) held.resolve(); }
}
function _rapierPaintRefuseUnreached() {
	showToast('That stroke landed off the painting -- nothing to paint on there', 'info');
}
function _rapierPaintSettleOverflow() {
	const state = _rapierDrawState, layer = state.paintLayer, session = state.session;
	const owns = () => state.open && state.session === session && state.paintLayer === layer;
	return _rapierPaintAfter(_rapierPaintFlushWet(false, owns), () => {
		if (!owns() || !layer?.pendingOverflow) return false;
		const kept = _rapierPaintCommit(true, null, false, owns);
		return kept ? kept.then(() => true) : true;
	});
}
function _rapierPaintDiscardOverflow(current = null) {
	const state = _rapierDrawState, layer = state.paintLayer, session = state.session;
	const owns = () => state.open && state.session === session && state.paintLayer === layer && (!current || current());
	return _rapierPaintAfter(_rapierPaintFlushWet(true, owns), () => {
		if (!owns() || !layer?.pendingOverflow) return false;
		if (state.paintSetting) { showToast('Keeping the painting first. Undo is back in a moment.', 'info'); return true; }
		const was = state.paintClosing, closing = {layer};
		state.paintClosing = closing;
		const release = () => { if (state.session === session && state.paintClosing === closing) state.paintClosing = was; };
		let closed;
		try { closed = _rapierPaintCloseLayer(owns); } finally { if (!closed) release(); }
		const finish = () => {
			if (!state.open || state.session !== session || state.paintLayer || current && !current()) return false;
			_rapierPaintSyncPaper(); showToast('Discarded the painting that was too large to keep', 'info'); return true;
		};
		return closed ? closed.then(finish).finally(release) : finish();
	});
}
function _rapierPaintMetadata(layer, brush, width, height, scale, replay) {
	return {brush, px:[width,height], scale, ...(layer.mode === 'water' ? {mode:'water',paper:replay?.entries.at(-1)?.sheet?.options?.paper || replay?.paper || layer.waterPaper || 'cold-press'} : {}), ...(replay ? {replay} : {})};
}
function _rapierPaintWaterReplay(layer, capture, box, sheet = layer.surface.waterSheet()) {
	if (!capture) return layer.paintReplay || null;
	return globalThis.RapierDrawAgentPaint.waterReplayAt(layer.paintReplay, capture, box, {raster:null,px:[sheet.width,sheet.height],scale:layer.scale,sheet,resume:layer.waterResume});
}
function _rapierPaintReplayAt(layer, records, box) {
	if (!layer.paintReplay) return null;
	const replay = _rapierDrawHistoryCopy(layer.paintReplay);
	for (const record of records || []) if (box && record.commands.some(command => command.target === 'stroke')) {
		const entry = {..._rapierDrawHistoryCopy(record), crop: record.crop || [box.x0, box.y0, box.x1, box.y1]};
		const at = replay.entries.findIndex(row => row.id === entry.id);
		if (at < 0) replay.entries.push(entry); else replay.entries[at] = entry;
	}
	if (!globalThis.RapierDrawAgentPaint.paintReplayFits(replay)) { layer.paintReplay = null; return null; }
	return replay;
}
function _rapierPaintLayerSnapshot(defer = false) {
	const layer = _rapierPaintLayer(); if (!layer || !layer.surface) return null;
	if (!defer) _rapierPaintDropSnapshots(layer);
	const surface = layer.surface;
	if (!defer || surface._wetWork) surface.finishWetWork();
	return _rapierPaintAfter(surface.settled || surface.failure ? null : surface.sync(), () => _rapierPaintSnapshotOf(layer, surface, defer));
}
function _rapierPaintSnapshotOf(layer, surface, defer) {
	if (_rapierPaintLayer() !== layer || layer.surface !== surface) return null;
	if (layer.mode === 'water') {
		const place = _rapierPaintPlace(layer), session = _rapierDrawState.session;
		return surface.readBounds().then(result => {
			if (!result.box || session !== _rapierDrawState.session) return null;
			const {geom,pw,ph,s} = _rapierPaintGeomOf(place,result.box), sheet = result.waterSheet;
			const replay = _rapierPaintWaterReplay(layer,result.waterReplay,result.box,sheet);
			const snapshot = {id:layer.id ?? null,geom,raster:null,encode:null,paint:_rapierPaintMetadata(layer,layer.brushId,pw,ph,s,replay),retire:layer.retire?.slice()};
			if (defer) snapshot.encode = () => _rapierPaintPNG.compressed(result.pixels).catch(() => _rapierPaintPNG.encode(result.pixels));
			else snapshot.raster = _rapierPaintPNG.encode(result.pixels);
			return snapshot;
		});
	}
	const box = surface.bounds();
	if (!box) return null;
	const {geom, pw, ph, s} = _rapierPaintGeomOf(layer, box);
	const cached = layer.checkpoint?.revision === surface.revision;
	const replay = _rapierPaintReplayAt(layer, layer.surface.peekReplay(), box);
	const snapshot = { id: layer.id != null ? layer.id : null, geom, raster: cached ? layer.checkpoint.raster : null, encode: null, paint: _rapierPaintMetadata(layer, layer.brushId, pw, ph, s, replay), retire: layer.retire?.slice() };
	if (cached) return snapshot;
	if (!defer) return surface.readRGBA8(box).then(px => { snapshot.raster = _rapierPaintPixelsToDataURL(px); return snapshot; });
	const owner = _rapierPaintWorker(layer), held = {surface, box, revision: surface.revision, session: _rapierDrawState.session, width: surface.width, height: surface.height};
	if (owner) snapshot.encode = _rapierPaintCaptureSnapshot(layer, owner, held);
	else { const pixels = surface.readRGBA8(box); snapshot.encode = () => pixels.then(px => _rapierPaintPNG.compressed(px).catch(() => _rapierPaintPNG.encode(px))); }
	return snapshot;
}
function _rapierPaintCommit(keep = false, kept = null, custody = false, current = null) {
	if (current && !current()) return null;
	if (keep || custody) { const wait = _rapierPaintFlushRevision(undefined, true); if (wait) return wait.then(() => _rapierPaintCommit(keep, kept, custody, current)); }
	const state = _rapierDrawState, layer = _rapierPaintLayer();
	if (!layer) return null;
	const existing = layer.id != null ? _rapierDrawShapeById(layer.id) : null;
	if (keep && !kept && layer.mode === 'water' && layer.surface.settled && !layer.surface._wetWork && !state.gesture && !layer.flipStroke && !layer.retire?.length && !layer.waterMaterial &&
			existing && layer.published?.revision === layer.surface.revision && layer.published.raster === existing.raster && existing.paint?.brush === layer.brushId) return null;
	if (kept) return _rapierPaintPublish(layer, keep, kept, custody);
	if (layer.mode !== 'water' && !state.gesture && layer.surface.settled && !layer.surface.wetState && !layer.surface._wetWork) {
		const held = layer.checkpoint, capture = held?.capture, surface = layer.surface, box = surface.bounds();
		if (capture?.surface === surface && held.revision === surface.revision && capture.width === surface.width && capture.height === surface.height &&
				capture.toothOX === surface.toothOX && capture.toothOY === surface.toothOY && box &&
				['x0','y0','x1','y1'].every(key => box[key] === capture.box[key])) return _rapierPaintPublish(layer, keep, held.raster, custody);
	}
	layer.paintVersion = (layer.paintVersion || 0) + 1;
	if (layer.dryRaf) { cancelAnimationFrame(layer.dryRaf); layer.dryRaf = 0; }
	if(layer.mode==='water')layer.surface.finishWetWork();else layer.surface.settleWet();
	layer.dryFinishing = false; layer.dryBox = null;
	if (layer.raf) cancelAnimationFrame(layer.raf);
	layer.raf = 0;
	if (layer.holdRaf) { cancelAnimationFrame(layer.holdRaf); layer.holdRaf = 0; }
	return _rapierPaintEncodeRevision(layer, keep, {custody}).promise;
}
function _rapierPaintPublishEmpty(layer) {
	const state = _rapierDrawState, existing = layer.id != null ? _rapierDrawShapeById(layer.id) : null;
	if (existing || layer.retire?.length) {
		const gone = new Set(layer.retire || []); if (existing) gone.add(existing.id);
		_rapierDrawSnapshot(); state.recipe.shapes = state.recipe.shapes.filter(shape => !gone.has(shape.id));
		remapRefractionRecipeSources(state.recipe, new Map([...gone].map(id => [id, null])));
		_rapierDrawRenderAll(); _rapierDrawSealHistory();
	}
	_rapierPaintCloseLayer(); _rapierPaintSyncPaper();
}
function _rapierPaintPublish(layer, keep, kept, custody, synced = false, record = null, waterRead = null) {
	const state = _rapierDrawState, surface = layer.surface;
	if (layer.session != null && layer.session !== state.session) return null;
	if (!synced && !surface.settled && !surface.failure) return surface.sync().then(() => _rapierPaintPublish(layer, keep, kept, custody, true, record, waterRead));
	layer.paintVersion = (layer.paintVersion || 0) + 1;
	const box = surface.bounds();
	const existing = layer.id != null ? _rapierDrawShapeById(layer.id) : null;
	if (!box) { _rapierPaintPublishEmpty(layer); return null; }
	const budget0 = _rapierPaintRasterBudget();
	const pieces = Array.isArray(kept) ? kept : null;
	const raster = pieces ? pieces[0].url : kept;
	const budget = budget0;
	if (raster.length > budget && !keep) {
		_rapierPaintPublish(layer, true, raster, custody, true, record, waterRead);
		if (state.paintLayer === layer && !state.paintSetting) void _rapierPaintSetLayer({ auto: true, kib: Math.round(raster.length / 1024) });
		return null;
	}
	if (!keep) {
		const others = state.recipe.shapes.reduce((total, shape) => total + (shape !== existing && shape.recognized === 'paint' && typeof shape.raster === 'string' && !_rapierPaintPNG.isStored(shape.raster) ? shape.raster.length : 0), 0);
		if (others + raster.length > globalThis.RapierDrawCore?.RAPIER_DRAW_RASTER_TOTAL) {
			const already = layer.pendingOverflow;
			layer.pendingOverflow = true;
			if (record) surface.restoreReplay?.(record);
			if (!already) showToast('This drawing’s paintings together are at what one document picture can hold. Set this painting to keep it, or download the drawing and start another.', 'info');
			return null;
		}
	}
	layer.pendingOverflow = false;
	if (existing && !pieces && !layer.retire?.length && !layer.flipStroke && layer.published &&
			layer.published.raster === raster && layer.published.revision === surface.revision && existing.paint?.brush === layer.brushId) {
		_rapierPaintShowLive(false);
		_rapierPaintSyncPaper();
		return null;
	}
	const built = _rapierPaintGeomOf(layer, box), pw = built.pw, ph = built.ph, s = built.s, geom = built.geom;
	const stroke = layer.flipStroke;
	const joins = !!stroke?.entry && stroke.entry === state.undoStack.at(-1);
	const priorShift = custody || joins ? state.undoStack.at(-1)?.shift : null;
	const replay = layer.mode === 'water' ? _rapierPaintWaterReplay(layer, waterRead?.waterCapture || layer.waterCapture, box, waterRead?.waterSheet || layer.waterSheet) : _rapierPaintReplayAt(layer, record || surface.takeReplay?.() || null, box);
	const amended = !joins && !custody && !pieces && _rapierPaintAmendDeparted(layer, stroke, geom, raster, _rapierPaintMetadata(layer, layer.brushId, pw, ph, s, replay));
	if (amended) {
		if (replay) layer.paintReplay = replay;
		layer.raster = raster; layer.geom = JSON.stringify(geom);
		layer.checkpoint = {revision: surface.revision, raster}; layer.published = {revision: surface.revision, raster};
		_rapierPaintSyncPaper(); _rapierPaintHandBack(layer, [amended.id]); _rapierPaintShowLive(false);
		return null;
	}
	_rapierDrawSnapshot(undefined, custody || joins);
	if (layer.mode === 'water' && typeof _rapierWaterAdoptPaper === 'function') _rapierWaterAdoptPaper();
	const grown = !layer.frame && _rapierDrawGrowCanvas(geom.cx - geom.w / 2, geom.cy - geom.h / 2, geom.cx + geom.w / 2, geom.cy + geom.h / 2);
	state.paintLastGrown = grown || null;
	if (grown) { geom.cx += grown.dx; geom.cy += grown.dy; }
	if (replay) layer.paintReplay = replay;
	if (layer.mode === 'water' && waterRead) { layer.waterCapture = waterRead.waterCapture; layer.waterSheet = waterRead.waterSheet; }
	let shape = existing;
	if (shape) { shape.geom = geom; shape.raster = raster; shape.paint = _rapierPaintMetadata(layer, layer.brushId, pw, ph, s, replay); }
	else {
		shape = { id: _rapierDrawNextId(), stroke: null, recognized: 'paint', asDrawn: false, brush: 'ink', style: null, geom, raster, paint: _rapierPaintMetadata(layer, layer.brushId, pw, ph, s, replay) };
		state.recipe.shapes.push(shape);
		_rapierPaintChooseCreated(shape);
	}
	layer.id = shape.id; layer.raster = raster; layer.geom = JSON.stringify(geom);
	layer.checkpoint = {revision: surface.revision, raster};
	layer.published = {revision: surface.revision, raster};
	let made = null, retired = false;
	if (pieces && pieces.length > 1) made = _rapierPaintSplitShapeSync(state.recipe.shapes, shape, pieces.map(piece => ({ url: piece.url, box: { x0: piece.box.x0 - box.x0, y0: piece.box.y0 - box.y0, x1: piece.box.x1 - box.x0, y1: piece.box.y1 - box.y0 } })));
	if (layer.retire?.length) {
		const gone = new Set(layer.retire); layer.retire = null;
		const before = state.recipe.shapes.length;
		state.recipe.shapes = state.recipe.shapes.filter(row => !gone.has(row.id) || row === shape);
		retired = state.recipe.shapes.length !== before;
		if (!made && shape.paint?.group != null && !state.recipe.shapes.some(row => row !== shape && row.paint?.group === shape.paint.group)) delete shape.paint.group;
		remapRefractionRecipeSources(state.recipe, new Map([...gone].map(id => [id, shape.id])));
	}
	if (grown || made || retired) _rapierDrawRenderAll(); else { _rapierDrawRenderShapes([shape.id]); _rapierDrawUpdateMenu(); }
	_rapierPaintSealRevision(layer, stroke, priorShift, grown);
	if (layer.mode === 'water') _rapierPaintSyncPaper();
	_rapierPaintHandBack(layer, made ? made.map(row => row.id) : [shape.id]);
	_rapierPaintShowLive(false);
	if (layer.mode !== 'water') _rapierPaintSyncPaper();
	return null;
}
const RAPIER_PAINT_DECODE_WAIT_MS = 30000;
function _rapierPaintHandBack(layer, ids) {
	const svg = _rapierDrawState.svg;
	const images = svg ? ids.map(id => svg.querySelector('[data-shape-id="' + id + '"] image[data-rapier-paint]')).filter(image => typeof image?.decode === 'function') : [];
	if (!images.length) return null;
	const token = {};
	let settled = false;
	const decoded = Promise.allSettled(images.map(image => image.decode())).then(() => { settled = true; });
	token.promise = Promise.race([decoded, new Promise(done => setTimeout(done, RAPIER_PAINT_DECODE_WAIT_MS))]).then(() => {
		if (layer.decoding !== token) return;
		layer.decoding = null;
		if (!settled) { decoded.then(() => { if (!layer.decoding) _rapierPaintShowLive(layer.liveRequest ?? false, layer); }); return; }
		_rapierPaintShowLive(layer.liveRequest ?? false, layer);
	});
	layer.decoding = token;
	return token.promise;
}

function _rapierPaintWanted() {
	const state = _rapierDrawState;
	return !!state.open && (['paint', 'water'].includes(_rapierDrawTool()) || !!state.recipe?.shapes.some(shape => shape.recognized === 'paint'));
}
function _rapierPaintSyncPaper() {
	const state = _rapierDrawState, surface = state.surface;
	if (!surface) return;
	if (!Object.getOwnPropertyDescriptor(surface, 'rapierPaintFacts')) Object.defineProperty(surface, 'rapierPaintFacts', { enumerable: false, get: _rapierPaintFacts });
	const choice = state.recipe?.paper;
	const paper = choice === 'white' ? true : choice === 'black' ? false : _rapierPaintWanted();
	const black = !paper && choice === 'black';
	surface.querySelector('.rapier-draw-stage').style.backgroundColor = 'color-mix(in srgb,var(--draw-paper) 86%,var(--draw-paper-ink))';
	surface.style.setProperty('--draw-paper', paper ? '#fff' : black ? '#000' : 'var(--color-bg)');
	surface.style.setProperty('--draw-paper-ink', paper ? '#000' : black ? '#fff' : 'var(--color-text)');
	_rapierPaintWarmTarget();
	const same = paper === !!state.paper && black === !!state.paperBlack;
	state.paper = paper; state.paperBlack = black;
	if (typeof _rapierDrawSyncCanvasMenu === 'function') _rapierDrawSyncCanvasMenu();
	if (same) return;
	surface.classList.toggle('rapier-draw-surface--paper', paper);
	surface.classList.toggle('rapier-draw-surface--black', black);
	_rapierDrawGlyphCache.clear();
	_rapierDrawUpdateInkBtn(); _rapierDrawUpdateShapeRow(); _rapierPaintUpdateStrip();
	_rapierDrawRenderAll();
}

function _rapierPaintWarmView(geom = _rapierDrawPointerGeometry()) {
	const { rect, vb } = geom, canvas = _rapierDrawState.recipe.canvas;
	return [canvas.w, canvas.h, rect.left, rect.top, rect.width, rect.height, vb.x, vb.y, vb.width, vb.height, innerWidth, innerHeight, globalThis.devicePixelRatio || 1].join(',');
}
function _rapierPaintWarmTarget() {
	const state = _rapierDrawState;
	if (!state.open || !['paint', 'water'].includes(_rapierDrawTool()) || state.gesture || _rapierPaintLayerValid()) return;
	const target = _rapierPaintTarget();
	if (target && _rapierPaintHistoryFor(target)) return;
	if (!_rapierPaintRemoteNow()) { _rapierPaintStartPainter().then(() => _rapierPaintWarmTarget(), () => {}); return; }
	if (_rapierDrawTool() === 'water' && !target) return;
	if (target) { _rapierPaintRehydrateFor(target); return; }
	if (!state.paintLayer && !state.recipe.shapes.length && !state.recipe.strokes.length) {
		const view = _rapierPaintWarmView();
		try { _rapierPaintOpenLayer().warmView = view; } catch (_) { _rapierPaintCloseLayer(); }
	}
}


function _rapierPaintTrimHistory() {
 const state=_rapierDrawState,entries=state.open?[...state.undoStack,...state.redoStack]:[];
 const parts=entries.flatMap(entry=>entry.paintHistory?.parts||[]);
 if(state.open)for(const layer of _rapierPaintRevisionLayers())for(const stroke of [layer.flipStroke,...(layer.revisions||[]).map(job=>job.stroke)])parts.push(...(stroke?.histories||[]));
 for(const {remote}of _rapierPaintPainters.values()) {
  if(!remote||remote.failure)continue;
  const sheets=new Map();
  for(const h of new Set(parts)){if(h.remote!==remote)continue;const points=sheets.get(h.surfaceId)||[];points.push(...[h.before,h.after].filter(Boolean));sheets.set(h.surfaceId,points);}
  remote.client.request('historyKeep',{keep:[...sheets].map(([surfaceId,points])=>({surfaceId,points}))}).catch(()=>{});
 }
}
function _rapierPaintReplayHistory(entry,side) {
 const parts=entry?.paintHistory?.parts;if(!parts?.length)return null;
 return Promise.all(parts.map(h=>{
 const point=h[side];if(!point||h.remote.failure)return null;
 return h.remote.client.request('historyReplay',{surfaceId:h.surfaceId,point}).then(result=>{
  if(point.digest && result.digest!==point.digest)throw new Error('The painting history did not reproduce its pixels');
  return result;
 });}));
}

function _rapierPaintHistoryFor(shape) {
 for(const entry of [..._rapierDrawState.undoStack,..._rapierDrawState.redoStack])for(const h of entry.paintHistory?.parts||[]){
  if(!h.shown||h.remote.failure||h.shapeId!==shape.id)continue;
  const kept=entry.delta?.shapes?.[shape.id]?.[h.shown],point=h[h.shown];
  if(point?.place&&point.meta&&kept?.raster===shape.raster&&JSON.stringify(kept.geom)===JSON.stringify(shape.geom)&&JSON.stringify(kept.paint)===JSON.stringify(shape.paint))return {...h,point,geom:shape.geom};
 }
 return null;
}
function _rapierPaintHistoryWalk(entry,side) {
 const parts=entry?.paintHistory?.parts||[],ids=new Set(parts.map(h=>h.shapeId));
 for(const row of [..._rapierDrawState.undoStack,..._rapierDrawState.redoStack])for(const part of row.paintHistory?.parts||[])if(ids.has(part.shapeId))delete part.shown;
 for(const part of parts)part.shown=side;
}
function _rapierPaintOpenHistoryLayer(history,id,mode) {
 const {meta}=history.point,place=structuredClone(history.point.place);
 const projected=_rapierPaintGeomOf(place,history.point.box).geom,dx=history.geom.cx-projected.cx,dy=history.geom.cy-projected.cy;
 if(place.frame){place.frame.c0[0]+=dx;place.frame.c0[1]+=dy;}else if(place.origin){place.origin[0]+=dx;place.origin[1]+=dy;}
 const origin=place.origin||[0,0];
 const layer=_rapierPaintOpenLayer(place.scale,id,{x0:origin[0],y0:origin[1],w:meta.width/place.scale,h:meta.height/place.scale},null,mode);
 layer.frame=place.frame?structuredClone(place.frame):null;
 layer.origin=place.origin?place.origin.slice():null;
 _rapierPaintPlaceLive();return layer;
}
