// SPDX-License-Identifier: AGPL-3.0-only
// The Paint tool: MyPaint brushes (draw/paint.mjs, draw/brushes.mjs) on a raster layer inside the
// drawing. A layer is a `paint` shape: its pixels are one PNG the SVG carries as an <image>, so the
// drawing renders in every browser and viewer exactly as painted; the recipe keeps the frame, the
// brush name and the pixel grid. Consecutive strokes go on one layer (the live surface stays in
// memory) so brushes that smudge, erode or blend act on what was just painted. The stroke's target
// is the painting the person chose (`state.paintChosenId`, written only by `_rapierDrawSetSelection`)
// for as long as it stays eligible and the document is the same, else the topmost eligible
// painting (`_rapierPaintTarget`); a resize or a turn keeps painting into the same layer through the
// transformed target frame, and only removal, a lock or a document change ends it.
// Paint is pigment on paper: the stage shows light paper while painting, so the physics a wet brush
// obeys (a subtractive wash needs a ground) is the physics the hand sees. The committed pixels carry
// their own alpha and nothing is put behind them in the document.
// The engine itself is not here: this tool paints through the painter (draw/paint-worker.mjs, one worker a page, or the same
// code run in process where no worker can start) and holds a mirror of each surface (draw/paint-remote.mjs), never its material.
const {parseBrush, serializeBrush, paintBrushDip, paintBrushRadiusOffset, paintBrushHead, paintSizeDefault} = globalThis.RapierDrawPaint;
const _rapierPaintPNG = globalThis.RapierDrawPaint.createPaintPNGCodec();
const {RAPIER_PAINT_BRUSHES, paintBrushById} = globalThis.RapierDrawBrushes;

// Raster pixels per canvas unit: at least two; a layer opened on a stage is painted at the stage's
// own device pixels up to three (`_rapierPaintLayerScale`), within a pixel budget.
const RAPIER_PAINT_SCALE = 2, RAPIER_PAINT_SCALE_MAX = 3, RAPIER_PAINT_AREA_MAX = 6000000;
// A Water sheet's pixel budget: about 64 bytes of material per pixel, 2048 by 1536 at most.
const RAPIER_WATER_SHEET_PIXELS = 2048 * 1536;
// The brush's grain: how many of the brush's own canvas units make one drawing unit. A MyPaint
// preset is tuned in canvas pixels at 100% zoom; Brien Dieterle's reference sheet was painted on a
// canvas far denser than a 390-unit phone column, then shrunk, which is what turns each preset's
// dabs into fine texture instead of visible circles. Rendered at one unit per drawing unit the
// marks are the same engine seen under a microscope; at three they match the sheet's own feather
// barbs, bristle streaks and watery pulls. The raster is untouched (the surface's scale law
// above): only the brush's coordinates are multiplied and the surface told how many raster pixels
// one of its units now covers. The Size slider still ranges over the preset's own default.
const RAPIER_PAINT_GRAIN = 3;
// Simulated pressure for a finger (`_rapierPaintPressure`): where it starts, its firm and light
// ends, the speed (canvas units per second) at which it has eased most of the way to light, and
// how much of the way a sample moves toward its target.
// Speed as a stand-in for the hand, for a device that reports no contact geometry: a hand bears
// down when it slows and lifts as it flicks. `exp(-speed / SPEED)` is that as a dimensionless 0..1
// slowness -- 1 at rest, 0 on a flick -- which then goes through the SAME `_rapierPaintFeel` curve
// the contact patch does, so both signals answer across the whole of 0..1 and can be blended.
//
// The easing is a time constant, not a fixed fraction per sample, so the same physical stroke
// comes out the same at 60 Hz and at 240 Hz (a phone that delivers coalesced samples): at 60 Hz
// the step is exactly 0.3, and every other rate matches it.
// SPEED is the pace at which slowness has fallen to 1/e. 900 puts the whole of an ordinary
// stroke's pace across the whole of the range (200 u/s -> 0.90, 1000 -> 0.61, 2000 -> 0.41, 4000
// -> 0.21 on Firm). The gamma in `_rapierPaintFeel` is what keeps a confident stroke from washing
// out at the fast end.
const RAPIER_PAINT_SIM_START = 0.9, RAPIER_PAINT_SIM_SPEED = 900, RAPIER_PAINT_SIM_TAU = 46.73;
// Light reads speed over a much shorter distance, so a deliberate slow pull already lands inside
// the watery presets' own near-pure-blending range instead of needing a flick to get there.
const RAPIER_PAINT_SIM_LIGHT_SPEED = 350;
// A touch pressure that moves is real (Android hands Chrome the digitizer's contact pressure); a
// platform without one reports the same number for every touch (the spec's 0.5, or one constant),
// which says nothing. So a reported touch pressure is trusted only once it has been seen to vary by
// RAPIER_PAINT_TOUCH_VARIES across the session; the speed model stands in until then.
// A fixed `raw * gain` with a floor cannot serve both ends: Android fingers report roughly 0.05-0.5,
// and a linear squeeze leaves Water's own <=0.3 near-pure-mixing line and Blender's long-drag range
// barely reachable. Trusted real pressure is normalised to the range THIS finger has actually shown
// this session (running min/max below), so its own hardest press this session reaches 1 and its own
// lightest reaches 0, whatever the raw digitizer numbers are -- the same discipline as a mouse's own
// device-independent, dimensionless pressure convention, applied to a sensor that reports its own
// physical units. A pen keeps its own reported pressure exactly (real reserve, not a signal that
// needs a session to calibrate).
const RAPIER_PAINT_TOUCH_VARIES = 0.08;
const _rapierPaintTouchSeen = { min: Infinity, max: -Infinity };
// The finger's own weight. A fingertip is soft: press harder and it flattens, so the patch it puts
// on the glass grows. Android measures that patch (MotionEvent's touchMajor/touchMinor) and Chrome
// hands it to the page as a PointerEvent's `width` and `height` in CSS pixels -- which is the one
// real, continuous "how hard am I pressing" a phone has, since `pressure` for a touch is a constant
// on most Android devices. Rapier reads the patch's own diameter (the geometric mean of the two
// axes, so a finger rolled onto its side is not read as a harder press) and calibrates it to this
// person's own hand.
//
// The patch is believed AT ONCE, against a real finger's own geometry: about 9 px of contact
// diameter for a light touch and about 26 px for a firm one, which is the range a fingertip
// actually makes on a phone. Waiting to see it vary first would leave a first stroke, and an
// even-handed person for good, on the speed model. The session only ever WIDENS that band -- a
// smaller hand, a heavier press -- and never narrows it, so a person is calibrated to themselves
// within a stroke or two. The speed model remains for a device that reports no contact geometry at
// all.
const RAPIER_PAINT_PATCH_LIGHT = 9, RAPIER_PAINT_PATCH_FIRM = 26;
// And the patch answers across the WHOLE of 0..1. EVERY preset curve -- Rapier's, Brien Dieterle's,
// and any a person brings or an assistant writes -- is authored across 0..1, so a pressure confined
// to 0.6..1.0 would leave most of every curve unreachable and radius, opacity, smudge and the wet
// loads pinned near their top end.
//
// With a real contact patch there is no reason for a floor: a light mark means the person actually
// touched lightly. So the strength toggle is a SENSITIVITY curve over the full range, not a floor
// that clips it. Firm makes a given press yield more paint, Light less, and neither throws away the
// ends. A touch still never reads as nothing (the floor below): a stroke must always leave a mark.
// Firm and Light are two POSITIONS on one touch scale, and a preset says where its own pair sits
// (`rapier_touch` in its .myb, read by this file alone -- the engine is handed a pressure and never
// asks where it came from). Scumble, whose character is a light hand, declares 1: its Firm is this
// scale's Light, and its Light is the third position, lighter again. Nothing special-cases a brush
// id.
//
// `speed` matters as much as the curve: the toggle changes how fast a stroke has to move before it
// reads as light at all, and a preset shifted up the scale must take that with it -- a gain on the
// preset's own pressure cannot.
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
// Where this preset's own Firm sits on the scale above; every brush that says nothing starts at 0.
function _rapierPaintTouchOf(id) {
	try { return _rapierDrawClamp(_rapierPaintDefFor(id).tool?.rapier_touch || 0, 0, 2); } catch (_) { return 0; }
}
// How many usual lifts this preset's tail is held back and tapered over (`rapier_lift` in its .myb; a flat's streaks fade over a longer one).
function _rapierPaintLiftOf(id) {
	try { return _rapierDrawClamp(_rapierPaintDefFor(id).tool?.rapier_lift || 1, 1, 4); } catch (_) { return 1; }
}
// The position a gesture actually paints at: the person's toggle, carried up by the preset's own.
function _rapierPaintTouchLevel(id, light) {
	return _rapierDrawClamp((light ? 1 : 0) + _rapierPaintTouchOf(id), 0, RAPIER_PAINT_TOUCH.length - 1);
}
// Believing the patch at once is right; believing it ALONE is not. A digitizer that reports one
// constant width for every touch (plenty do) would pin the pressure at whatever that constant maps
// to, for the whole session, for every preset, and shut the speed model out. So the patch earns its
// weight: the blend is by how much spread the patch has actually SHOWN (`lo`/`hi`, the raw
// readings), reaching the patch alone once it has moved RAPIER_PAINT_PATCH_TRUST px. A real finger
// opens that inside one stroke; a constant never does and the hand is read from speed. There is no
// cliff between the two: one continuous weight, and no state that has to be right first time.
// How many pixels the contact patch must be seen to vary across before it is fully believed. A
// panel whose reported width jitters by a single pixel -- which is noise, not a press -- must not
// earn a vote. A real finger swings its contact width by tens of pixels between a light touch and a
// firm one (14 to 52 on the emulated digitizer), so belief is scaled against that, not against
// jitter.
const RAPIER_PAINT_PATCH_TRUST = 12;
// A brush lands and lifts; it does not begin and end at full width. Without a taper the speed model
// reads slow as hard, and a stroke is slowest exactly where it starts and stops, so it lands fatter
// than its own body. Travel, not time: a careful slow stroke must not earn a longer fat ramp than a
// quick one. In brush radii of travel.
const RAPIER_PAINT_LAND = 1.2, RAPIER_PAINT_LIFT = 1.5, RAPIER_PAINT_LIFT_WET = 0.25, RAPIER_PAINT_TOUCH_FLOOR = 0.22;
const RAPIER_PAINT_LAND_MIN = 7, RAPIER_PAINT_LIFT_MIN = 10;
// The most samples the lift lag may hold back before it lays them anyway: about a second of a 240 Hz
// panel. The lag is a DISTANCE, so a hand that stops moving never releases by distance at all.
const RAPIER_PAINT_TAIL_MAX = 240;
// The two dabs that seat the brush at the down point exist to start the stroke's STATE, not to lay
// paint. At the landing floor they printed a round cap three quarters of full width -- the blunt
// blob that made Pen read as a vector rather than a nib, measured 1.36 where its own body is 1.00.
// A tap still leaves a dot; it is now the dot a light touch makes.
const RAPIER_PAINT_SEAT = 0.12;
const _rapierPaintSmooth = k => k * k * (3 - 2 * k);
const _rapierPaintLastPress = { value: 0, from: '', patch: 0 };
const _rapierPaintPatchSeen = { min: RAPIER_PAINT_PATCH_LIGHT, max: RAPIER_PAINT_PATCH_FIRM, lo: Infinity, hi: -Infinity };
// Requiring BOTH axes would throw away every device that reports only one. Plenty of Android panels
// give a real major axis and a placeholder 1 on the minor; take the informative axis when only one
// is; a genuine 1x1 is still no information.
function _rapierPaintPatch(evt) {
	const w = Number.isFinite(evt.width) && evt.width > 1 ? evt.width : 0;
	const h = Number.isFinite(evt.height) && evt.height > 1 ? evt.height : 0;
	if (w && h) return Math.sqrt(w * h);
	return w || h || 0;
}
// The chosen brush and size are preferences and stay origin-wide; a person's own brush files are
// content and live under the deployment's storage scope like documents do, so a stable and a beta
// copy on one origin keep their own libraries. (RapierStorage is the shell's lexical global, the
// way editor/engine.js reads it -- never a property of globalThis.)
const RAPIER_PAINT_BRUSH_KEY = 'rapier:draw.paintbrush', RAPIER_PAINT_OWN_KEY = 'rapier:draw.paintbrushes' + RapierStorage.scope;
const RAPIER_PAINT_STRENGTH_KEY = 'rapier:draw.paintstrength';
// Blend, Dissolve and Erase (Dieterle's Smear, Water-erode and Eraser) are the brushes that work
// existing paint rather than lay fresh ink, so they are pinned at the strip's front where they are
// found, not buried in a scrolling strip -- each still shown by the engine's own sample working a
// band of paint. Smudge joins them -- Rapier's own preset, `draw/brushes/rapier/Smudge.myb`, a
// pure drag with no colour of its own that does not need a firm press to move paint
// (dieterle/blender's own law: only a firm press drags at all).
// The strip opens on Rapier's own finger set -- presets tuned so ONE finger pass on a phone lays a
// stroke that reads as paint (draw/brushes/rapier/*.myb, each derived from a Dieterle brush by the
// .myb route): Oil, Bristle, Flat, Scumble, Pencil, Pen, Smudge, then the eraser; the Dieterle
// originals follow.
// The brushes that LAY paint come first and the three that work paint already there come last (a
// blender on bare canvas can only look like nothing).
// Rapier's own set leads BOTH sections, so the four operators are pinned with the three above --
// the Tools row a thumb arrives at is Rapier's own seven, in the order a person meets them, and
// the factory pack follows in Brushes.
const RAPIER_PAINT_PINNED = ['rapier/oil', 'rapier/bristle', 'rapier/flat', 'rapier/scumble', 'rapier/pencil', 'rapier/pen',
	'rapier/smudge', 'rapier/smear', 'rapier/blend', 'rapier/eraser', 'rapier/dissolve', 'rapier/erode'];
// Scumble is the brush paint mode opens with, and it is a larger brush the moment it is selected --
// its own default size (500%). A size the person sets is remembered per brush, so each brush comes
// back at the size it was last used at; a brush never set before opens at its own default. The
// strength (Firm/Light) is the person's one toggle for every brush and no brush's own: Scumble's
// light hand on Firm is the touch scale's doing (nothing may special-case a brush id for it), and
// opening Scumble on Light would double that.
const RAPIER_PAINT_DEFAULT_ID = 'rapier/scumble';
// Each brush's first-use size is the shared controls' (draw/paint-controls.mjs PAINT_SIZE_DEFAULTS): the agent's stroke
// without a size takes the same width.
const RAPIER_PAINT_SIZES_KEY = 'rapier:draw.paintsizes';
function _rapierPaintSizeDefault(id) { return paintSizeDefault(id); }
function _rapierPaintSizesRead() { try { const raw = JSON.parse(localStorage.getItem(RAPIER_PAINT_SIZES_KEY) || '{}'); return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}; } catch (_) { return {}; } }
function _rapierPaintSizeFor(id) { const own = _rapierPaintSizesRead()[id]; const n = Number(own); return Number.isFinite(n) ? _rapierDrawClamp(Math.round(n), 0, 100) : _rapierPaintSizeDefault(id); }
// The preset the ERASE tool paints with over a painting, and the radius its own settings declare
// (`radius_logarithmic` base), so the tool's radius can be expressed as an offset from it. The
// preset's radius is a fingertip's (a radius of 0.4 -- e^0.4, four raster pixels across -- is a
// stylus eraser's width), and this constant follows it, so the ERASE tool's own offset lands
// exactly on the width its live ring shows.
const RAPIER_PAINT_ERASER_ID = 'rapier/eraser', RAPIER_PAINT_ERASER_LOGR = 2.85;
// The tools that paint on a paint layer. Erase works on pixels over a painting as Paint does, and
// every gate that reads the tool has to know that, or the erase gesture's layer is quietly never
// opened.
function _rapierPaintToolPaints(tool = _rapierDrawTool()) { return tool === 'paint' || tool === 'water' || tool === 'erase'; }
function _rapierPaintDefaultId() { return RAPIER_PAINT_BRUSHES.some(entry => entry.id === RAPIER_PAINT_DEFAULT_ID) ? RAPIER_PAINT_DEFAULT_ID : RAPIER_PAINT_BRUSHES[0].id; }
// A person's own brushes: MyPaint .myb files uploaded into the strip, kept on this device (bounded),
// exportable again as the same file. An id is `own/` plus a digest of the preset's settings, so the
// same file uploaded twice is one chip.
const RAPIER_PAINT_OWN_FILE_MAX = 256 * 1024;
// A small gauge, its needle high (firm) or low (light): the strength affordance's own icon,
// painted like every other Draw control rather than labelled in words (Draw is icons).
const RAPIER_PAINT_ICON_GAUGE_FIRM = RAPIER_DRAW_ICON_WRAP('<path d="M4 16a8 8 0 0 1 16 0"></path><line x1="12" y1="16" x2="16" y2="9"></line><circle cx="12" cy="16" r="1.3" fill="currentColor" stroke="none"></circle>');
const RAPIER_PAINT_ICON_GAUGE_LIGHT = RAPIER_DRAW_ICON_WRAP('<path d="M4 16a8 8 0 0 1 16 0"></path><line x1="12" y1="16" x2="8" y2="10"></line><circle cx="12" cy="16" r="1.3" fill="currentColor" stroke="none"></circle>');
// A chip's art is the ENGINE'S OWN painted sample, which is honest for a brush that lays colour -- and
// meaningless for one that does not: Smudge and the blenders have nothing of their own to show,
// so their sample would be whatever scratch colour the sampler laid. A tool that MOVES paint is drawn,
// not sampled, and everything on the strip carries its NAME, because a thumb-sized mark is not a
// memory. So the strip is two labelled sections -- what lays colour, and what works it.
// A Tool is an OPERATOR, not a renamed preset: a brush has no obligation to satisfy a word it was
// never given (Dieterle's Dissolve adds alpha at a finger's pressure, his Erode barely erodes at a
// light touch, his Wet flat paints the selected colour). Seven Rapier presets carry `rapier_op` and
// the engine runs the named operator in place of laying colour (draw/paint.mjs); the Dieterle brushes
// are among Brushes, which is what they are. Smear and Posterize work the paint rather than laying it,
// so they stand under TOOL. Smear is Rapier's drag, combed; Dieterle's Blender (eleven random colour
// buckets resampled once in forty dabs at random offsets -- a speckle, as its author made it) is among
// Brushes.
const RAPIER_PAINT_TOOL_IDS = new Set(['rapier/smudge', 'rapier/smear', 'rapier/blend', 'rapier/eraser',
	'rapier/dissolve', 'rapier/erode', 'rapier/posterize']);
function _rapierPaintIsTool(id) { return RAPIER_PAINT_TOOL_IDS.has(id); }
// A tool that works the material under it rather than laying colour. It is the one kind of gesture
// that must see the painting a SET or the memory-cap rollover left beneath a clean sheet.
function _rapierPaintIsMaterialTool(id, settings = null) { return settings?.mode === 'water' ? settings.erasing || ['water','lift'].includes(settings.water?.tool) : _rapierDrawTool() === 'water' ? ['water','lift'].includes(_rapierWaterState().tool) : _rapierPaintIsTool(id) || id === RAPIER_PAINT_ERASER_ID; }
// A drop, for water.
const RAPIER_PAINT_ICON_WATER = RAPIER_DRAW_ICON_WRAP('<path d="M12 3c4 5 6 7.6 6 10.2A6 6 0 0 1 6 13.2C6 10.6 8 8 12 3z"></path>');
// A finger worked back and forth over the paint: the smudge.
const RAPIER_PAINT_ICON_SMUDGE = RAPIER_DRAW_ICON_WRAP('<path d="M4 15c3.5 0 4-6 7.5-6s4 6 8.5 6"></path><path d="M4 19c3.5 0 4-3 7.5-3s4 3 8.5 3"></path>');
// A dab and the trail the finger drags out of it: the smear.
const RAPIER_PAINT_ICON_SMEAR = RAPIER_DRAW_ICON_WRAP('<circle cx="7" cy="12" r="3.5" fill="currentColor" stroke="none"></circle><path d="M10.5 9.5h8"></path><path d="M10.5 12h10.5"></path><path d="M10.5 14.5h6"></path>');
// Tone cut into steps: the posterize.
const RAPIER_PAINT_ICON_POSTERIZE = RAPIER_DRAW_ICON_WRAP('<path d="M3 19h4.5v-4.5H12V10h4.5V5.5H21"></path>');
// A drop over a broken edge: water that erodes what it lands on.
const RAPIER_PAINT_ICON_DISSOLVE = RAPIER_DRAW_ICON_WRAP('<path d="M9 3c3 3.6 4.5 5.6 4.5 7.5A4.5 4.5 0 0 1 4.5 10.5C4.5 8.6 6 6.6 9 3z"></path><circle cx="17" cy="9" r="1.1" fill="currentColor" stroke="none"></circle><circle cx="20" cy="13" r="0.9" fill="currentColor" stroke="none"></circle><circle cx="16" cy="15" r="1.3" fill="currentColor" stroke="none"></circle><circle cx="19.5" cy="18.5" r="0.8" fill="currentColor" stroke="none"></circle>');
// The eraser block, held at its working angle.
const RAPIER_PAINT_ICON_RUBBER = RAPIER_DRAW_ICON_WRAP('<path d="M7.5 20.5 3.6 16.6a2 2 0 0 1 0-2.8L13.8 3.6a2 2 0 0 1 2.8 0l3.8 3.8a2 2 0 0 1 0 2.8L10.3 20.5z"></path><line x1="8" y1="9.5" x2="14.5" y2="16"></line><line x1="10.3" y1="20.5" x2="20.5" y2="20.5"></line>');
// Two circles that overlap: colours softened into one another.
const RAPIER_PAINT_ICON_BLEND = RAPIER_DRAW_ICON_WRAP('<circle cx="9" cy="12" r="5.5"></circle><circle cx="15" cy="12" r="5.5"></circle>');
// A mark breaking up into specks: paint eroded rather than lifted.
const RAPIER_PAINT_ICON_ERODE = RAPIER_DRAW_ICON_WRAP('<path d="M3 13c2.5-3.5 4.5-3.5 7 0s4.5 3.5 6.5 0"></path><circle cx="18.5" cy="8.5" r="1.1" fill="currentColor" stroke="none"></circle><circle cx="21" cy="12.5" r="0.9" fill="currentColor" stroke="none"></circle><circle cx="17.5" cy="16" r="1.2" fill="currentColor" stroke="none"></circle><circle cx="20.5" cy="18.5" r="0.8" fill="currentColor" stroke="none"></circle>');
// Seven paint tools, seven words, seven marks. A tool's word is what it does, in one word; the
// preset's own full name stays in the label a screen reader and the tip use, and no .myb is
// touched. Smear and Posterize stand under TOOL, where a chip shows a mark and not the engine's
// sample, so each has a mark of its own.
const RAPIER_PAINT_TOOL_WORDS = Object.freeze({ 'rapier/smudge': 'Smudge', 'rapier/eraser': 'Eraser',
	'rapier/blend': 'Blend', 'rapier/dissolve': 'Dissolve', 'rapier/erode': 'Erode',
	'rapier/smear': 'Smear', 'rapier/posterize': 'Posterize' });
function _rapierPaintToolWord(id, name) { return RAPIER_PAINT_TOOL_WORDS[id] || name; }
// The factory pack's own names collide on a chip (two "Fountain pen"s, a second "Pencil", two
// "Tail feathers" cut to the same word, "Water" and "Water, erode"): each carries a word of its
// own on the chip. The full name stays in the label and the tip; the .myb is untouched. A chip
// shows its word whole, and a name that is no table's (the person's own brush) as it came.
const RAPIER_PAINT_BRUSH_WORDS = Object.freeze({ 'dieterle/fountain-sf-1': 'Fountain', 'dieterle/fount-offset-1': 'Offset pen', 'dieterle/pencil-left-handed': 'Left pencil',
	'dieterle/flight-feathers': 'Feathers', 'dieterle/tail-feathers': 'Tail feather', 'dieterle/tail-feathers2': 'Tail plume',
	'dieterle/wateryflatbrush': 'Watery flat', 'dieterle/dissolver': 'Dissolver', 'dieterle/flat2-1': 'Flat 2' });
function _rapierPaintBrushWord(id, name) { return RAPIER_PAINT_BRUSH_WORDS[id] || name; }
// What a chip says when it is read out or held: the brush's plain name and a few words of what it does
// for a person. The pack's own notes (authors, derivations, tuning) stay in the .myb a brush exports as;
// the credits and licences are in Settings, Licenses. A person's own brush carries the words they wrote.
const RAPIER_PAINT_BRUSH_HINTS = Object.freeze({ 'dieterle/8b-pencil-1': 'soft, dark graphite', 'dieterle/flat2-1': 'broad flat edge', 'dieterle/halftonecmy-1': 'coloured print dots',
	'dieterle/round-1': 'round, smearing brush', 'dieterle/arrow-1': 'arrow-tipped marks', 'dieterle/fan-1': 'a spread of bristles', 'dieterle/fountain-sf-1': 'ink that swells with pressure',
	'dieterle/fount-offset-1': 'ink with a slight wobble', 'dieterle/halftone-1': 'print dots', 'dieterle/pencil-left-handed': 'graphite angled for the left hand',
	'dieterle/blender': 'blends colours', 'dieterle/dissolver': 'dissolves paint away', 'dieterle/eraser': 'wears paint away', 'dieterle/splash': 'scattered splashes',
	'dieterle/flight-feathers': 'feathered streaks', 'dieterle/tail-feathers2': 'soft feathered streaks', 'dieterle/tail-feathers': 'feathered streaks',
	'dieterle/wateryflatbrush': 'wet, flowing colour', 'rapier/oil': 'thick, smooth paint', 'rapier/bristle': 'streaks and gaps', 'rapier/scumble': 'broken, scattered paint',
	'rapier/pencil': 'soft graphite', 'rapier/pen': 'a bold line that swells',
	'rapier/smudge': 'drags paint with a finger', 'rapier/smear': 'drags paint in streaks', 'rapier/posterize': 'reduces colour to bands',
	'rapier/blend': 'mixes paint in place', 'rapier/eraser': 'takes paint off', 'rapier/dissolve': 'breaks paint up', 'rapier/erode': 'wears paint from its edges' });
function _rapierPaintBrushLabel(entry) { const hint = entry.own ? entry.notes : RAPIER_PAINT_BRUSH_HINTS[entry.id]; return entry.name + (hint ? '. ' + hint : ''); }
const RAPIER_PAINT_TOOL_ICONS = Object.freeze({ 'rapier/smudge': RAPIER_PAINT_ICON_SMUDGE, 'rapier/eraser': RAPIER_PAINT_ICON_RUBBER,
	'rapier/blend': RAPIER_PAINT_ICON_BLEND, 'rapier/dissolve': RAPIER_PAINT_ICON_DISSOLVE, 'rapier/erode': RAPIER_PAINT_ICON_ERODE,
	'rapier/smear': RAPIER_PAINT_ICON_SMEAR, 'rapier/posterize': RAPIER_PAINT_ICON_POSTERIZE });
function _rapierPaintToolIcon(id) { return RAPIER_PAINT_TOOL_ICONS[id] || ''; }
const RAPIER_PAINT_SIZE_DEFAULT = 50;
// The linear-light white the layer is painted on (draw/paint.mjs PaintSurface.paper).
// Smudge samples the layer alone, as libmypaint does: an opaque white sheet under the layer would
// make the Dieterle brushes' transparency gate always see paint, and every light-pressure stroke
// would smear white. Where the layer is bare the picked-up alpha is low and the dab thins or is skipped,
// which is what paint on paper does; the stage's white paper is display only.
const RAPIER_PAINT_PAPER = null;
// The wet media a live layer runs on. `cell` is the raster pixels the physics runs a cell over --
// 3, one drawing unit at the brush's grain, so a phone-sized layer's wet window costs about 20 MB
// instead of the 360 MB a dense state would. The rest is the look: a short drying time (a wash
// that still blooms visibly at 8 s comes out ragged), the pigment read as a transparent film over
// what is under it (Beer-Lambert, so a glaze multiplies with the wash beneath rather than covering
// it), and the reference's per-raster-pixel flow slowed for the coarser grid.
// `bleed` is the other half of wet-in-wet: suspended pigment wanders through still water on its
// own, so two colours laid side by side while both are wet run into one another instead of meeting
// along a hard joint. At 0.6 a crossing mixes -- blue over gold reads green where they share water
// -- while each stroke still keeps its own body.
const RAPIER_PAINT_WET = {dryingTime: 1600, cell: 3, maxBytes: 64000000, film: true, filmGain: 0.55,
	flow: 0.55, pin: 1.2, bleed: 0.6, grain: 1, granulation: 0.2, tooth: 0.85, edgeDarkening: 1};
// A drying tick advances at most this much wet time, so a long stroke's owed time drains over a few
// frames -- the wash blooms in view instead of freezing the hand at the moment it lifts.
// Simulated ms per physics step, and the real ms a drying frame may spend before it yields. The
// first is granularity; the second is the jank budget the split above finally makes meaningful.
const RAPIER_PAINT_DRY_FEED = 8, RAPIER_PAINT_DRY_SLICE = 8, RAPIER_PAINT_DRY_BUDGET = 8;
// Which way is down. A phone knows how it is being held, and a wash on a tilted sheet runs
// downhill -- so a person can lean the phone and watch the water go. `beta` is the front-to-back
// lean and `gamma` the side-to-side one; flat on a table is no bias at all. Scaled well below the
// full pull of gravity: a lean should send the water travelling, not empty the wash off the page.
// Nothing is requested and no permission is asked for: a device that reports nothing simply paints
// on a flat sheet.
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
// A tile is a small window on a brush that is sized for a phone's whole stage, so it paints its
// sample at a fraction of the preset's own radius -- at full size every brush fills its tile with
// one blob and the strip stops telling them apart. Natural log, so this is about 0.33x.
const RAPIER_PAINT_GLYPH_RADIUS = -1.1;
const RAPIER_PAINT_SETTING_AT = Object.fromEntries(globalThis.RapierDrawPaint.PAINT_SETTINGS.map((row, i) => [row[0], i]));

function _rapierPaintOwnBrushes() {
	const state = _rapierDrawState;
	if (state.paintOwn) return state.paintOwn;
	let rows = [];
	try {
		const raw = JSON.parse(localStorage.getItem(RAPIER_PAINT_OWN_KEY) || '[]');
		if (Array.isArray(raw)) for (const row of raw) {
			if (!row || typeof row.id !== 'string' || !row.id.startsWith('own/') || typeof row.name !== 'string' || !row.myb) continue;
			try { parseBrush(row.myb); rows.push({ id: row.id, name: row.name.slice(0, 64), group: 'Own', notes: typeof row.notes === 'string' ? row.notes.slice(0, 160) : '', myb: row.myb, own: true }); } catch (_) {}
		}
	} catch (_) { rows = []; }
	state.paintOwn = rows;
	return rows;
}
function _rapierPaintStoreOwn(rows) {
	const before = _rapierPaintOwnBrushes();
	try { localStorage.setItem(RAPIER_PAINT_OWN_KEY, JSON.stringify(rows.map(row => ({ id: row.id, name: row.name, notes: row.notes, myb: row.myb })))); }
	catch (_) { showToast('The brush changes could not be saved. Your saved brushes were kept.', 'error'); return false; }
	_rapierDrawState.paintOwn = rows;
	void _rapierPersonal.brushes(rows, before).catch(error => showToast(String(error.message || error), 'error'));
	return true;
}
// Every brush the strip can show: Rapier's own finger set first (RAPIER_PAINT_PINNED), then the
// rest of the factory set, then the person's own -- so what a thumb meets first is never a scroll
// away. The Brushes/Tools split then sorts them: the seven operators are Tools, everything else
// Brushes. The whole pack is the strip's: every preset answers a finger (pressure reaches
// 0.12..1.0), and a preset that cannot is fixed by name against the sheet, never hidden.
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
// Reads one .myb (a MyPaint brush file) into the person's own set and chooses it.
async function _rapierPaintUploadBrush(file) {
	const state = _rapierDrawState;
	if (!file) return;
	if (file.size > RAPIER_PAINT_OWN_FILE_MAX) { showToast('A brush file is 256 KiB or smaller', 'error'); return; }
	let def, json;
	try { json = JSON.parse(await file.text()); def = parseBrush(json); }
	catch (_) { showToast('That is not a MyPaint brush (.myb, version 3)', 'error'); return; }
	if (!state.open) return;
	// A brush's identity is EVERYTHING that changes what it paints, not just libmypaint's settings
	// array: two valid brushes differing only in `rapier_bristle_load` 1 against 200 must not hash
	// the same, or the second would silently replace the first. The wet loads, their maps and the
	// Rapier block all belong in the digest.
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
// Writes the chosen brush out as a .myb MyPaint opens: the version-3 file with the preset's settings
// as parsed and carried here (settings-equivalent to its author's file, not that file's bytes).
function _rapierPaintExportBrush(id) {
	const entry = _rapierPaintEntry(id);
	if (!entry) return;
	const file = (entry.name || 'brush').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().replace(/\s+/g, '_') + '.myb';
	void _download(new Blob([JSON.stringify(entry.myb, null, 4) + '\n'], { type: 'application/json' }), file);
}
function _rapierPaintRememberedBrush() {
	try { const id = localStorage.getItem(RAPIER_PAINT_BRUSH_KEY); return _rapierPaintEntry(id) ? id : _rapierPaintDefaultId(); } catch (_) { return _rapierPaintDefaultId(); }
}
// The size a session opens with is the remembered brush's own (its row, else its default: Scumble
// at 89) -- never another brush's last width read from a shared key.
function _rapierPaintRememberedSize() {
	try { return _rapierPaintSizeFor(_rapierPaintRememberedBrush()); } catch (_) { return RAPIER_PAINT_SIZE_DEFAULT; }
}
function _rapierPaintBrushId() { const id = _rapierDrawState.paintBrush; return _rapierPaintEntry(id) ? id : _rapierPaintDefaultId(); }
function _rapierPaintSetBrush(id) {
	if (!_rapierPaintEntry(id)) return;
	_rapierDrawState.paintBrush = id;
	// The brush's own size, the person's remembered one for it first; the strength is the person's
	// own and a pick never touches it.
	_rapierDrawState.paintSize = _rapierPaintSizeFor(id);
	try { localStorage.setItem(RAPIER_PAINT_BRUSH_KEY, id); } catch (_) {}
	_rapierPersonal.rememberDrawing('paintBrush', id);
	_rapierDrawState.paintPicked = id;
	_rapierPaintUpdateStrip();
}
function _rapierPaintSize() { const n = Number(_rapierDrawState.paintSize); return Number.isFinite(n) ? _rapierDrawClamp(Math.round(n), 0, 100) : RAPIER_PAINT_SIZE_DEFAULT; }
// The Size slider is a log offset on the brush's own radius: 50 is twice the preset as its author
// tuned it (one canvas unit per MyPaint pixel), 0 is an eighth of that, 100 eight times. The layer's
// raster scale is the surface's (`surface.scale`), never folded into the radius.
// The panel reads 100% in the middle: a percentage here has no absolute referent, it is relative to
// the brush's own natural width, and twice the preset's width is the better starting point on a
// phone.
//
// The one consequence worth knowing: the FINEST setting is twice as coarse as the preset's own
// finest. If the fine end is wanted, widen the slider's own range (the log-8 span below); do not
// shrink this, which would put the default back where it is too small.
function _rapierPaintRadiusOffset(size = _rapierPaintSize()) { return paintBrushRadiusOffset(size); }
function _rapierPaintSetSize(value) {
	const n = _rapierDrawClamp(Math.round(Number(value)), 0, 100);
	if (!Number.isFinite(n)) return;
	_rapierDrawState.paintSize = n;
	try { const sizes = _rapierPaintSizesRead(); sizes[_rapierDrawState.paintBrush] = n; localStorage.setItem(RAPIER_PAINT_SIZES_KEY, JSON.stringify(sizes)); _rapierPersonal.rememberDrawing('paintSizes', JSON.stringify(sizes)); } catch (_) {}
}
function _rapierPaintSizeWord(size = _rapierPaintSize()) { return Math.round(Math.exp((size - 50) / 50 * Math.log(8)) * 100) + '%'; }

// ---- The head: its held angle, Follow, the clear swatch and the outline --------------------------------------------
// A brush whose head is not round holds the angle the person holds it at (the dial in the brush strip turns it) and
// the marks come wide when moved across the blade and thin when moved along it; Follow turns the head with the finger
// instead. The engine takes the angle as the stylus's own tilt input, so no preset is rewritten (draw/paint.mjs
// PaintBrush.setHead). The clear swatch ends the colour row: with it chosen the brush in hand erases with its own
// head. The three are one remembered choice, kept the way the strip keeps the rest.
const RAPIER_PAINT_HEAD_KEY = 'rapier:draw.painthead', RAPIER_PAINT_HEAD_ANGLE = 45;
function _rapierPaintHeadRead() {
	let raw = null;
	try { raw = JSON.parse(localStorage.getItem(RAPIER_PAINT_HEAD_KEY) || 'null'); } catch (_) { raw = null; }
	const angle = Number(raw?.angle);
	return { angle: Number.isFinite(angle) ? ((Math.round(angle) % 180) + 180) % 180 : RAPIER_PAINT_HEAD_ANGLE, follow: raw?.follow === true, clear: raw?.clear === true };
}
function _rapierPaintHead() { if (_rapierDrawTool() === 'water') return _rapierWaterState(); return _rapierDrawState.paintHead || (_rapierDrawState.paintHead = _rapierPaintHeadRead()); }
function _rapierPaintHeadSave() {
	if (_rapierDrawTool() === 'water') { _rapierWaterSave(); return; }
	const head = _rapierPaintHead(), text = JSON.stringify({ angle: head.angle, follow: head.follow, clear: head.clear });
	try { localStorage.setItem(RAPIER_PAINT_HEAD_KEY, text); } catch (_) {}
	_rapierPersonal.rememberDrawing('paintHead', text);
}
// Choosing any colour paints again; the clear swatch is the one choice that is not a colour.
function _rapierPaintHeadClear(on) {
	const head = _rapierPaintHead();
	if (head.clear === !!on) return false;
	head.clear = !!on; _rapierPaintHeadSave(); _rapierPaintHeadShowHover();
	return true;
}
// What a gesture takes of the head when it is admitted: the held angle (null while Follow), and whether the brush erases.
// A Tool works the paint under it and has no colour to take away, so the clear swatch is a brush's alone.
function _rapierPaintHeadSettings(id) {
	const head = _rapierPaintHead();
	return paintBrushHead({angle: head.angle, follow: head.follow, erase: head.clear}, _rapierPaintIsTool(id));
}
// The chip and the angle panel. The chip is the first cell of the brush strip and shows the head, a thin oval at its own
// angle, with its angle in degrees (dashed, and the word FOLLOW, while the head follows the finger). Tapping it opens the
// angle panel, one panel like Width and Colour: a round dial the finger drags ROUND to turn the head, live, the number, a
// Held | Follow switch, and four preset angles.
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
// Everything the angle shows, from the one stored head: the dial's oval and its slider facts, the number, the switch, the
// presets, and (the strip being rebuilt on its next open) the chip.
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
// Turning is held angle: dragging a Follow head takes it back in hand. The long axis is a line, so the angle is mod 180.
function _rapierPaintHeadTurn(angle) {
	const head = _rapierPaintHead();
	head.angle = ((Math.round(angle) % 180) + 180) % 180; head.follow = false;
}
// A finger near a preset angle lands on it, so 45 or 90 is easy to hit and to hold.
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
// The outline: the head's footprint at its size and angle, at the contact point, for every brush. It lives on the stage's
// own live overlay beside the press ring, never in the painting, and is gone when a finger's stroke ends; a mouse keeps
// it while it hovers. `d` is empty when there is nothing to show.
function _rapierPaintHeadPath(x, y, fp) {
	const a = fp.radius / RAPIER_PAINT_GRAIN, b = a / Math.max(1, fp.ratio), t = fp.angle * Math.PI / 180, f = n => Math.round(n * 100) / 100;
	const dx = Math.cos(t) * a, dy = Math.sin(t) * a;
	return 'M' + f(x + dx) + ' ' + f(y + dy) + 'A' + f(a) + ' ' + f(b) + ' ' + f(fp.angle) + ' 1 0 ' + f(x - dx) + ' ' + f(y - dy) + 'A' + f(a) + ' ' + f(b) + ' ' + f(fp.angle) + ' 1 0 ' + f(x + dx) + ' ' + f(y + dy) + 'Z';
}
function _rapierPaintHeadHide() { _rapierDrawState.headEl?.setAttribute('d', ''); _rapierDrawState.headAt = null; }
function _rapierPaintHeadAt(clientX, clientY) {
	const state = _rapierDrawState, el = state.headEl;
	if (!el || !state.svgRoot) return;
	state.headAt = [clientX, clientY];
	const fp = _rapierPaintHeadFootprint();
	if (!fp) { el.setAttribute('d', ''); return; }
	const geom = _rapierDrawPointerGeometry(), p = _rapierDrawMapPoint(clientX, clientY, geom.rect, geom.vb);
	el.setAttribute('d', _rapierPaintHeadPath(p[0], p[1], fp));
}
// The footprint comes from the painter (the page holds no engine): asked for once per brush, dip, size and angle, and drawn when it
// arrives, where the contact is by then; until then there is no outline rather than a wrong one.
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
// A change to the head or the brush while the mouse rests redraws the outline where it is.
function _rapierPaintHeadShowHover() {
	const state = _rapierDrawState;
	if (state.headAt && !state.gesture && _rapierDrawTool() === 'paint') _rapierPaintHeadAt(state.headAt[0], state.headAt[1]);
}

// sRGB hex -> 0..1 components; the file's ink (light-paper colour), never the dark-paper display ink.
function _rapierPaintColor() {
	const hex = _rapierDrawShapeInk({ ink: _rapierDrawState.ink });
	return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
}

// ---- Brush glyphs: each preset paints its own sample --------------------------------------------
// The glyph's own pressure sequence is the strip's real pressure law (the same RAPIER_PAINT_SIM_*
// recurrence `_rapierPaintPressure` runs on an actual gesture, at the glyph's own slow, deliberate
// path), not an idealized sine that could show a preset dragging harder than the strip's current
// toggle actually delivers. A tile is a promise of what tapping it does; a promise the phone cannot
// keep is worse than a plainer one it can. Keyed by the current strength toggle so Blender's and
// Water's own tiles change with it, exactly as a real stroke would.
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
// A barrier is null when nothing is owed and a promise when something is: what follows runs at once in the first case and after
// the wait in the second, so the owners that never had to wait still never do.
function _rapierPaintAfter(wait, next) { return wait ? wait.then(next) : next(); }
// ---- The painter ---------------------------------------------------------------------------------
// One painter a page (draw.js `_rapierDrawPaintClient`: a worker, or the same code run in process where no worker can start) and this
// tool's remote on it. The first stroke waits for it; warming Paint up starts it ahead of the hand. A painter that fails fails the
// stroke it was painting, keeps the paintings already kept, and the next stroke starts a fresh one.
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
function _rapierPaintStartPainter(mode = _rapierPaintMode()) {
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
// The painter is gone, with every sheet that lived in it. What the recipe holds is what was kept: a stroke that was down is cancelled as
// the memory-failure path cancels one (the same words), a lifted stroke whose pixels had already reached the page is kept, and the next
// stroke rehydrates the last kept painting into a fresh painter.
function _rapierPaintPainterLost(holder, error) {
	const state = _rapierDrawState;
	if (_rapierPaintPainters.get(holder.mode) === holder) _rapierPaintPainters.delete(holder.mode);
	try { if (typeof _rapierDrawPaintRelease === 'function') _rapierDrawPaintRelease(holder.remote?.client); } catch (_) {}
	if (!state.open || state.paintLayer && state.paintLayer.mode !== holder.mode) return;
	showToast('The painting could not be kept. It is still open: ' + String(error?.message || error), 'error');
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
	if (error?.recoverable || /^(WATER_|paint_history_full)/.test(error?.code || '')) {
		_rapierPaintReleaseStroke(gesture, true); if (_rapierDrawState.gesture === gesture) _rapierDrawEndGesture();
		showToast(String(error.message || error), 'error'); return;
	}
	const holder = _rapierPaintPainters.get(gesture?.paint?.settings?.mode || _rapierPaintMode());
	if (holder?.remote && !holder.remote.failure) holder.remote.close();
	else if (!holder) _rapierPaintPainterLost({remote: null}, error);
}
function _rapierPaintGlyphKey(id, color, light) { return id + '|' + color.join(',') + '|' + _rapierPaintTouchLevel(id, light) + '|' + _rapierPaintDipKey(id); }
// A tile is the painter's own small picture of the brush (`preview`: a scratch sheet of its own, never a live layer), asked for once
// and laid on the strip when it arrives; until then the chip shows its word alone. A wet preset paints its stroke and the paper is
// dried on the spot (`settle`), so the strip never runs a drying loop per tile and a tile costs what its own few thousand pixels cost.
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
			const level = _rapierPaintTouchLevel(id, light), def = _rapierPaintDefFor(id), W = RAPIER_PAINT_GLYPH_W, H = RAPIER_PAINT_GLYPH_H;
			const request = {width: W, height: H, wet: {...RAPIER_PAINT_WET, maxBytes: 4000000}, definition: def, settle: true, options: {color, seed: 7, radiusOffset: RAPIER_PAINT_GLYPH_RADIUS}};
			// A brush that only acts on paint (eraser, posterize, colorize, a pure smudge) shows itself
			// working on a band of paint; every other brush shows its own stroke on bare paper.
			const at = RAPIER_PAINT_SETTING_AT, setting = name => def.settings[at[name]];
			// A smudge brush is one whose smudge is high at rest, whatever its inputs do with pressure
			// (Blender, Dissolver and Smudge all map smudge by pressure); on bare paper such a tile would
			// be a blank white rectangle.
			if (setting('eraser').base > 0 || setting('posterize').base > 0 || setting('colorize').base > 0 || setting('smudge').base >= 0.9 || setting('lock_alpha').base > 0) {
				const band = new Uint8ClampedArray(W * H * 4);
				for (let y = Math.round(H * 0.28); y < Math.round(H * 0.72); y++) for (let x = 0; x < W; x++) { const q = (y * W + x) * 4, left = x < W / 2; band[q] = left ? 232 : 46; band[q + 1] = left ? 176 : 112; band[q + 2] = left ? 38 : 216; band[q + 3] = 255; }
				request.initial = {data: band, width: W, height: H};
			}
			const pts2d = []; for (let i = 0; i <= 32; i++) { const t = i / 32; pts2d.push([W * 0.12 + t * W * 0.76, H / 2 + Math.sin(t * Math.PI * 2) * H * 0.22]); }
			request.points = _rapierPaintGlyphPressures(pts2d, level);
			const remote = await _rapierPaintStartPainter('paint');
			url = _rapierPaintPNG.encode(await remote.preview(request));
		} catch (_) { url = ''; }
		// Tiles are keyed by brush AND ink, so a person trying colours walks through the whole strip
		// again at each one. Dropping the oldest tile keeps that bounded without the cliff a wholesale
		// clear used to give, where every tile in the strip was repainted at once.
		while (_rapierPaintGlyphCache.size >= RAPIER_PAINT_GLYPH_CACHE_MAX) _rapierPaintGlyphCache.delete(_rapierPaintGlyphCache.keys().next().value);
		_rapierPaintGlyphCache.set(key, url);
		_rapierPaintGlyphAsked.delete(key);
		if (url) _rapierPaintGlyphShow(key, url);
	})();
}
// A tile that arrives while its strip is up goes onto the chip that asked for it, wherever that chip has got to.
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

// ---- The Dip -----------------------------------------------------------------------------------
// One control for the two things a hand actually does to a brush before it touches paper: how much
// paint it carries, and how far that paint is let down with water. Everything else about a preset is
// the preset's; these two are the painter's, every session, on every brush.
//
// Both axes ride settings the engine already has. The load axis is `rapier_load`, the whole brush's
// reservoir, spent over travel -- and at the very top it is ABSENT, which is ArtRage's own law and
// the right default: a brush that never runs out, until you ask it to. The water axis is
// `rapier_thinners`, which thins the film, floods the tooth's valleys flat and lets the mark blend
// into what is under it; on wet media it also opens the tap and cuts the pigment, because that is
// what water does to a loaded brush.
//
// It is per brush, because a dip is: the oil in your hand is loaded or not independently of the pen
// in the jar. One storage key holds the whole set.
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
// A brush nobody has dipped is full and neat: exactly the preset as its author wrote it.
function _rapierPaintDip(id) { return _rapierPaintDips()[id] || [1, 0]; }
function _rapierPaintDipKey(id) { const [load, water] = _rapierPaintDip(id); return load.toFixed(2) + ',' + water.toFixed(2); }
function _rapierPaintDipped(id) { const [load, water] = _rapierPaintDip(id); return load < RAPIER_PAINT_DIP_FULL || water > 0.005; }
function _rapierPaintSetDip(id, load, water) {
	const map = _rapierPaintDips();
	const l = _rapierDrawClamp(load, 0, 1), w = _rapierDrawClamp(water, 0, 1);
	if (l >= RAPIER_PAINT_DIP_FULL && w <= 0.005) delete map[id]; else map[id] = [l, w];
	try { localStorage.setItem(RAPIER_PAINT_DIP_KEY, JSON.stringify(map)); } catch (_) {}
	_rapierPersonal.rememberDrawing('paintDips', JSON.stringify(map));
	// A dip is a different brush: the live layer's cached one, and every tile keyed by it, are stale.
	const layer = _rapierPaintLayer(); if (layer) { layer.brush = null; layer.brushId = null; }
}
// Turns the two axes into the settings the engine reads. A def whose preset declares no rapier
// block gets one -- `PaintBrush` copies `def.rapier` whole, so a stylus preset takes a dip too.
function _rapierPaintApplyDip(def, id) {
	return paintBrushDip(def, ..._rapierPaintDip(id));
}
// One owner for "the brush this id means right now": the preset, fitted for a finger if that is on,
// dipped as the person has dipped it. The strip's tiles, the Dip's own sample and the live layer all
// go through here, so none of them can drift from another.
function _rapierPaintDefFor(id) {
	const entry = _rapierPaintEntry(id), def = parseBrush(entry.myb);
	if (_rapierPaintFitsFinger(id)) _rapierPaintFitFinger(def, entry.finger);
	return _rapierPaintApplyDip(def, id);
}
function _rapierPaintDipLoadWord(load) {
	return load >= RAPIER_PAINT_DIP_FULL ? 'full' : load >= 0.7 ? 'well loaded' : load >= 0.45 ? 'half a brushful' : load >= 0.2 ? 'running low' : 'nearly dry';
}
function _rapierPaintDipWaterWord(water) {
	return water <= 0.005 ? 'neat' : water <= 0.25 ? 'a touch of water' : water <= 0.55 ? 'thinned' : water <= 0.8 ? 'watery' : 'almost all water';
}
function _rapierPaintDipWord(id) { const [load, water] = _rapierPaintDip(id); return _rapierPaintDipLoadWord(load) + ' · ' + _rapierPaintDipWaterWord(water); }
// What a mark at this dip is worth, as a plain alpha: the chip's fill and the pad's field are both
// this, so the small picture and the big one agree.
function _rapierPaintDipStrength(load, water) { return load * (1 - 0.82 * water); }
// The button IS the dip: a flat well with this brush's own paint standing in it at this brush's own
// dip, in the ink actually chosen, on the paper actually being painted. Sitting beside Width and
// Smooth rather than inside the scrolling brush strip, it is always under the thumb and always
// telling the truth about how loaded the brush in hand is.
function _rapierPaintDipButtonArt(id, color) {
	const [load, water] = _rapierPaintDip(id), a = _rapierPaintDipStrength(load, water);
	const paper = _rapierPaintDipPaper(), ink = 'rgb(' + [0, 1, 2].map(k => Math.round(color[k] * 255 * a + paper[k] * (1 - a))).join(',') + ')';
	const h = Math.max(1.5, load * 13);
	// A jar, not a swatch: the paint stands inside an outlined well with a lip, so a full load still
	// reads as a well full of paint beside the colour dot, and a thinned one as paint let down.
	const jar = 'M6 5h12v12.5a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 6 17.5z';
	return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
		'<path d="' + jar + '" fill="rgb(' + paper.join(',') + ')" stroke="none"></path>' +
		'<rect x="6" y="' + (20 - h).toFixed(1) + '" width="12" height="' + h.toFixed(1) + '" rx="1.5" fill="' + ink + '" stroke="none"></rect>' +
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
// The Dip's own sample: a long pull, not the strip's little S, because the load axis only says
// anything OVER TRAVEL -- a brush that runs dry in a 96-pixel tile has nowhere to show it.
const _rapierPaintDipCache = new Map(), RAPIER_PAINT_DIP_CACHE_MAX = 24;
// The sample is the painter's, like a tile: it resolves with the picture's PNG (cached for the same brush, ink, hand and dip).
function _rapierPaintDipSample(id, color, light) {
	const level = _rapierPaintTouchLevel(id, light);
	const key = id + '|' + color.join(',') + '|' + level + '|' + _rapierPaintDipKey(id);
	const cached = _rapierPaintDipCache.get(key);
	if (cached) return Promise.resolve(cached);
	return (async () => {
		let url = '';
		try {
			const W = RAPIER_PAINT_DIP_W, H = RAPIER_PAINT_DIP_H;
			const pts2d = []; for (let i = 0; i <= 96; i++) { const t = i / 96; pts2d.push([W * 0.05 + t * W * 0.90, H / 2 + Math.sin(t * Math.PI * 1.1) * H * 0.17 - t * H * 0.06]); }
			const remote = await _rapierPaintStartPainter('paint');
			url = _rapierPaintPNG.encode(await remote.preview({width: W, height: H, wet: {...RAPIER_PAINT_WET, maxBytes: 8000000}, definition: _rapierPaintDefFor(id), settle: true,
				points: _rapierPaintGlyphPressures(pts2d, level), options: {color, seed: 7, radiusOffset: RAPIER_PAINT_DIP_RADIUS}}));
		} catch (_) { url = ''; }
		while (_rapierPaintDipCache.size >= RAPIER_PAINT_DIP_CACHE_MAX) _rapierPaintDipCache.delete(_rapierPaintDipCache.keys().next().value);
		_rapierPaintDipCache.set(key, url);
		return url;
	})();
}
// The field behind the thumb: across is water, up is paint, and every point of it is painted in the
// ink actually chosen at the strength that point would give. Drawn small and let the browser scale
// it, which costs one 48x32 ImageData instead of a gradient stack.
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
// The page's own surface colour, read once per open so the field sits on the panel rather than on an
// assumed white -- Rapier follows the reader's theme and a hard-coded sheet would glare in the dark.
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
// The one thing opening a layer changes on screen: whether there is a painting to Set. Rebuilding
// the whole brush strip at layer open -- chip HTML, glyph tiles and all -- would cost the very
// frame the first dab needs. Only SET's word changes: its glyph stays.
function _rapierPaintSyncSet() {
	const set = _rapierDrawState.surface?.querySelector('[data-draw-act="paintSet"]'), word = set?.querySelector('.rapier-draw-btn-name');
	const layer = _rapierPaintLayer();
	if (set) set.disabled = !!_rapierDrawState.paintSetting || !layer || !!layer.warmView;
	const label = _rapierDrawState.paintSetting ? 'setting' : 'set';
	if (word && word.textContent !== label) word.textContent = label;
}
function _rapierPaintDipSyncPanel(repaintSample = true) {
	const panel = _rapierPaintDipPanel();
	if (!panel || panel.hidden) { _rapierPaintSyncSet(); return; }
	const id = _rapierPaintBrushId(), color = _rapierPaintColor(), [load, water] = _rapierPaintDip(id);
	// Read the paper before changing the knob or words. A computed-style read after the transform
	// forced the whole panel through style and layout on every pointer move.
	const paper = _rapierPaintDipPaper();
	_rapierPaintSyncSet();
	const pad = panel.querySelector('.rapier-draw-dip-pad'), knob = panel.querySelector('.rapier-draw-dip-knob'), track = panel.querySelector('.rapier-draw-dip-track');
	const ink = color.join(',');
	if (panel.dataset.dipInk !== ink) { panel.dataset.dipInk = ink; _rapierPaintDipField(panel.querySelector('.rapier-draw-dip-field'), color); }
	// Positioned so the knob stays wholly inside the pad at both extremes rather than half hanging
	// off it: the travel is the pad less the knob's own width.
	// The knob rides a track the pad's size, carried by a transform (the track's percentages are the pad's): a drag
	// moves it on the compositor, never laying the panel out.
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
// The sample is a real stroke through the real engine -- 50-150 ms for a 300x58 tile on a desktop,
// so several times that on a phone -- which is far too much to spend per frame. It is therefore
// painted when the thumb PAUSES, not while it moves: the knob and the words answer the drag
// instantly, and the picture arrives a breath after the hand stops.
const RAPIER_PAINT_DIP_SETTLE = 140;
function _rapierPaintDipSampleSoon() {
	const state = _rapierDrawState;
	clearTimeout(state.paintDipTimer);
	state.paintDipTimer = setTimeout(async () => {
		state.paintDipTimer = 0;
		const panel = _rapierPaintDipPanel();
		if (!panel || panel.hidden) return;
		const img = panel.querySelector('.rapier-draw-dip-sample'), url = await _rapierPaintDipSample(_rapierPaintBrushId(), _rapierPaintColor(), _rapierDrawState.paintStrength === 'light');
		// The thumb may have moved on, or the pad closed, while the painter worked: the newer sample is already asked for.
		if (state.paintDipTimer || _rapierPaintDipPanel() !== panel || panel.hidden) return;
		if (url && img.getAttribute('src') !== url) { img.src = url; img.decode().then(() => _rapierDrawPlay(img, 'breathe'), () => {}); }
	}, RAPIER_PAINT_DIP_SETTLE);
}
function _rapierPaintDipFromPoint(pad, clientX, clientY) {
	const rect = pad.getBoundingClientRect();
	if (!rect.width || !rect.height) return;
	const water = _rapierDrawClamp((clientX - rect.left) / rect.width, 0, 1);
	const load = _rapierDrawClamp(1 - (clientY - rect.top) / rect.height, 0, 1);
	// The top eighth of the axis is the full brush, so a thumb can reach "never runs out" without
	// having to land on a single row of pixels.
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
	// The panel's own background is the paper it previews, so the sample sits on the sheet.
	panel.querySelector('.rapier-draw-dip-sample').style.background = 'rgb(' + _rapierPaintDipPaper().join(',') + ')';
	_rapierPaintDipSyncPanel();
	_rapierPaintUpdateStrip();
	if (!panel.dataset.dipBound) {
		panel.dataset.dipBound = '1';
		const pad = panel.querySelector('.rapier-draw-dip-pad');
		// let go, it settles (rapier-draw.css .rapier-draw-dip-pad--held, --moving).
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
// Read-only facts for witnesses (like surface.rapierDrawPerf in draw.js): which layer is live.
function _rapierPaintFacts() {
	const state = _rapierDrawState, layer = state.paintLayer;
	return { layerId: layer ? layer.id : null, live: !!layer, valid: _rapierPaintLayerValid(), loading: state.paintRehydrate || null, failed: state.paintRehydrateFailed || null, setting: !!state.paintSetting, erasing: !!state.paintEraseFan, encoding: !!state.paintEncodes?.size, pendingOverflow: !!layer?.pendingOverflow,
		// An ordinary lift's PNG finishes off the main thread (_rapierPaintEncodeRevision). A watcher
		// that only read `setting`/`pendingOverflow` to know the layer is idle (the automatic Set is the
		// same wait, just later) would see both false while this worker round trip is still outstanding
		// -- the commit has not reached the recipe yet. Expose it as its own fact.
		committing: _rapierPaintRevisionLayers(layer).some(sheet => !!(sheet.pendingLift || sheet.pendingCommit)), flips: state.paintFlips || 0, timing: state.paintTiming ? { ...state.paintTiming } : null, surface: layer?.surface ? layer.surface.width + 'x' + layer.surface.height : null, brush: layer?.brushId || null, brushChosen: state.paintBrush || null, size: _rapierPaintSize(), strength: state.paintStrength || null, dirty: !!layer?.surface && !layer.surface.settled, scale: layer?.scale || null, showing: !!layer && layer.canvas.style.visibility !== 'hidden',
		// What the seven operators did on this surface (draw/paint.mjs applyOp): dabs run, dabs that
		// changed anything, total travel handed to them, total dab radius. Reset by a witness with
		// `surface.opStats = null`.
		ops: layer?.surface?.opStats ? { ...layer.surface.opStats } : null,
		// Where the live layer's pixels sit in the drawing, and how many live overlays are mounted: a
		// stroke that paints in the right place on the wrong origin looks identical to one that did
		// nothing, until you can read both.
		origin: layer?.origin ? layer.origin.join(',') : null,
		overlays: document.querySelectorAll('canvas.rapier-draw-paint-live').length,
		// the wet media's own state, so a witness can watch a wash dry instead of guessing at pixels
		wet: !!layer?.surface?.wetState, drying: !!layer?.dryRaf, owed: layer?.surface?.wetPending || 0, stillWet: !!layer?.surface?.wet,
		// What the finger adapter last made of the hand: the pressure it handed the brush, where that
		// came from, and the patch the glass reported.
		press: _rapierPaintLastPress.value, pressFrom: _rapierPaintLastPress.from, patch: _rapierPaintLastPress.patch,
		// The Dip: the two axes as the person left them for the brush in hand, and whether its pad is open.
		dip: _rapierPaintDip(_rapierPaintBrushId()), dipOpen: !_rapierPaintDipPanel()?.hidden,
		// The reservoir the dip gave the brush in hand, and how much of it is left (draw/paint.mjs,
		// `rapier_load` and `loadFuel`). `paint-dip` could only ever read the mark's alpha and infer
		// the rest -- and alpha over a committed layer saturates where overlapping dabs pile up, so a
		// brush that had spent four fifths of its load still read as barely changed. Whether the
		// reservoir empties is a fact about the engine, and this is the engine saying it.
		load: layer?.brush ? {whole: layer.brush.rapier?.rapier_load ?? 0, fuel: layer.brush.loadFuel ?? null} : null };
}
// Set: the answer to a painting that grows past what one picture can hold. Painting stays cheap and lossless while it is live.
// Pressing Set is the moment the expensive encode happens, ONCE: the layer is dried, encoded as JPEG XL, and left on the canvas
// as an ordinary picture. A clean surface opens over it, so the next strokes cost nothing that the finished work underneath used
// to cost.
// Every painting is saved as lossless JPEG XL, always, with no question asked. Quality 95 is never reached for automatically: it
// is offered, by name and with both sizes, only when a painting is genuinely too large to hold losslessly -- and the person
// decides.
// A painting Paint turns into JPEG XL (Set, the automatic Set, the flip at the memory cap) is kept as JPEG XL, and Draw shows a
// painting from its own bytes. A browser that cannot show JPEG XL (Chrome on Android) would show nothing where the painting was,
// so Paint keeps the same pixels as PNG beside each JPEG XL it makes, for display only (`_rapierPaintShowable`, read by
// `_rapierDrawDisplayMarkup`); the recipe, the file, history and every kept byte stay JPEG XL. Held for the drawing that made
// them and forgotten when another opens.
const _rapierPaintShownAs = new Map();
function _rapierPaintJxlShowable() {
	const test = typeof window !== 'undefined' ? window.__rapierPaintShowJxlTest : undefined; // witness seam (paint-auto-set-lossless)
	if (typeof test === 'boolean') return Promise.resolve(test);
	// An unsettled probe is not "this browser cannot show JPEG XL": guessing that way wrote PNG over a
	// painting Chrome can show, and the lossless row then read those bytes as the kept picture.
	try {
		const known = globalThis.RapierEmbeddedImages?.whenJxlDisplayKnown;
		if (typeof known === 'function') return Promise.resolve(known()).then(shown => shown !== false, () => true);
		return Promise.resolve(globalThis.RapierEmbeddedImages?.jxlDisplayable?.() !== false);
	} catch (_) { return Promise.resolve(true); }
}
// The PNG of a box of a live surface, for display, where this browser cannot show the JPEG XL made from the same box.
async function _rapierPaintShownFor(source, box) { return (await _rapierPaintJxlShowable()) ? null : _rapierPaintPNG.compressed(await source.readRGBA8(box)); }
function _rapierPaintKeepShown(pieces) { for (const piece of pieces || []) if (piece?.shown && piece.url) _rapierPaintShownAs.set(piece.url, piece.shown); }
function _rapierPaintShowable(html) {
	if (!html || !_rapierPaintShownAs.size || !html.includes('data:image/')) return html;
	return html.replace(/(href=")(data:image\/(?:jxl|png);base64,[A-Za-z0-9+/=]+)"/g, (whole, lead, url) => { const shown = _rapierPaintShownAs.get(url); return shown ? lead + shown + '"' : whole; });
}
async function _rapierPaintEncodeJXL(source, box, options = {lossless: true}, work = null) {
	if (Array.isArray(globalThis.__rapierPaintEncodeLog)) globalThis.__rapierPaintEncodeLog.push({...options}); // witness seam (paint-auto-set-lossless)
	if (globalThis.__rapierPaintEncodeHold) await globalThis.__rapierPaintEncodeHold; // witness seam (paint-auto-set-lossless): the encoder held so a press can land while a Set settles
	// The pixels are asked of the painter (a live layer) or already in hand (a captured picture): either way a box of straight RGBA.
	const px = await source.readRGBA8(box);
	// A captured whole picture is also the source of lossless retries/pieces. Only that borrowed
	// buffer needs copying; a fresh surface read or cut piece is handed to the codec once.
	const data = px.shared ? new Uint8Array(px.data) : new Uint8Array(px.data.buffer, px.data.byteOffset, px.data.byteLength);
	const out = await globalThis.RapierEmbeddedImages.codec('encode', {width: px.width, height: px.height, data, options}, work || undefined);
	return {url: 'data:image/jxl;base64,' + RapierBundleIO.toBase64(out.bytes || out), options};
}
// Done keeps the person's paint, always: nothing is ever discarded on a closing path. A live layer
// the working PNG budget refused is kept, as JPEG XL (several times smaller than the working PNG
// for a big painting), at full quality, and the person is told if anything had to change.
//
// Every AUTOMATIC path -- the Set at the budget, the Done keep, the cap flip's re-encode -- writes
// lossless JPEG XL and nothing else. A painting whose lossless bytes pass what one picture may hold
// (RAPIER_DRAW_RASTER_MAX, the reader's own admission cap) is kept as SEVERAL lossless pictures:
// the painted box is halved along its longer side, at a whole pixel, until each piece fits, the
// pieces butting edge to edge (never overlapping: translucent paint drawn twice in an overlap would
// darken a strip along the seam; a butt join composites exactly). No quality step is ever taken
// quietly, and no raster the reader would refuse on reopen is ever written. Returns the pieces as
// [{box, url}] in reading order, or null only when even sixty-four pieces cannot fit.
// The one owner of the per-picture cap every paint path answers to: the reader's own admission cap,
// or the tiny cap a witness injects (`window.__rapierPaintRasterMaxTest`, read only when set) so
// the paths past the cap can be proven with a short stroke.
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
	// The encoder refuses a whole picture past its own 16 MiB bound (JXL_SIZE, images/encoder.mjs)
	// before this can measure it: that refusal is the cutter's signal to halve, the same as a
	// measured picture past the budget, never the person's dead end.
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
// The same encode from a painting's own committed bytes rather than a live surface: a layer that has
// been closed (a canvas growth closes one) still has to be able to reach JPEG XL, or its oversized
// working PNG would be written into the file and then REFUSED on reopen by the raster admission gate
// (core.mjs `_rapierDrawValidRaster`) -- the same loss, one session later.
async function _rapierPaintRasterCanvas(dataUrl) {
	// The bytes are read out of the URL itself, never fetched: the page's own connect-src has no
	// data:, so fetch(dataUrl) is refused.
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
// One box of a decoded raster, encoded; `box` is inclusive pixel bounds, the whole canvas when absent.
async function _rapierPaintEncodeCanvasBox(canvas, box, options = {lossless: true}, work = null) {
	const b = box || { x0: 0, y0: 0, x1: canvas.width - 1, y1: canvas.height - 1 };
	if (Array.isArray(globalThis.__rapierPaintEncodeLog)) globalThis.__rapierPaintEncodeLog.push({...options}); // witness seam
	const px = canvas.getContext('2d').getImageData(b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
	const data = new Uint8Array(px.data.buffer, px.data.byteOffset, px.data.byteLength);
	const out = await globalThis.RapierEmbeddedImages.codec('encode', {width: px.width, height: px.height, data, options}, work || undefined);
	return {url: 'data:image/jxl;base64,' + RapierBundleIO.toBase64(out.bytes || out), options};
}
// A committed painting whose lossless bytes pass the cap, cut into lossless pieces from its own
// raster: the shape is replaced by one shape per piece, each with the piece's own corner geometry
// (an affine cut of the whole's), in the same recipe position. Returns the pieces' shapes, or null
// when the raster is not a picture this can read.
// `shapes` is the array the shape lives in: the live recipe's while painting, and at Done the
// restored snapshot's -- a clone, so an insertion aimed at the live recipe would find no such
// shape and leave every piece but the first out of the file (`paint-done-keeps-pieces`).
function _rapierPaintSplitShapeSync(shapes, shape, pieces) {
	if (shape.paint?.mode === 'water' && pieces.length > 1) throw Object.assign(new Error('This Water layer must stay one picture. The painting remains open.'), {code:'WATER_BUDGET',recoverable:true});
	const state = _rapierDrawState, geom = shape.geom || {}, [pw, ph] = shape.paint?.px || [0, 0];
	if (!(pw > 0 && ph > 0)) return null;
	const sourcePaint = shape.paint || {};
	// A rotated rectangle and an explicit corner frame are the same pixel-to-world map: a painted
	// shape's rot must be kept here, or a rotated rectangle's pieces would occupy the axis-aligned
	// box of the pixels rather than the world the person rotated it into.
	const frame = geom.p || (geom.rot ? _rapierDrawRectPolygon(geom.cx, geom.cy, geom.w, geom.h, geom.rot) : null);
	// `shapes` is sometimes a DETACHED snapshot (a checkpoint normalizing while a newer drawing is
	// already open) -- allocating a piece id against the LIVE recipe's `_rapierDrawNextId` can mint
	// an id the snapshot itself already used, and the reader's duplicate-id repair would then drop a
	// connector binding to the ambiguous shape. Allocate against the array actually being cut.
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
		// The pieces are ONE painting: each carries the group (the first piece's id), and picking any
		// of them up to paint reopens the whole group as one layer (_rapierPaintRehydrateFor).
		next.geom = g; next.raster = piece.url; next.paint = { ...sourcePaint, strokes: undefined, seed: undefined, px: [b.x1 - b.x0 + 1, b.y1 - b.y0 + 1], group: shape.id, ...(replay ? {replay} : {}) };
		return next;
	});
	const i = shapes.indexOf(shape);
	if (i >= 0) shapes.splice(i + 1, 0, ...made.slice(1));
	else console.warn('[rapier] paint pieces: the shape being cut is not in the recipe handed in');
	return made;
}
async function _rapierPaintSplitShape(shapes, shape, pieces) { return _rapierPaintSplitShapeSync(shapes, shape, pieces); }
// Every painting in the drawing, written as lossless JPEG XL when the person is finished with it,
// in one picture where that fits and in lossless pieces where it does not (never a quality step:
// the law above _rapierPaintLosslessPieces). Returns the paintings that were cut into pieces, so
// the caller can say so if it wants to -- the work itself is always kept, whole and at full quality.
function _rapierPaintPixelsSurface(px) {
	return {width: px.width, height: px.height, readRGBA8(b) {
		// The whole captured picture is already immutable straight RGBA; only a cut piece needs a copy.
		if (!b || (b.x0 === 0 && b.y0 === 0 && b.x1 === px.width - 1 && b.y1 === px.height - 1)) return {...px, shared: true};
		const width = b.x1 - b.x0 + 1, height = b.y1 - b.y0 + 1, data = new Uint8ClampedArray(width * height * 4);
		for (let y = 0; y < height; y++) data.set(px.data.subarray(((b.y0 + y) * px.width + b.x0) * 4, ((b.y0 + y) * px.width + b.x1 + 1) * 4), y * width * 4);
		return {width, height, data};
	}};
}
// `frozen` is called once, as soon as the pixels this write needs are in hand (or at once where there are none to read): after it,
// the live surface may go. Done uses it to let the drawing close while the encoder works on those pixels (`_rapierDrawFinish`).
// `work` is {progress, signal}: `progress` is called with how far the encode is, from 0 to 1, over every painting still to be
// written; `signal` stops it.
async function _rapierPaintKeepAsJXL(recipe, defer = false, frozen = null, work = null) {
	// One owner for which codec a picture is written in: `_rapierDefaultImageProfile`. A painting is
	// a picture and follows the same rule, so it never disagrees with the rest of the document.
	if (typeof _rapierDefaultImageProfile === 'function' && _rapierDefaultImageProfile() !== 'jxl') { frozen?.(); return []; }
	const state = _rapierDrawState, budget = _rapierPaintRasterBudget(), split = [];
	// Recovery can ask while a cap's captured channels are already in the final codec. Retain
	// those immutable jobs before any await, even if their live history owner finishes meanwhile.
	const encodes = new Map(state.paintEncodes || []);
	// A supplied recipe is an immutable-in-time snapshot, not permission to read a later live layer.
	const layer = recipe ? null : state.paintLayer;
	// Done owns a frozen recipe. Ask the painter for its matching live surface now, before any encoder await: the painter
	// answers in order, so a later stroke cannot change the requested pixels. Closed layers use their exact working PNG.
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
	// Routine recovery captures once, before the first codec await. Every lossless retry then
	// cuts these immutable channels, never the live material a later stroke may have changed.
	const captured = defer && layer && frozenPixels ? _rapierPaintPixelsSurface(frozenPixels) : null;
	frozen?.();
	// One painting's encode is a share of the whole; a cut into pieces starts its encode over, and the line does not go back.
	const owed = Math.max(1, shapes.filter(shape => shape.recognized === 'paint' && shape.raster && !shape.raster.startsWith('data:image/jxl')).length);
	let turn = 0;
	for (const shape of shapes) {
		if (shape.recognized !== 'paint' || !shape.raster || shape.raster.startsWith('data:image/jxl')) continue;
		const share = turn++;
		const each = work ? { signal: work.signal, progress: typeof work.progress === 'function' ? (() => { let top = 0; return fraction => { top = Math.max(top, fraction); work.progress(Math.min(1, (share + top) / owed)); }; })() : undefined } : null;
		// The live surface holds the exact pixels and is preferred; a painting whose layer has been
		// closed is re-encoded from its own committed bytes rather than left as an oversized PNG.
		// One restored from a file already carries its author's JPEG XL and never reaches here.
		const live = layer && layer.id === shape.id && layer.surface ? layer : null;
		const box = live ? (defer ? liveBox : live.surface.bounds()) : null;
		if (live && !box) continue;
		const was = shape.raster.length;
		let pieces;
		const lossless = (encode, box) => _rapierPaintLosslessPieces(encode, box, budget, 0, shape.paint?.mode === 'water');
		if (encodes.has(shape.raster)) pieces = await encodes.get(shape.raster);
		else if (live) pieces = await lossless(b => _rapierPaintEncodeJXL(captured || live.surface, b, { lossless: true }, each), captured ? {x0: 0, y0: 0, x1: frozenPixels.width - 1, y1: frozenPixels.height - 1} : box);
		else {
			const exact = shape === frozenShape && frozenPixels ? frozenPixels : await _rapierPaintPNG.decode(shape.raster);
			if (exact) {
				const surface = _rapierPaintPixelsSurface(exact);
				pieces = await lossless(b => _rapierPaintEncodeJXL(surface, b, {lossless: true}, each), {x0: 0, y0: 0, x1: exact.width - 1, y1: exact.height - 1});
			} else {
				const canvas = await _rapierPaintRasterCanvas(shape.raster);
				pieces = await lossless(b => _rapierPaintEncodeCanvasBox(canvas, b, { lossless: true }, each), { x0: 0, y0: 0, x1: canvas.width - 1, y1: canvas.height - 1 });
			}
		}
		if (!pieces) continue;
		if (pieces.length === 1 && !live) { shape.raster = pieces[0].url; continue; }
		if (pieces.length === 1) { shape.raster = pieces[0].url; continue; }
		// Several pieces: the shape becomes one shape per piece. A live layer's box is the surface's
		// own coordinates; the shape's raster pixels are that box, so the pieces are rebased onto it.
		const origin = live && !captured ? { x: box.x0, y: box.y0 } : { x: 0, y: 0 };
		const made = await _rapierPaintSplitShape((recipe || state.recipe).shapes, shape, pieces.map(piece => ({ url: piece.url, box: { x0: piece.box.x0 - origin.x, y0: piece.box.y0 - origin.y, x1: piece.box.x1 - origin.x, y1: piece.box.y1 - origin.y } })));
		if (made) split.push({ shape, was, pieces: made.length });
	}
	return split;
}
// Quality 95 is an extra option for extra large paintings, never the default. Every painting above
// is already lossless, in as many pieces as it needs to pass under one picture's own cap
// (RAPIER_DRAW_RASTER_MAX) -- but the drawing itself is written as ONE SVG asset
// (globalThis.RapierImageAssets.createAsset, capped at IMAGE_LIMITS.bytes), and the pieces' own sum
// can still pass THAT even though no single piece does. This is the fallback for exactly that case,
// reached only from _rapierDrawFinish after _rapierPaintKeepAsJXL, and only once the person has
// agreed to it (_rapierPaintOfferQuality95, below): every already-lossless painting or piece in
// `recipe` is re-encoded IN PLACE at quality 95 -- same box, same grouping, same piece count, only
// the bytes shrink, so nothing about where a painting sits in the drawing moves. A piece was
// already at or under the per-picture cap at full quality; quality 95 only shrinks it further, so
// no piece is ever re-cut here. A live, still-unsplit painting is re-encoded from its own surface,
// the same as its lossless encode was a moment ago; a closed layer, or any piece of a group, is
// re-encoded from its own just-written raster, decoded back (_rapierPaintRasterCanvas) -- the round
// trip loses nothing extra, since what it decodes was itself lossless a moment ago. Returns how
// many distinct paintings were touched (a group's several pieces count once).
async function _rapierPaintReencodeQuality95(recipe) {
	const state = _rapierDrawState, layer = state.paintLayer, options = { lossless: false, quality: 95 }, touched = new Set();
	for (const shape of (recipe?.shapes || [])) {
		if (shape.paint?.mode === 'water' || shape.recognized !== 'paint' || !shape.raster || !shape.raster.startsWith('data:image/jxl')) continue;
		const live = !shape.paint?.group && layer && layer.id === shape.id && layer.surface ? layer : null;
		const box = live ? live.surface.bounds() : null;
		if (live && !box) continue; // mirrors _rapierPaintKeepAsJXL's own guard: nothing live to encode
		const encoded = live ? await _rapierPaintEncodeJXL(live.surface, box, options)
			: await _rapierPaintEncodeCanvasBox(await _rapierPaintRasterCanvas(shape.raster), null, options);
		shape.raster = encoded.url;
		touched.add(shape.paint?.group || shape.id);
	}
	return touched.size;
}
// The one dialog the picture format ever asks: named, with both real sizes, never decided
// silently. Reached only when the drawing's own SVG asset cannot hold its paintings losslessly. No
// secondary label: "cancel" -- always offered by the confirm dialog itself -- is the decline, read
// back as `false` the same as a true dismiss (Escape, the backdrop).
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
	// The guard goes up BEFORE any commit that could start an automatic Set from inside this one: a
	// manual SET commits as the closing path does (`keep`), which the working budget never refuses,
	// and then asks its question below.
	// An exact {layer, session} token, not a bare flag -- a shared boolean would let one closed
	// drawing's abandoned encoder block every later drawing's own SET until that promise settled.
	const setting = state.paintSetting = { layer, session: state.session, auto };
	_rapierPaintUpdateStrip();
	let shape = null, laid = null;
	try {
		// Whatever is still wet belongs to this picture, not to the clean sheet. INSIDE the try: if this
		// settlement refuses -- a long wet stroke's accumulated debt reaching paper.mjs's per-call `Wet
		// time` bound -- the refusal is visible in the same toast every other Set failure uses and
		// `finally` still lowers the guard and restores the strip. The debt itself is paid by the
		// engine's own `_drainWet`; the two are independent: neither hides the other.
		// The painter settles the water, and the page reads what it settled to.
		if(layer.mode==='water')layer.surface.finishWetWork();else layer.surface.settleWet(); await layer.surface.sync();
		if (!auto) {
			await _rapierPaintCommit(true);
			shape = layer.id != null ? _rapierDrawShapeById(layer.id) : null;
			if (!shape) { showToast('There is nothing painted to set yet.', 'info'); return; }
		}
		const budget = _rapierPaintRasterBudget();
		const asJXL = typeof _rapierDefaultImageProfile !== 'function' || _rapierDefaultImageProfile() === 'jxl';
		// Measure the PNG we will keep, not the emergency stored-block working encoding. The
		// existing raw-RGBA codec compresses losslessly without a canvas alpha round-trip; measuring
		// stored blocks exhausted the sixty-four-piece bound for paintings compressed PNG can hold.
		// A manual Set in the JPEG XL profile keeps the painting now, as the lossless PNG of its pixels, and the sheet is clean at once; the
		// encode takes seconds to minutes. Its JPEG XL is written behind (below), in place and with no step of its own.
		const behind = !auto && asJXL;
		const encode = (box, options) => asJXL && !behind ? _rapierPaintEncodeJXL(layer.surface, box, options).then(async out => ({ ...out, shown: await _rapierPaintShownFor(layer.surface, box) }))
			: Promise.resolve(layer.surface.readRGBA8(box)).then(px => _rapierPaintPNG.compressed(px)).then(url => ({ url, options }));
		let kept = null, pieces = null;
		if (auto) {
			// Encoded against one version of the surface; if a stroke lands while the encoder works,
			// the picture is encoded again so nothing painted before the sheet flips is left off it.
			// Bounded: a hand that never lifts falls back to the closing keep (Done re-encodes).
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
					// An active stroke has not made its own history step yet. Leave it live until
					// pointer-up, rather than folding its partial pixels into the previous stroke.
					if (!moving) { layer.pendingOverflow = true; await _rapierPaintCommit(true, null, true); layer.pendingOverflow = false; }
					// `!kept`: even sixty-four pieces could not each fit under the cap -- unreachable under
					// the real cap (the flip at RAPIER_PAINT_AREA_MAX * 2 bounds the surface at 12M pixels,
					// 48 MB raw, at most eight lossless pieces of 8 MiB), reachable only under a witness's
					// tiny cap; said as what it is either way, never as "the hand kept moving".
					showToast(kept ? 'This painting is bigger than one working picture holds; it is kept as it is and saved when you press Done.'
						: 'This painting is bigger than sixty-four pictures hold; it is kept as it is and saved when you press Done.', 'info');
					return;
				}
			}
			// Each stroke already landed in history while encoding ran. Amend the latest stroke's
			// representation, so this custody change adds no Undo step and loses no earlier step.
			layer.pendingOverflow = false;
			_rapierPaintKeepShown(pieces);
			await _rapierPaintCommit(true, pieces.length === 1 ? kept.url : pieces, true);
			shape = layer.id != null ? _rapierDrawShapeById(layer.id) : null;
			if (!shape) return;
		} else {
			// Full quality, always: one lossless picture where it fits, lossless pieces where it does not.
			// No quality is ever offered, because none is ever needed.
			const box = layer.surface.bounds(), version = layer.paintVersion || 0;
			const session = state.session, currentLayer = state.paintLayer;
			pieces = await _rapierPaintLosslessPieces(b => encode(b, { lossless: true }), box, budget, 0, layer.mode === 'water');
			// Encoding is asynchronous; a later stroke, Undo or another drawing owns its own pixels.
			// The initial keep already committed this picture, so refusing a stale encoding loses nothing.
			const same = state.open && state.session === session && state.paintLayer === currentLayer && _rapierDrawShapeById(shape.id) === shape;
			if (!same || (layer.paintVersion || 0) !== version || state.gesture?.kind === 'paint' || layer.surface.wetState) {
				// A stroke made while Set worked is kept in the picture: once the hand lifts the painting is kept again as it stands, and Set goes on
				// with that (its JPEG XL is written behind as well). It is refused only where the drawing or the sheet is no longer this one.
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
			if (kept) { /* folded above */ } else {
			if (!pieces) { showToast('This painting is past what even sixty-four pictures can hold. Erase some of it and set it again.', 'info'); return; }
			kept = { url: pieces[0].url, options: { lossless: true } };
			_rapierPaintKeepShown(pieces);
			_rapierDrawSnapshot();
			shape.raster = kept.url;
			if (pieces.length > 1) { _rapierPaintSplitShapeSync(state.recipe.shapes, shape, pieces.map(piece => ({ url: piece.url, box: { x0: piece.box.x0 - box.x0, y0: piece.box.y0 - box.y0, x1: piece.box.x1 - box.x0, y1: piece.box.y1 - box.y0 } }))); _rapierDrawRenderAll(); }
			else _rapierDrawRenderShapes([shape.id]);
			_rapierDrawSealHistory();
			// The encoder is handed the PNG's exact pixels once the sheet is clean; Done awaits this same task and finishes what is left.
			if (behind && pieces.length === 1) void _rapierPaintEncodeShapeLater(shape.id, kept.url, null, { entry: state.undoStack.at(-1) });
			}
		}
		// The picture is finished; the next stroke starts on a clean sheet over it.
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
		// Only this attempt's own token releases the latch: a later drawing's SET, or this same layer's
		// own close, may already have moved it on.
		if (state.paintSetting === setting) { state.paintSetting = false; _rapierPaintUpdateStrip(); }
	}
	// SET's moment plays once the painting is kept, its clean sheet open and the latch down: nothing it does can
	// touch the keep. An automatic Set, which comes mid-painting, lays nothing.
	if (laid) _rapierPaintSettle(laid);
}
// SET's moment: the picture just set is laid down like paper -- a sheet of the paper's own colour, a breath above it,
// settles onto it and is gone. Only the part of it on the screen is laid.
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
// SET runs on the press. Nothing is lost by it: one Undo gives the painting back exactly as it was (draw-b03-set-custody, the
// manual Set case), and the toast after it says what happened, so no question stands before it.
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
// Strip by strip: the person finds a strip where they left it. One row shows BRUSH's strip and TOOL's, so its place
// is kept for the strip it is showing whenever that strip goes -- hidden (the row is one floating panel among
// several, and display:none drops a scroll) or replaced by the other -- and each is given back its own.
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
	// The new Brushes/Tools split is itself the disclosure. "Brushes" means every colour-laying
	// preset Rapier ships or the person imported; "Tools" means every preset that manipulates paint.
	// Do not hide a second factory pack behind another mystery control inside either list.
	const entries = _rapierPaintEntries().filter(entry => _rapierPaintIsTool(entry.id) === (mode === 'tools'));
	// A brush and a raster tool share one selection, but each disclosed family needs an entry
	// point. Opening the other family must not silently change the selected preset.
	const tabStop = entries.some(entry => entry.id === chosen) ? chosen : entries[0]?.id;
	const own = mode === 'brushes' && _rapierPaintEntry(chosen)?.own;
	const chip = entry => {
		const on = entry.id === chosen, tool = _rapierPaintIsTool(entry.id);
		const art = tool ? '<span class="rapier-draw-glyph rapier-draw-glyph--tool">' + _rapierPaintToolIcon(entry.id) + '</span>'
			: (u => u ? '<img class="rapier-draw-glyph rapier-draw-glyph--paint" alt="" src="' + u + '">' : '<span class="rapier-draw-glyph"></span>')(_rapierPaintGlyph(entry.id, color, strengthLight));
		return '<button type="button" tabindex="' + (entry.id === tabStop ? '0' : '-1') + '" class="rapier-draw-chip rapier-draw-chip--glyph rapier-draw-chip--paint' + (tool ? ' rapier-draw-chip--tool' : '') + (on ? ' rapier-draw-chip--active' : '') + (entry.own ? ' rapier-draw-chip--own' : '') + '" role="radio" data-draw-paint-kind="' + (tool ? 'tool' : 'paint') + '" data-draw-paint-brush="' + _rapierDrawEscapeAttr(entry.id) +
			'" aria-label="' + _rapierDrawEscapeAttr(_rapierPaintBrushLabel(entry)) + '" data-tip="' + _rapierDrawEscapeAttr(entry.name.toLowerCase()) + '" aria-checked="' + on + '" aria-pressed="' + on + '">' +
			// The chip's word is whole -- the table's word for a factory brush or tool, the person's own brush's name
			// as it came.
			art + '<span class="rapier-draw-chip-name">' + _rapierDrawEscapeAttr(tool ? _rapierPaintToolWord(entry.id, entry.name) : _rapierPaintBrushWord(entry.id, entry.name)) + '</span></button>';
	};
	const focused = row.contains(document.activeElement) ? document.activeElement : null;
	const wasKey = focused ? (focused.dataset.drawPaintBrush ? 'brush:' + focused.dataset.drawPaintBrush : focused.dataset.drawPaintAct ? 'act:' + focused.dataset.drawPaintAct : '') : '';
	row.innerHTML = (mode === 'brushes' ? _rapierPaintHeadChipHTML() : '') + entries.map(chip).join('') +
		(own ? '<button type="button" class="rapier-draw-chip rapier-draw-chip--icon" data-draw-paint-act="fit" role="switch" aria-checked="' + _rapierPaintFitsFinger(chosen) + '" aria-label="' +
			(_rapierPaintFitsFinger(chosen) ? 'This brush is fitted for a finger. Turn that off to use its authored response' : 'Use finger fitting for this brush') + '">' + (_rapierPaintFitsFinger(chosen) ? RAPIER_PAINT_ICON_GAUGE_FIRM : RAPIER_PAINT_ICON_GAUGE_LIGHT) + '<span class="rapier-draw-chip-name">fit</span></button>' : '') +
		(own ? '<button type="button" class="rapier-draw-chip rapier-draw-chip--icon rapier-draw-chip--delete" data-draw-paint-act="remove" aria-label="Remove this brush from your set">' + RAPIER_DRAW_ICONS.trash + '<span class="rapier-draw-chip-name">remove</span></button>' : '') +
		// ADD and SAVE are the last two cells of Brushes, not the primary row, which keeps the draw
		// interface uncluttered.
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
	// The chip a finger just picked lays its sample across its card (a tool, a mark, comes up to size).
	const picked = justPicked === chosen && row.querySelector('[aria-checked="true"]');
	if (picked) _rapierDrawPlay(picked.querySelector('.rapier-draw-glyph'), picked.dataset.drawPaintKind === 'tool' ? 'pop' : 'dab');
	const active = row.querySelector('[aria-checked="true"]');
	if (active && row.dataset.paintSeen !== chosen) {
		row.dataset.paintSeen = chosen;
		const left = active.offsetLeft, right = left + active.offsetWidth;
		if (left < row.scrollLeft) row.scrollLeft = left; else if (right > row.scrollLeft + row.clientWidth) row.scrollLeft = right - row.clientWidth;
	}
}

// ---- Surface <-> PNG ---------------------------------------------------------------------------
// The PNG of straight RGBA read from the painter: its working form, which the document keeps only until the painting is set.
function _rapierPaintPixelsToDataURL(px) { return _rapierPaintPNG.encode(px); }
async function _rapierPaintSurfaceToDataURL(surface, box) { return _rapierPaintPixelsToDataURL(await surface.readRGBA8(box || undefined)); }
// What the page keeps of a sheet's place in the drawing, copied at the instant its readout is asked for: a stroke that grows the
// sheet afterwards moves the layer's own origin, never the place of a picture already asked for. A canvas growth that follows moves
// both (_rapierPaintFollowGrowth).
function _rapierPaintPlace(layer) {
	return {scale: layer.scale, origin: layer.origin ? layer.origin.slice() : null, frame: layer.frame ? {...layer.frame, c0: layer.frame.c0.slice()} : null};
}
// The painter's own failure of a read the page asked: the remote has already failed the painter (the tool recovers there).
function _rapierPaintNotKept(layer, error) {
	layer.pendingOverflow = true;
	showToast('The painting could not be kept. It is still open: ' + String(error?.message || error), 'error');
}
// The worker receives an immutable straight-RGBA revision, never the display canvas. Jobs stay
// ordered: a newer stroke does not drop an older one, and a late reply cannot publish over it.
// The retained bytes can finish a revision here if its worker never answers. A frozen cap sheet
// fills those bytes in row bands; each temporary band is transferred to the worker after that copy.
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
// A cap frees a new material sheet while the earlier sheet's immutable bytes are being encoded.
// This chain is also the one custody barrier: recovery waits on it, and Undo/Close finish it in order.
function _rapierPaintRevisionLayers(layer = _rapierPaintLayer()) {
	const layers = [];
	for (; layer; layer = layer.previousFlip) layers.unshift(layer);
	return layers;
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
	if (stroke) stroke.entry = entry;
	// Seal may grow the paper again for its content margin. Every pending sheet follows the full
	// shift of this command, not just the first GrowCanvas call (nor the earlier sheets' shifts).
	const shift = entry?.shift ? {dx: entry.shift.dx - (priorShift?.dx || 0), dy: entry.shift.dy - (priorShift?.dy || 0)} : grown;
	if (grown || state.recipe.canvas !== canvas) _rapierPaintFollowGrowth(layer, shift || {dx: 0, dy: 0});
	const shape = _rapierDrawShapeById(layer.id);
	if (shape) {
		layer.geom = JSON.stringify(shape.geom);
		if (layer.mode === 'water') globalThis.RapierDrawAgentPaint.rememberWaterPainting(shape, _rapierWaterSession());
	}
}
function _rapierPaintWorker(layer) {
	if (typeof Worker !== 'function') return null;
	let owner = layer.pngWorker;
	if (!owner) {
		let url;
		try {
			// The stored form keeps cap custody outside the final-file budget. Its exact compressed
			// display twin avoids parsing a many-megabyte href every time the live SVG is rebuilt.
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
// A lifted stroke's revision (or a cap's departing sheet). The painter is asked, in its order after every dab the sheet owns, for the painted box and its pixels; the
// page keeps where the sheet stands at this instant; the picture is encoded when the pixels arrive -- by the PNG worker where the page has
// one (an ordinary lift and a cap's sheet; a closing commit never waits for the compressor), here in the stored form where not -- and the revision publishes in order behind the others of its sheets. A later stroke
// cannot change what was asked for: the painter answers in order, so the capture is atomic by construction.
function _rapierPaintEncodeRevision(layer, keep = false, {retire = false, release = false, custody = false, compressor = !keep} = {}) {
	const state = _rapierDrawState, owner = compressor ? _rapierPaintWorker(layer) : null;
	let resolve, reject;
	layer.pngSerial = (layer.pngSerial || 0) + 1;
	// The job's promise ends when the picture is in the recipe; it rejects with the reason when the picture could not be kept (whoever
	// awaits it -- a closing commit -- says so, and an ordinary lift that nobody awaits has already said so in a toast).
	const job = {id: layer.pngSerial, keep, custody, retire, release, place: _rapierPaintPlace(layer), px: null, box: null, raster: null, shown: null, empty: false, revision: 0, read: null, replay: layer.surface.takeReplay?.() ?? null, // a frozen pixel surface records no replay
		stored: !!layer.nextFlip, stroke: layer.flipStroke, brushId: layer.brushId, worker: owner?.worker, url: owner?.url, session: state.session,
		promise: new Promise((ok, no) => { resolve = ok; reject = no; }), resolve: () => resolve(), reject: error => reject(error)};
	job.promise.catch(() => {});
	layer.revisions = layer.revisions || [];
	layer.revisions.push(job);
	layer.pendingCommit = layer.revisions[0];
	_rapierDrawRenderHistory();
	job.timer = setTimeout(() => { if ((layer.revisions || []).includes(job)) { const wait = _rapierPaintFlushRevision(layer); wait?.catch(error => _rapierPaintNotKept(layer, error)); } }, 15000);
	job.read = layer.surface.readBounds().then(result => _rapierPaintRevisionRead(layer, job, result), () => _rapierPaintDropRevision(layer, job));
	return job;
}
// The painter's answer: the box of paint (none for an erased sheet) and its pixels, as of the point of the order the revision was asked at.
function _rapierPaintRevisionRead(layer, job, result) {
	job.read = null;
	if (_rapierDrawState.session !== job.session || !_rapierPaintRevisionLayers().includes(layer)) { _rapierPaintDropRevision(layer, job); return; }
	if (!(layer.revisions || []).includes(job)) return;
	job.box = result.box; job.revision = result.meta?.revision ?? 0;
	if (layer.mode === 'water') { job.waterCapture = result.waterReplay; job.waterSheet = result.waterSheet; }
	if (!result.box) job.empty = true; else job.px = {width: result.pixels.width, height: result.pixels.height, data: result.pixels.data};
	// A sheet the stroke has left behind stops showing; a stroke that still holds it keeps the surface for its rollback.
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
// A revision nothing is owed on any more (another drawing, a cancelled stroke, a painter that failed): it ends without publishing.
function _rapierPaintDropRevision(layer, job, error = null) {
	job.read = null;
	const queue = layer.revisions || [], at = queue.indexOf(job);
	if (at >= 0) queue.splice(at, 1);
	layer.pendingCommit = queue[0] || null;
	clearTimeout(job.timer);
	if (layer.publicationTask === job) layer.publicationTask = null;
	// A picture that could not be encoded leaves the layer open and its pixels in the painter; the person is told, and a later commit reads them again.
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
// A cap freezes its departed sheet; an ordinary lift keeps its live sheet behind the same capture
// barrier until the next stroke. Relief reads the neighbouring rows of that whole material, so
// band boundaries cannot change a normal or a straight RGBA channel.
function _rapierPaintTask(update, failed = null) {
	if (globalThis.scheduler?.postTask) { const task = globalThis.scheduler.postTask(update, {priority: 'user-visible'}); if (failed) void task.catch(failed); return 0; }
	return setTimeout(update, 0);
}
// Recovery shares the PNG worker but never enters the stroke's revision/history queue. A null
// worker owner returns the same exact bands as immutable RGBA for lossless JXL normalization.
// The solver pauses only while the bands are copied, then continues during compression.
function _rapierPaintDropSnapshots(layer) {
	let dropped = false;
	if (layer?.recoveryCapture?.cancel) { dropped = true; layer.recoveryCapture.cancel(); }
	for (const job of layer?.pngWorker?.snapshots?.values() || []) { dropped = true; job.finish(null); }
	return dropped;
}
function _rapierPaintCaptureSnapshot(layer, owner, held) {
	const state = _rapierDrawState, {surface, box, revision, session, width, height} = held;
	// The painter answers in order, so the pixels asked for are exactly this revision's; the page still refuses a readout whose revision it
	// has since left (a stroke, a held gesture, a hidden page, a worker that went), so that a recovery is never written from a moved painting.
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
	// Register before the IO owner yields; urgent close can cancel even an unstarted capture.
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
		// The surface is exactly what the revision read: nothing was asked of the painter since, no hand is down and no later revision waits.
		const live = !layer.nextFlip && layer.surface?.revision === job.revision && !_rapierDrawState.gesture && !queue.length;
		if (job.empty) { if (live) _rapierPaintPublishEmpty(layer); }
		else if (live) _rapierPaintPublish(layer, job.keep, raster, job.custody, false, job.replay, job);
		else _rapierPaintPublishFrozen(layer, job, raster);
	} catch (error) { queue.unshift(job); layer.pendingCommit = job; layer.pendingOverflow = true; throw error; }
	finally { if (!queue.includes(job)) job.resolve(); }
	if (!queue.length && layer.nextFlip) {
		const next = _rapierPaintRetireRevisionLayer(layer);
		if (next) _rapierPaintDrainRevisions(next);
	} else _rapierPaintDrainRevisions(layer);
}
// The stroke was already lifted. Its pixels and its place were taken then. Publishing them now
// must not settle the wash a newer stroke is still in, must not hide that stroke's overlay, and
// must not pretend this raster is the live revision.
function _rapierPaintPublishFrozen(layer, job, raster) {
	const state = _rapierDrawState;
	if (!job.box || !job.place) throw new Error('The painting changed before its revision was kept');
	// Where the sheet stood when it was read, carried by every canvas growth since (_rapierPaintFollowGrowth).
	const built = _rapierPaintGeomOf(job.place, job.box);
	const geom = built.geom;
	const pw = built.pw, ph = built.ph, s = built.s;
	const existing = layer.id != null ? _rapierDrawShapeById(layer.id) : null;
	const stroke = job.stroke || layer.flipStroke;
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
	if (retired) { const gone = new Set(layer.retire); state.recipe.shapes = state.recipe.shapes.filter(row => row === shape || !gone.has(row.id)); layer.retire = null; }
	if (grown || retired) _rapierDrawRenderAll(); else { _rapierDrawRenderShapes([shape.id]); _rapierDrawUpdateMenu(); }
	_rapierPaintSealRevision(layer, stroke, priorShift, grown);
	_rapierPaintSyncPaper();
	if (layer.nextFlip) void _rapierPaintEncodeShapeLater(shape.id, raster, job.px, stroke);
}
// The paper grew under a kept stroke, and every shape and the view moved by (dx, dy) canvas units with it. The live layer moves
// too -- its pixels are where they were, only its origin names them anew -- so the next stroke begins on the painting as it stands.
// Closing it instead made that stroke read the whole painting back from its PNG before its first dab (1.2-1.6 s at the 4x
// throttle on a phone-sized painting, a large Scumble), and left it open with its old origin when a revision was published while
// the next stroke was already down, so that stroke would have been kept shifted by the growth. A stroke in progress takes the new
// pointer map; its held samples are the layer's own coordinates and need nothing.
function _rapierPaintFollowGrowth(layer, grown) {
	for (const current of _rapierPaintRevisionLayers()) {
		if (current.frame) { current.frame.c0[0] += grown.dx; current.frame.c0[1] += grown.dy; }
		else if (current.origin) { current.origin[0] += grown.dx; current.origin[1] += grown.dy; }
		// A revision asked for but not yet published stands where its sheet stood when it was read; the canvas moved under it too.
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
// Whatever a lifted stroke owes the recipe is published now, in order: its revision is asked for if it has not been, the painter's readout
// awaited, and the pixels in hand encoded here in the stored form rather than waiting on the compressor. Null when nothing is owed.
function _rapierPaintFlushRevision(layer = _rapierPaintLayer(), keepWorker = false) {
	const layers = _rapierPaintRevisionLayers(layer);
	if (!layers.some(pending => pending.pendingLift || pending.pendingCommit)) return null;
	return _rapierPaintFlushLayers(layers, keepWorker);
}
async function _rapierPaintFlushLayers(layers, keepWorker = false) {
	for (const pending of layers) {
		_rapierPaintDropSnapshots(pending);
		// A lift still deciding what the paper is (wet or dry) says so first; a wet one is the wash's, settled by Paint's other owner.
		const lift = pending.pendingLift;
		if (lift?.deciding) await lift.decided;
		_rapierPaintFlushLift(pending);
		// A new Water contact waits on the same ordered publication, while its healthy encoder
		// keeps the immutable capture off the page. Urgent close and failure still flush below.
		if (keepWorker && pending.pngWorker && !pending.pendingOverflow) {
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
				// The painter never answered (it failed): nothing was read, so nothing is owed on it.
				if (!job.px) { _rapierPaintDropRevision(pending, job); continue; }
				try { job.raster = _rapierPaintPNG.encode(job.px); }
				catch (error) { _rapierPaintDropRevision(pending, job, error); throw error; }
			}
			try { _rapierPaintFinishRevision(pending, job.raster); }
			catch (error) { job.reject(error); throw error; }
		}
	}
}



// ---- The live layer ------------------------------------------------------------------------------
function _rapierPaintLayer() { return _rapierDrawState.paintLayer || null; }
// Raster pixels per canvas unit for a layer opened now: the stage's own device pixels (a phone at
// 3x shows a 3x layer crisp, a letterboxed drawing scaled up still paints at the screen's grain),
// never under the base scale, never above RAPIER_PAINT_SCALE_MAX, and reduced until the surface
// fits its pixel budget.
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
// The target a stroke works on: one explicit shape, resolved fresh before the gesture is admitted
// -- stateless, never a remembered "last painted" that could go stale across an Undo, a reload or a
// switch to a different painting. First, whatever is selected: a person who taps a painting with
// Select and switches to Paint (or a contextual Blend affordance that keeps the selection) is
// choosing that painting on purpose, wherever it sits and however it has since been moved, resized,
// rotated or flipped. Otherwise the topmost painting still eligible -- scanning down from the top
// of the stack rather than requiring the very last shape, so a vector added above it (lettering, an
// arrow) does not knock it out of eligibility. A locked shape, one turned into something other than
// paint, or one whose frame cannot be read is skipped; nothing eligible means the next stroke opens
// a fresh layer -- never a guess.
function _rapierPaintEligiblePaint(shape) {
	return !!shape && shape.recognized === 'paint' && !shape.locked && !!shape.raster && !!shape.geom && !!_rapierPaintTargetFrame(shape);
}
function _rapierPaintChooseCreated(shape) {
	const chosen = _rapierDrawShapeById(_rapierDrawState.paintChosenId);
	// An explicit change of medium starts its own picture. Subsequent strokes belong to that
	// picture, through Draw's existing selection owner, rather than opening another blank sheet.
	if (_rapierPaintEligiblePaint(chosen) && (chosen.paint?.mode === 'water') !== (shape.paint?.mode === 'water')) {
		_rapierDrawSetSelection([shape.id]); _rapierDrawSetSelection([]);
	}
}
function _rapierPaintTarget(mode = _rapierPaintMode()) {
	const state = _rapierDrawState;
	const accepts = shape => _rapierPaintEligiblePaint(shape) && (shape.paint?.mode === 'water' ? 'water' : 'paint') === mode;
	// The person's chosen paint identity: `state.paintChosenId` is owned by `_rapierDrawSetSelection`
	// (draw.js) alone, and outlives the on-canvas selection that Paint itself clears on every stroke
	// -- so choosing the lower of two paintings, then painting three strokes, keeps targeting the
	// lower one instead of drifting to whatever is topmost the moment the visual selection is gone.
	// It is forgotten -- falling through to the topmost-eligible default below -- the moment it is no
	// longer a real choice: removed, locked, turned into something other than paint, or its frame no
	// longer reads (each already covered by `_rapierPaintEligiblePaint`); a fresh document forgets it
	// explicitly (`_rapierDrawOpenSurface`).
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
// A target's own frame: the affine map from its raster's own pixels (0..pw, 0..ph, the grid it was
// painted at and keeps regardless of later transforms) to world canvas units, read straight from
// its CURRENT geom -- corners (`geom.p`, any transform including a flip) or `cx/cy/w/h/rot` (a
// similarity transform) both resolve to the same four corners, and a rectangle's corners under any
// affine transform stay a parallelogram, so `eux/euy` (world delta per +1 raster pixel, x) and
// `evx/evy` (…, y) alone describe it exactly, however it has been moved, resized, rotated or
// flipped since it was painted. `_rapierPaintFrameIsSimple` recognises the untransformed case
// (translation only, or nothing at all) so that common path -- most strokes, ever -- stays the
// original whole-canvas-surface, byte-identical continuation; every other case maps pointer
// samples through this frame's inverse into the target's own pixels.
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
	// A real transform, however small (1 %), is a transform; float noise from the frame's own
	// arithmetic is not (an exact comparison would make every reopened piece and every grown paper a
	// transformed picture: paint-pieces-reopen-as-one, paint-undo-keeps-the-view).
	const u = 1 / frame.scale, tol = u * 1e-6;
	return Math.abs(frame.eux - u) <= tol && Math.abs(frame.euy) <= tol && Math.abs(frame.evx) <= tol && Math.abs(frame.evy - u) <= tol;
}
// A transformed target's live surface is opened at its own native resolution (never resampled),
// padded so a stroke can grow its bounds beyond what was already painted, bounded by the same pixel
// budget a fresh layer respects.
function _rapierPaintFramePad(pw, ph, scale) {
	let pad = Math.round(Math.max(pw, ph, 64 * scale) * 0.35);
	pad = Math.min(pad, Math.round(400 * scale));
	while (pad > 0 && (pw + 2 * pad) * (ph + 2 * pad) > RAPIER_PAINT_AREA_MAX * 2) pad -= Math.max(1, Math.round(pad * 0.1));
	return Math.max(0, pad);
}
// How far outside a transformed target's own padded surface a sample may still land (raster
// pixels) before it is honestly unreachable rather than merely "near the edge" -- generous enough
// that a wide, soft brush whose dab centre sits just past the pad's own boundary is never mistaken
// for off-target.
const RAPIER_PAINT_REACH_FRINGE = 48;
// The target's own identity: a content digest of its raster, not just its length -- two different
// paintings the same size in bytes must never read as the same target -- alongside its id and its
// exact geometry (a move, resize or rotate is a different key even at the same id).
function _rapierPaintTargetKey(shape) { return shape.id + ':' + (shape.raster ? _rapierPaintDigest(shape.raster) : '0') + ':' + JSON.stringify(shape.geom); }
// The immutable dependency of ONE member of a grouped painting being decoded. A decode carries
// pixels computed FROM a member, so everything that decides which pixels those are has to be part
// of its identity: `_rapierPaintTargetKey`'s id/content/geometry, plus the raster grid that
// geometry maps (`px`), the scale it was painted at, the group it belongs to, and whether it is
// still eligible paint at all. A member locked, un-painted or re-pixelled between request and
// resolution is a CHANGED member even at the same id, raster and box.
function _rapierPaintMemberKey(shape) {
	const px = shape?.paint?.px;
	return _rapierPaintTargetKey(shape) + '|' + (Array.isArray(px) ? px.join('x') : '?') + '|' + (shape?.paint?.scale ?? '?')
		+ '|' + (shape?.paint?.group ?? '?') + '|' + JSON.stringify(shape?.effect || null) + '|' + (_rapierPaintEligiblePaint(shape) ? '1' : '0');
}
// Every OTHER piece of `target`'s painting, in recipe order: a painting kept in lossless pieces is
// ONE painting, so picking any piece up reopens the whole group. Factored out of
// `_rapierPaintRehydrateFor` so the membership can be read at request time and read AGAIN the
// instant the decode resolves, against whatever the recipe is by then -- the two readings are the
// same question asked twice, never two slightly different filters. Pieces are matched by id rather
// than object identity: a recipe rebuilt around an equal-id primary must not fold that primary
// into its own group.
function _rapierPaintGroupMembers(target, frame) {
	const state = _rapierDrawState;
	if (!target || target.paint?.group == null || !frame || !_rapierPaintFrameIsSimple(frame)) return [];
	return (state.recipe?.shapes || []).filter(shape => shape.id !== target.id && shape.recognized === 'paint' && shape.paint?.group === target.paint.group && shape.raster && _rapierPaintEligiblePaint(shape))
		// Merging raw pieces under one shape must not discard an individually authored effect.
		.filter(shape => JSON.stringify(shape.effect || null) === JSON.stringify(target.effect || null))
		.filter(shape => { const f = _rapierPaintTargetFrame(shape); return f && _rapierPaintFrameIsSimple(f) && Math.abs(f.scale - frame.scale) < 1e-6; });
}
// The immutable dependency of the COMPLETE material a decode is about: the primary and its ordered
// membership together. One string, so a sibling REPLACED, REMOVED, ADDED, moved, re-scaled or
// locked is the same single changed fact -- never "the primary is still fine, carry on", which
// would let a stale sibling's pixels be copied over a changed one and its id retired.
function _rapierPaintGroupKey(target, members) {
	return [target, ...members].map(_rapierPaintMemberKey).join(';');
}
function _rapierPaintWaterTargetUnion(target, frame, members) {
	// Keep the native raster grid, including every grouped piece. A current-session
	// sheet also owns water outside its visible crop; its whole recorded field fits.
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
// Whether the open layer can still take another stroke: its shape is on the canvas, unlocked, and
// exactly what the layer last wrote (undo, a move or an edit makes it a different picture) -- and,
// for an already-committed layer, still the resolved target (painting a different selected or
// last-painted shape invalidates whatever was open before).
function _rapierPaintLayerValid(forMaterialTool = false, geom = null, mode = _rapierPaintMode()) {
	const layer = _rapierPaintLayer(), state = _rapierDrawState;
	if (!layer || layer.mode !== mode || layer.session !== state.session || !layer.surface || layer.surface.failure || layer.surface.gone) return false;
	// A layer warmed before the finger arrived is a convenience, never an admission: it is refused
	// the moment the drawing has anything in it, or any input its geometry was computed from has
	// moved (a zoom, a resize, a device-pixel-ratio change), so the stroke opens a fresh one.
	if (layer.warmView && (state.recipe.shapes.length || state.recipe.strokes.length || layer.warmView !== _rapierPaintWarmView(geom || undefined))) return false;
	// SET and the 12-million-pixel rollover both finish the painting and open a CLEAN SHEET over the
	// picture they made -- which is the right durability design. But a clean sheet has `id == null`,
	// and a tool that works the material under it would have a genuinely empty surface to work: the
	// person sees a full painting and Smudge sees nothing.
	//
	// So: a material tool beginning on a sheet that holds no paint OF ITS OWN is not on a valid
	// layer. `_rapierPaintBegin` then resolves the painting beneath it through the ordinary target
	// path, and a painting set as several lossless pieces comes back as one layer (`paint.group`). A
	// BRUSH is untouched -- after SET a brush stroke is a new painting over the picture, exactly as
	// `paint-pieces-reopen-as-one` requires -- and once the clean sheet holds paint of its own, that
	// sheet is the material for everything.
	if (layer.id == null) return !(forMaterialTool && _rapierPaintTarget(mode) && !layer.surface.bounds());
	const target = _rapierPaintTarget(mode);
	if (!target || target.id !== layer.id) return false;
	return target.raster === layer.raster && JSON.stringify(target.geom) === layer.geom;
}
// A layer holds pixels the document does not. Closing it therefore COMMITS first, always, unless a
// person deliberately chose to discard them (_rapierPaintDiscardOverflow, wired into Undo).
//
// This is the rule that makes a whole class of loss impossible: a layer is a VIEW onto work, the
// recipe is the work, and no view change -- a zoom, a canvas growth, a restage, a tool change --
// may be able to destroy the work by discarding a view. `_rapierPaintOpenLayer` begins by closing,
// so without this guard every restage would vaporise anything the raster budget had refused to
// commit.
function _rapierPaintCloseLayer() {
	return _rapierPaintAfter(_rapierPaintFlushRevision(), () => _rapierPaintCloseNow());
}
function _rapierPaintCloseNow(synced = false) {
	const state = _rapierDrawState, layer = state.paintLayer;
	// Whatever the painter has not yet answered is answered first: the water, the wet flag and the painted box are read off its mirror.
	if (!synced && layer?.surface && !layer.surface.settled && !layer.surface.failure) return layer.surface.sync().then(() => _rapierPaintCloseNow(true), () => _rapierPaintCloseNow(true));
	_rapierPaintDropSnapshots(layer);
	_rapierPaintDropNextSheet(layer);
	if ((layer?.pendingOverflow || layer?.surface?.wetState || layer?.dryFinishing) && !state.paintClosing) {
		state.paintClosing = true;
		let kept;
		try { kept = _rapierPaintCommit(true); }
		catch (error) { state.paintClosing = false; showToast('The painting could not be kept. It is still open: ' + String(error?.message || error), 'error'); throw error; }
		return Promise.resolve(kept).then(() => { state.paintClosing = false; if (state.paintLayer !== layer) return; _rapierPaintFinishClose(layer); },
			error => { state.paintClosing = false; showToast('The painting could not be kept. It is still open: ' + String(error?.message || error), 'error'); throw error; });
	}
	_rapierPaintFinishClose(layer);
	return null;
}
function _rapierPaintFinishClose(layer) {
	const state = _rapierDrawState;
	state.paintLayer = null;
	// The encoder may still finish, but it no longer owns this view or the next drawing's latch: only
	// the SET that actually holds this layer's own token is released here.
	if (state.paintSetting?.layer === layer) { state.paintSetting = false; _rapierPaintUpdateStrip(); }
	if (layer?.pngWorker) { layer.pngWorker.worker.terminate(); URL.revokeObjectURL(layer.pngWorker.url); layer.pngWorker = null; }
	if (layer?.raf) cancelAnimationFrame(layer.raf);
	if (layer?.holdRaf) cancelAnimationFrame(layer.holdRaf);
	if (layer?.dryRaf) cancelAnimationFrame(layer.dryRaf);
	if (layer?.mount) layer.mount.remove();
	if (layer?.id != null && state.svg) state.svg.querySelector('[data-shape-id="' + layer.id + '"]')?.removeAttribute('data-paint-live');
	// The painter forgets this sheet, unless a stroke still holds it for its rollback (the stroke lets it go).
	if (layer && state.gesture?.paintRollback?.layer !== layer) _rapierPaintReleaseSurface(layer);
	_rapierPaintSweepBrushes();
}
// A surface or a brush the page is done with is let go in the painter (after everything queued for it); a layer's surface handle stays
// on the layer, closed, so that a late owner finds nothing to do rather than nothing.
function _rapierPaintReleaseSurface(layer) {
	const surface = layer?.surface;
	if (!surface) return;
	try { surface.drop(); } catch (_) {}
}
function _rapierPaintSweepBrushes(keep = _rapierDrawState.gesture?.paint?.brush || null) {
	const set = _rapierDrawState.paintBrushes;
	if (!set) return;
	for (const brush of [...set]) if (brush !== keep && brush !== _rapierPaintLayer()?.brush && !brush.inStroke) { set.delete(brush); try { brush.drop(); } catch (_) {} }
}
// The live overlay is an SVG `<foreignObject>`, the one standards mechanism that lets ordinary HTML
// content (the canvas) take a real place in an SVG's own paint order; a plain HTML sibling of the
// whole SVG would paint above every shape while a stroke was down, so a lower translucent painting
// would draw above upper paint or lettering mid-stroke. Mounted as a sibling of the target shape's
// own `<g>` inside `.rapier-draw-shapes` (right after it -- the target's own node is hidden
// throughout via `data-paint-live`, so which side it sits on does not matter, only what is above
// and below), it shares the target's exact z-slot. A layer with no known target yet (a brand new
// stroke, or the queued-gesture fallback for a target whose decode failed) mounts at the END of the
// shape list -- the natural place for a shape that does not exist until commit, which then appends
// it there for real.
function _rapierPaintMountLive(canvas, atShapeId) {
	const mount = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
	mount.setAttribute('x', '0'); mount.setAttribute('y', '0');
	mount.style.overflow = 'visible';
	// A Water sheet multiplies a Paper background (rapier-draw.css), as its kept painting does.
	if (canvas.getAttribute?.('data-water') != null) mount.setAttribute('data-water', '');
	canvas.style.display = 'block';
	mount.appendChild(canvas);
	_rapierPaintPositionMount(mount, atShapeId);
	return mount;
}
function _rapierPaintPositionMount(mount, id) {
	const host = _rapierDrawState.svg, at = id != null ? host?.querySelector('[data-shape-id="' + id + '"]') : null;
	// A copier can wrap the drawing or a split painting. Keep the overlay in its source
	// group and z-slot, including after a new composite filter replaces the scene nodes.
	if (at) at.after(mount); else (host?.querySelector('[data-rapier-copy-scene]') || host)?.appendChild(mount);
	// A shared layer wrapper already carries the fade; never apply it twice on remount.
	const shape = id != null ? _rapierDrawShapeById(id) : null;
	if (shape?.opacity != null && !mount.closest('[data-rapier-copy-layer]')) mount.setAttribute('opacity', String(shape.opacity));
	else mount.removeAttribute('opacity');
}
function _rapierPaintReattachLive() {
	for (const layer of _rapierPaintRevisionLayers()) {
		if (!layer.mount || !layer.canvas) continue;
		_rapierPaintPositionMount(layer.mount, layer.id);
		_rapierPaintShowLive(layer.liveWanted ?? layer.canvas.style.visibility !== 'hidden', layer);
	}
}
// The paper is what is seen, never a square canvas cut inside a portrait phone. A whole-canvas
// layer covers the union of the drawing's canvas and the visible stage, in canvas units, with an
// origin at that union's top-left (never above 0,0); a stroke committed beyond the canvas grows
// the canvas to hold it (`_rapierDrawGrowCanvas`).
// The margin a live layer keeps OUTSIDE the visible stage, in drawing units. Without it the
// surface ends exactly where the canvas does, so a dab centred on the edge loses the half of its
// footprint that falls past it and the mark is sliced flat against a straight line. A brush is a
// disc, not a pixel: it must have room to land with its whole width on the edge of the paper. The
// margin is never committed (the kept raster is `surface.bounds()`, the painted box), so it costs
// working memory during a stroke and nothing at all afterwards.
const RAPIER_PAINT_EDGE_PAD = 56;
function _rapierPaintStageUnion(recipe, pad = RAPIER_PAINT_EDGE_PAD) {
	const state = _rapierDrawState, svg = state.svgRoot;
	let x0 = 0, y0 = 0, x1 = recipe.canvas.w, y1 = recipe.canvas.h;
	// The paper covers the frame, so the painting surface does: a mark inside the frame is never cut at the canvas's edge.
	const frame = state.resize?.frame || recipe.frame;
	if (frame) { x0 = Math.min(x0, Math.floor(frame.x)); y0 = Math.min(y0, Math.floor(frame.y)); x1 = Math.max(x1, Math.ceil(frame.x + frame.w)); y1 = Math.max(y1, Math.ceil(frame.y + frame.h)); }
	if (svg) {
		const rect = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
		if (rect.width && rect.height && vb.width && vb.height) {
			// The WHOLE WINDOW, not the stage's own rectangle. A finger keeps painting wherever it goes
			// once the gesture has it -- over the toolbar, past the top of the glass -- so every point a
			// pointer can reach is inside the paper, and the pad is still there for the brush's own width
			// at the very corner. The margin is never committed: what is kept is `surface.bounds()`, the
			// painted box, so this costs working memory during a stroke and nothing at all in the file.
			const a = _rapierDrawMapPoint(0, 0, rect, vb), b = _rapierDrawMapPoint(innerWidth, innerHeight, rect, vb);
			x0 = Math.min(x0, Math.floor(a[0])); y0 = Math.min(y0, Math.floor(a[1])); x1 = Math.max(x1, Math.ceil(b[0])); y1 = Math.max(y1, Math.ceil(b[1]));
		}
	}
	return { x0: x0 - pad, y0: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}
function _rapierPaintBlankSheet(w, h, scale, prepared = null, mode = _rapierPaintMode(), material = null) {
	const remote = _rapierPaintRemoteNow(mode);
	if (!remote) throw new Error('The painter is not ready');
	// The surface is the painter's: the page holds its mirror. Its sheet is blank paper at this raster scale.
	const surface = remote.surface(w, h, mode === 'water' ? {mode: 'water', pixelScale: scale, paper: _rapierWaterState().paper, waterSession: _rapierWaterSession(), trackedGrowth: true, ...material} : {wet: RAPIER_PAINT_WET, trackedGrowth: true});
	if (mode !== 'water') surface.set('paper', RAPIER_PAINT_PAPER); surface.set('scale', scale / RAPIER_PAINT_GRAIN);
	const {canvas, ctx} = _rapierPaintBlankCanvas(w, h, prepared, mode);
	if (!ctx) surface.bindDisplay(canvas.transferControlToOffscreen()).catch(() => {});
	return {surface, canvas, ctx};
}
// The overlay a sheet is shown on: a canvas of the sheet's own size (one made ahead of a cap's flip is adopted).
function _rapierPaintBlankCanvas(w, h, prepared = null, mode = 'paint') {
	const canvas = prepared?.canvas || document.createElement('canvas');
	canvas.className = 'rapier-draw-paint-live';
	if (mode === 'water') canvas.setAttribute('data-water', '');
	if (canvas.width !== w) canvas.width = w;
	if (canvas.height !== h) canvas.height = h;
	canvas.setAttribute('aria-hidden', 'true');
	// Transfer before choosing a context. Hosts without transferable canvases keep their existing 2D display.
	if (mode === 'water' && typeof canvas.transferControlToOffscreen === 'function') return {canvas, ctx:null};
	const ctx = prepared?.ctx || canvas.getContext('2d');
	// Touch the backing store while the blank sheet is still detached from the scene.
	ctx.putImageData(new ImageData(1, 1), 0, 0);
	return {canvas, ctx};
}
function _rapierPaintOpenLayer(scale = _rapierPaintLayerScale(), atShapeId = null, emptyUnion = null, prepared = null, mode = _rapierPaintMode(), material = null) {
	const state = _rapierDrawState, recipe = state.recipe;
	_rapierPaintCloseLayer();
	// A cap, first Water contact or complete retained Water field supplies its own box.
	// Existing pixels must all fit; the supplied Water box includes its full native material.
	let union = emptyUnion || _rapierPaintStageUnion(recipe);
	// When the union will not fit, the layer shrinks back to the CANVAS BOX: the canvas box is the
	// one region the committed painting is guaranteed to live inside.
	//
	// Never shrink the union about the stage's centre instead: `layer.origin` is that union's corner,
	// and a commit writes back only what the layer holds -- so the moment the union stops containing
	// the existing painting, the parts outside it are gone, and a zoom clears the canvas. A layer may
	// never be smaller than the work it is holding; any edge crop has to start from that, not from
	// the reachable area.
	let w = Math.max(1, Math.round(union.w * scale)), h = Math.max(1, Math.round(union.h * scale));
	if (!emptyUnion && w * h > RAPIER_PAINT_AREA_MAX * 2) {
		union = { x0: -RAPIER_PAINT_EDGE_PAD, y0: -RAPIER_PAINT_EDGE_PAD, w: recipe.canvas.w + RAPIER_PAINT_EDGE_PAD * 2, h: recipe.canvas.h + RAPIER_PAINT_EDGE_PAD * 2 };
		w = Math.max(1, Math.round(union.w * scale)); h = Math.max(1, Math.round(union.h * scale));
	}
	if (!emptyUnion && w * h > RAPIER_PAINT_AREA_MAX * 2) { union = { x0: 0, y0: 0, w: recipe.canvas.w, h: recipe.canvas.h }; w = Math.max(1, Math.round(union.w * scale)); h = Math.max(1, Math.round(union.h * scale)); }
	if (w * h > RAPIER_PAINT_AREA_MAX * 2) throw new Error('Canvas is too large to paint on');
	// Water's paper field is fixed to the drawing, like the paper background that shows it.
	if (mode === 'water' && typeof _rapierWaterPaperFrame === 'function') material = {...material, ..._rapierWaterPaperFrame(union.x0 * scale, union.y0 * scale, h, scale)};
	const {surface, canvas, ctx} = _rapierPaintBlankSheet(w, h, scale, prepared, mode, material);
	// The overlay holds every pixel of the surface at all times. An EMPTY one is safe to leave
	// showing -- there is nothing on it to double with the committed picture -- so a fresh layer's
	// overlay does not wait for the stroke to make it visible; a decoded target's still must, because
	// its own translucent pixels would add to the <image> underneath.
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
// A transformed target's own live layer: sized to its native raster plus growth padding, not the
// whole canvas -- `layer.frame` carries the affine map every pointer sample and every commit reads.
function _rapierPaintOpenLocalLayer(frame, atShapeId = null, mode = _rapierPaintMode()) {
	const state = _rapierDrawState;
	_rapierPaintCloseLayer();
	const pad = _rapierPaintFramePad(frame.pw, frame.ph, frame.scale);
	const w = Math.max(1, Math.round(frame.pw + pad * 2)), h = Math.max(1, Math.round(frame.ph + pad * 2));
	if (w * h > RAPIER_PAINT_AREA_MAX * 2) throw new Error('Painting is too large to reopen for painting');
	// A turned or scaled painting cannot share the drawing's paper grid; its sheet keeps the paper's scale.
	const {surface, canvas, ctx} = _rapierPaintBlankSheet(w, h, frame.scale, null, mode, mode === 'water' && typeof _rapierWaterPaperFrame === 'function' ? {..._rapierWaterPaperFrame(0, 0, h, frame.scale), paperOrigin: [0, 0]} : null);
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
// The mount (`<foreignObject>`) carries the canvas's own raster pixels into the SVG's own coordinate
// system: its local box is exactly the canvas's own pixel grid (`width`/`height` in raster px), and
// its `transform` is the affine that maps that grid into world/canvas units -- `scale(1/layerScale)`
// for a whole-canvas layer (the same uniform pixels-per-unit every raster in the drawing uses), or
// the target's own frame (`eux/euy/evx/evy/c0`, minus the pad) for a transformed one, the identical
// map `_rapierPaintEventPoint` and `_rapierPaintCommit` already read. The SVG's own viewBox-to-screen
// transform (letterboxing included) then places it on screen for free -- no separate screen-pixel
// math, and no separate reason for it to drift from where the shapes around it actually sit.
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
	// Input may already name queued growth. Place the submitted frame at its own material origin.
	if (display) {
		const dx = display.toothOX - layer.surface.toothOX, dy = display.toothOY - layer.surface.toothOY;
		matrix[4] += dx * matrix[0] + dy * matrix[2]; matrix[5] += dx * matrix[1] + dy * matrix[3];
	}
	mount.setAttribute('transform', 'matrix(' + matrix.map(n => (Number.isFinite(n) ? n : 0)).join(',') + ')');
}
// The overlay's pixels are the browser's to take. A phone short of GPU memory -- a big painting is exactly that
// -- drops a 2D canvas's backing store (`contextlost`) and hands the canvas back blank (`contextrestored`), and
// the blit only ever repaints the dirty box, so the overlay would stay blank for good and every touch-down would
// hide the kept picture behind an empty sheet. While the store is gone the kept picture does not step aside
// (`_rapierPaintShowLive`); when it returns, the whole layer is painted again.
function _rapierPaintWatchOverlay(layer) {
	const canvas = layer.canvas;
	// The display store is replaced only by a new element; a delayed event from a retired canvas must never hide or repaint the store
	// now owned by the same material layer.
	canvas.addEventListener('contextlost', () => { if (layer.canvas !== canvas) return; layer.lost = true; _rapierPaintShowLive(layer.liveWanted ?? canvas.style.visibility !== 'hidden', layer); });
	canvas.addEventListener('contextrestored', () => {
		if (layer.canvas !== canvas) return;
		const wanted = layer.liveWanted ?? canvas.style.visibility !== 'hidden';
		layer.lost = false;
		if (_rapierDrawState.paintLayer !== layer) return;
		if (layer.gpuDisplay) layer.displayReady = false;
		// The painter still holds every pixel: its whole readout is laid again.
		_rapierPaintRepaintAll(layer);
		_rapierPaintShowLive(wanted, layer);
	});
}
function _rapierPaintOverlayLost(layer) { return !!layer?.lost || !!layer?.ctx?.isContextLost?.(); }
function _rapierPaintRecordLiveBox(layer, box) {
	// A cleared canvas may receive a full transparent rollback readout. Its known material
	// extent, including zero-alpha channels and relief, also bounds every nonzero display byte.
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
	const {canvas} = _rapierPaintBlankCanvas(meta.width, meta.height, null, 'water');
	canvas.style.visibility = 'hidden';
	layer.pendingDisplay = {canvas, generation: surface.displayGeneration + 1};
	surface.bindDisplay(canvas.transferControlToOffscreen()).catch(() => {});
}
// Adopt complete pixels and their placement together; the worker releases the prior canvas only after acknowledgement.
function _rapierPaintDisplay(layer, reply) {
	const canvas = layer.canvas, meta = reply.meta, patch = reply.patch;
	if (!canvas || layer.surface?.gone) return;
	if (layer.gpuDisplay) {
		const display = reply.display;
		if (display?.generation !== layer.surface.displayGeneration) return;
		if (display.replace) { _rapierPaintReplaceDisplay(layer, meta); return; }
		if (!display.submitted) return;
		const pending = layer.pendingDisplay;
		if (pending?.generation === display.canvasGeneration) {
			canvas.replaceWith(pending.canvas); layer.canvas = pending.canvas; layer.pendingDisplay = null;
			_rapierPaintWatchOverlay(layer);
		} else if (layer.canvasGeneration && layer.canvasGeneration !== display.canvasGeneration) return;
		layer.canvasGeneration = display.canvasGeneration;
		layer.displayMeta = {...meta}; layer.displayReady = true; layer.lost = false; layer.liveBox = null;
		if (meta.bounds) _rapierPaintRecordLiveBox(layer,meta.bounds);
		_rapierPaintPlaceLive(layer); _rapierPaintShowLive(layer.liveWanted,layer);
		layer.surface.adoptDisplay(display.canvasGeneration);
		if (layer.setPending) { layer.setPending = false; _rapierPaintAfterFrame(_rapierPaintSyncSet); }
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
// The whole sheet, read back and laid again: after the browser took the overlay's pixels, or when a reply could not carry its own.
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
// Housekeeping that must not stand between the finger and the first mark. Two frame boundaries,
// because a blit that ran synchronously is still ahead of the browser's next render opportunity;
// the session is rechecked, so nothing from a closed surface runs against a new one.
function _rapierPaintAfterFrame(update) {
	const state = _rapierDrawState, session = state.session;
	requestAnimationFrame(() => requestAnimationFrame(() => { if (state.open && state.session === session) update(); }));
}
// ---- Drying
// ---------------------------------------------------------------------------------------
// Paint settles its deferred wet work before publication. Water publishes each lifted gesture
// immediately and keeps its material live; elapsed display frames amend that gesture's pixels
// until the next gesture takes its checkpoint. Closing paths publish all accepted material.
function _rapierPaintScheduleDry(layer) {
	if (!layer || !layer.surface?.wetState) return;
	// The lift's pending live write now belongs to the same bounded readout as the wash.
	if (layer.raf) { cancelAnimationFrame(layer.raf); layer.raf = 0; }
	if (layer.dryRaf || layer.dryBusy) return;
	layer.dryFinishing = true;
	layer.dryAt = performance.now();
	layer.dryRaf = requestAnimationFrame(() => _rapierPaintDryTick(layer));
}
// Readout keeps the surface's dirty box until its last band. Another stroke, growth or a full
// blit invalidates this cursor; a partly shown frame can never discharge newer material.
function _rapierPaintDryTick(layer) {
	const state = _rapierDrawState;
	layer.dryRaf = 0;
	if (state.paintLayer !== layer || !layer.surface || (!layer.surface.wetState && !layer.dryFinishing)) return;
	// Admitted gestures keep their place ahead of idle work after the pointer lifts.
	const admitted = layer.mode === 'water' && state.waterStrokes?.some(receipt => !receipt.finished && receipt.session === state.session && receipt.tool === _rapierDrawTool() && receipt.gesture?.paint && !receipt.gesture.paint.discarded);
	if (state.gesture || admitted || layer.dryBusy) { layer.dryRaf = requestAnimationFrame(() => _rapierPaintDryTick(layer)); return; }
	const now = performance.now(), elapsed = Math.max(0, now - layer.dryAt);
	layer.dryAt = now;
	layer.dryBusy = true;
	const surface = layer.surface;
	// Water advances the elapsed frame time. Paint drains a bounded slice of deferred work.
	const sliced = layer.mode === 'water' ? surface.advanceWet(elapsed) : surface.dryWet(RAPIER_PAINT_DRY_FEED, RAPIER_PAINT_DRY_SLICE);
	surface.remote.flush().catch(() => {});
	sliced.then(done => {
		layer.dryBusy = false;
		_rapierPaintWetWake(layer);
		if (state.paintLayer !== layer || layer.surface !== surface || !layer.dryFinishing) return;
		if (!done) { layer.dryRaf = requestAnimationFrame(() => _rapierPaintDryTick(layer)); return; }
		layer.dryFinishing = false;
		_rapierPaintCommitSoon(layer);
	}, () => { layer.dryBusy = false; });
}
// A recovery that waits for the held operation waits for the next reply that shows the painter between two operations.
function _rapierPaintWetWake(layer) {
	if (layer.surface?._wetWork || !layer.wetWaiters?.length) return;
	for (const ok of layer.wetWaiters.splice(0)) ok();
}
// Publish the accepted state before a live layer ends. Paint settles its deferred physics;
// Water flushes queued contact without adding simulated time. Null when nothing is wet.
function _rapierPaintFlushWet() {
	return _rapierPaintAfter(_rapierPaintFlushRevision(), () => {
		const layer = _rapierPaintLayer();
		if (!layer?.surface) return null;
		return _rapierPaintAfter(layer.surface.settled || layer.surface.failure ? null : layer.surface.sync(), () => {
			if (!layer.surface.wetState && !layer.dryFinishing) return false;
			if (layer.dryRaf) { cancelAnimationFrame(layer.dryRaf); layer.dryRaf = 0; }
			layer.dryBox = null; layer.dryFinishing = false;
			const committed = _rapierPaintCommit();
			return Promise.resolve(committed).then(() => _rapierPaintFlushRevision()).then(() => true);
		});
	});
}
function _rapierPaintScheduleBlit() {
	(_rapierPaintLayer()?.surface?.remote || _rapierPaintRemoteNow())?.requestFrame();
}
// The stroke shows on the overlay (every pixel of the layer, the new dabs included) and the committed
// <image> of the same layer steps aside; at commit they swap back. Both never show at once (a
// translucent edge would double) and never both hide (a mark would vanish).
function _rapierPaintShowLive(on, layer = _rapierDrawState.paintLayer) {
	const state = _rapierDrawState;
	if (!layer?.canvas || !_rapierPaintRevisionLayers().includes(layer)) return;
	if (layer.gpuDisplay) { layer.liveWanted = on; on = on && layer.displayReady && !_rapierPaintOverlayLost(layer); }
	const visibility = on ? '' : 'hidden';
	if (layer.canvas.style.visibility !== visibility) layer.canvas.style.visibility = visibility;
	// An overlay whose pixels the browser took away shows nothing: the kept picture stays up under it.
	const aside = on && !_rapierPaintOverlayLost(layer);
	if (layer.id != null) { const g = state.svg?.querySelector('[data-shape-id="' + layer.id + '"]'); if (g) { if (aside) g.setAttribute('data-paint-live', ''); else g.removeAttribute('data-paint-live'); } }
}
// A brush a person brings is theirs, and the file they get back out is the file they brought in --
// `_rapierPaintExportBrush` writes the stored `.myb` untouched. But a preset written for a stylus
// on a desk does not necessarily work under a thumb, and the two ways it fails are known: it can
// refuse to paint on bare paper at all, and it can lay its dabs so sparsely that one finger pass is
// a row of separate dots where the author expected many careful passes. Rapier repairs exactly
// those two, on the brush it loads and never on the file it keeps, and the person can switch it off
// for the brush they are holding. Factory presets are never touched: MyPaint's own pack paints here
// exactly as its author tuned it.
const RAPIER_PAINT_FINGER_DABS = 1.5;
function _rapierPaintFitFinger(def, finger) {
	const at = RAPIER_PAINT_SETTING_AT, changed = [];
	// Every preset works with a finger; none is stylus-only.
	//
	// Dieterle's pack was tuned on a stylus, where a mark is built over many slow passes. `finger` is
	// what ONE pass of that preset measured at the phone's own scale when the pack was generated
	// (tools/brushes.mjs, the finger floor): the opacity gain that makes its ink visible, and the
	// radius lift that makes its mark wide enough for a blunt instrument. Measured, never guessed,
	// and recomputed whenever the engine or a preset moves.
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
		layer.brush = layer.surface.remote.brush(def); (_rapierDrawState.paintBrushes ||= new Set()).add(layer.brush);
		layer.brushId = id; layer.brushDip = key; layer.brushRadius = def.settings[3].base; layer.waterPaper = def.water.paper;
		_rapierPaintSweepBrushes(); return layer.brush;
	}
	// Cached against the dip as well as the id -- a re-dipped brush is a different brush, and the
	// cached one would otherwise keep painting the old dip for the rest of the session. The dip lives
	// in its own field: `brushId` is written into the saved shape as the brush that painted it and
	// must stay the plain preset id.
	const dip = _rapierPaintDipKey(id);
	if (layer.brush && layer.brushId === id && layer.brushDip === dip) return layer.brush;
	layer.brush = null;
	const def = _rapierPaintDefFor(id);
	// The brush is the painter's, made by identity from its settings; the page keeps the settings that decide its own behaviour.
	const state = _rapierDrawState;
	layer.brush = _rapierPaintRemoteNow().brush(def); (state.paintBrushes ||= new Set()).add(layer.brush);
	layer.brushId = id; layer.brushDip = dip; layer.brushRadius = def.settings[3].base;
	_rapierPaintSweepBrushes();
	return layer.brush;
}

// ---- Gesture
// ----------------------------------------------------------------------------------------
// World canvas coordinates, mapped through the live layer's own frame when it has one: a transformed
// target's pointer samples land in its own pixels, not the page's, so a resize, rotate or move since
// it was painted changes nothing about how a stroke feels.
function _rapierPaintEventPoint(evt, geom, layer) {
	const p = _rapierDrawMapPoint(evt.clientX, evt.clientY, geom.rect, geom.vb);
	let x = p[0], y = p[1], reach = true;
	const f = layer?.frame;
	if (f) {
		const dx = x - f.c0[0], dy = y - f.c0[1], det = f.eux * f.evy - f.evx * f.euy;
		if (det) {
			const px = (dx * f.evy - dy * f.evx) / det, py = (dy * f.eux - dx * f.euy) / det;
			const pxPad = px + f.pad, pyPad = py + f.pad, fringe = RAPIER_PAINT_REACH_FRINGE;
			// Whether the current surface can reach the sample. Growth admits a point beyond this
			// box in _rapierPaintGrowToHold; a blocked growth keeps the explicit off-target refusal.
			reach = pxPad >= -fringe && pxPad <= layer.surface.width + fringe && pyPad >= -fringe && pyPad <= layer.surface.height + fringe;
			x = pxPad / layer.scale; y = pyPad / layer.scale;
		} else reach = false;
	} else if (layer?.origin) { x -= layer.origin[0]; y -= layer.origin[1]; }
	const tiltX = Number.isFinite(evt.tiltX) ? _rapierDrawClamp(evt.tiltX / 90, -1, 1) : 0, tiltY = Number.isFinite(evt.tiltY) ? _rapierDrawClamp(evt.tiltY / 90, -1, 1) : 0;
	// Twist (a stylus's barrel rotation, W3C PointerEvent.twist, 0-359 degrees) as the fraction of a
	// full turn `strokeTo`'s own `barrel` parameter expects (draw/paint.mjs multiplies it by 360
	// before comparing against MyPaint's barrel_rotation input).
	const twist = Number.isFinite(evt.twist) ? ((evt.twist % 360) + 360) % 360 / 360 : 0;
	return { x, y, tiltX, tiltY, twist, t: evt.timeStamp, reach };
}
// A pen's pressure is used as it reports it. A finger (or a mouse) reports none, and these brushes
// were tuned for a hand that presses: the pack's oils smudge at a light touch and lay paint at a
// firm one, its pencils and pens thicken and darken with it. So a finger's pressure is its speed --
// a hand naturally bears down when it slows and lifts as it flicks -- eased so the line breathes
// rather than stutters: a rest is a firm press, a fast sweep a light one (or, on Light strength, a
// lighter one still -- see RAPIER_PAINT_SIM_LIGHT_* above).
function _rapierPaintPressure(evt, paint, p) {
	if (evt.pointerType === 'pen' && Number.isFinite(evt.pressure)) return _rapierPaintPressed(Math.min(1, Math.max(0, evt.pressure)), 'pen', 0);
	// The gesture's own admitted strength, not whatever the strip currently reads -- a toggle tapped
	// mid-stroke (or while a stroke is still queued on a decode) never reaches back into a gesture
	// already under way. Read once, here, so both the real-touch branch below and the simulated-speed
	// model share one definition of what Firm/Light mean: the strength toggle's two states are the
	// person's own pressure for every preset -- Firm reaches this band's own top end, Light this
	// band's own top end is lower still -- and it is each preset's own pressure-input curve
	// (opaque_multiply, smudge_length_log and the rest) that decides what its own hard and soft
	// actually do; the adapter never special-cases a brush.
	const level = paint.settings.touch;
	// Speed runs on every sample, whatever else is available: it is what the blend falls back on,
	// and it must not be a cold start on the sample where the patch stops being trusted.
	const speedConst = _rapierPaintTouchAt(level).speed;
	// The 4 ms floor used to stand in for BOTH the speed divisor and the smoothing's elapsed time, so
	// above 250 Hz every event invented time: the same 400 ms stroke read 0.311 at 60 Hz and 0.721 at
	// 1000 Hz. Real elapsed time drives the smoothing; the floor now only guards the division.
	const elapsed = _rapierDrawClamp((p.t - paint.last) / 1000, 0, 0.5);
	const speed = Math.hypot(p.x - paint.x, p.y - paint.y) / Math.max(1e-4, elapsed);
	paint.q += (Math.exp(-speed / speedConst) - paint.q) * -Math.expm1(-elapsed * 1000 / RAPIER_PAINT_SIM_TAU);
	const bySpeed = _rapierPaintFeel(paint.q, level);

	// EVERY channel is observed on every sample and each earns its own confidence from how far it has
	// actually moved this session; none of them returns early, so a panel reporting a CONSTANT 14x14
	// contact -- which many do -- never makes the raw pressure branch unreachable while that pressure
	// swings 0.1 to 0.9. Contact diameter is not force; a reading that never varies is not evidence
	// of anything.
	//
	// Authority runs speed < patch < pressure: speed is an inference about the hand, the patch a
	// proxy for it, a reported force the thing itself -- so each is folded over the last by its own
	// trust.
	const patch = evt.pointerType === 'touch' ? _rapierPaintPatch(evt) : 0;
	let value = bySpeed, from = 'speed';
	if (patch > 0) {
		// The band starts at a real finger's own geometry and only ever opens, so a first stroke
		// already answers the hand; `lo`/`hi` are the raw readings, and how far apart they have come
		// is how much of the answer the patch gets.
		const seen = _rapierPaintPatchSeen;
		seen.lo = Math.min(seen.lo, patch); seen.hi = Math.max(seen.hi, patch);
		seen.min = Math.min(seen.min, patch); seen.max = Math.max(seen.max, patch);
		const q = _rapierDrawClamp((patch - seen.min) / Math.max(1, seen.max - seen.min), 0, 1);
		// Belief is earned by VARIATION, and only by variation. A contact diameter is not a force, and
		// the panels that matter report a placeholder -- the emulated digitizer here reports a constant
		// 16x16 with a constant pressure of 0.6, and real phones report much the same. A constant says
		// the finger is there, nothing about how hard it is pressing, and reading it as an absolute
		// position in a fingertip band would silently turn every firm stroke into a light one (Blender's
		// drag falls from 36.6 to 1.1 under that rule).
		const trust = _rapierDrawClamp((seen.hi - seen.lo) / RAPIER_PAINT_PATCH_TRUST, 0, 1);
		value += (_rapierPaintFeel(q, level) - value) * trust;
		if (trust > .5) from = 'patch';
	}
	if (evt.pointerType === 'touch' && Number.isFinite(evt.pressure) && evt.pressure > 0) {
		const seen = _rapierPaintTouchSeen;
		seen.min = Math.min(seen.min, evt.pressure); seen.max = Math.max(seen.max, evt.pressure);
		// This finger's own hardest press this session maps to 1, its own lightest to 0 -- reached, not
		// assumed -- then through the same feel curve as every other signal. Graded rather than a
		// threshold, so a panel whose pressure is slowly proving itself is not ignored entirely and then
		// trusted wholly one sample later.
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
// ---- Stationary time
// ---------------------------------------------------------------------------------
// A preset can spend dabs on held time alone (`dabs_per_second`, the fountain pens): libmypaint
// advances that on every motion event, however small, and Rapier's gesture only fires those on
// down/move/up -- a hand that rests mid-stroke never generates one, so a held fountain nib would stay
// dry. Only presets that declare `dabs_per_second` schedule this; every other brush is untouched, and
// the loop advances the SAME `paint.last` clock a real move event would, so held time is never
// counted twice. It runs only while the gesture is still the live one and stops the moment it isn't
// -- pointer up, cancel, a lost pointer or a hidden page all end the gesture first (draw.js), which
// is what actually stops it; the checks here are the belt to that buckle.
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
	// paint.last lives in the pointer event clock (evt.timeStamp), which a real move or end event
	// keeps advancing in the same domain; performance.now() is read here only through the fixed
	// offset measured at the gesture's first event, so a held stroke's dt and a moved stroke's dt
	// are never counted against two different clocks (or against each other twice).
	const now = performance.now() - paint.clockOffset, dt = _rapierDrawClamp((now - paint.last) / 1000, 0.001, 0.5);
	paint.last = now;
	if (layer.mode === 'water') {
		// A held frame is admitted only after its predecessor completes. Pointer samples keep
		// their own order; a busy painter never owes a queue of obsolete animation frames.
		// Water steps once a frame by that frame's own interval, as the reference does: the time since
		// the previous Water frame, not since the latest pointer event, which would leave a stroke
		// (samples arriving between frames) with a fraction of its time and its flow undamped.
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
	// The last REAL tilt and twist a move or the initial dab reported: a held hand does not typically
	// change its angle, so holding the last real reading is the honest value, not a fabricated one,
	// and a stylus held still at an angle never reads as flat.
	// Where the MARK ends, not where the hand is: the frontier sample the lift lag last released. The
	// landing envelope is NOT reapplied here -- it is a function of travel, a held hand has none, and
	// charging it again would hold a dwelling brush at the landing floor for as long as it rested.
	const at = paint.drawn;
	const hx = at ? at.p.x : paint.x, hy = at ? at.p.y : paint.y;
	const htx = at ? at.p.tiltX : paint.tiltX, hty = at ? at.p.tiltY : paint.tiltY, hw = at ? at.p.twist : paint.twist;
	paint.brush.strokeTo(layer.surface, hx * RAPIER_PAINT_GRAIN, hy * RAPIER_PAINT_GRAIN, paint.pressure, htx, hty, dt, 1, 0, hw, paint.inputKind);
	_rapierPaintScheduleBlit();
	_rapierPaintScheduleHold(gesture);
}
// ---- Beginning, continuing and ending a stroke
// -----------------------------------------------------
// The gesture's own admitted facts: read once, the instant the gesture begins -- never again from
// whatever the strip or the clock currently say -- so a brush, colour, size or strength changed while
// a stroke waits on a decode can never reach back into that stroke. A fresh seed is minted here (not
// inside init) for the same reason: one admitted seed per gesture, not one per replay.
function _rapierPaintAdmitSettings(erasing, tool = _rapierDrawTool()) {
	erasing = !!erasing || tool === 'erase';
	if (_rapierPaintMode(erasing) === 'water') {
		const paintEraser = !erasing && tool === 'paint' && _rapierPaintBrushId() === RAPIER_PAINT_ERASER_ID;
		const settings = _rapierWaterAdmitSettings(erasing || paintEraser);
		if (paintEraser) settings.radiusOffset = RAPIER_PAINT_ERASER_LOGR + _rapierPaintRadiusOffset(_rapierPaintSize()) - settings.definition.settings[3].base;
		return settings;
	}
	// Erasing is an ordinary paint gesture with the eraser preset and the ERASE tool's own radius --
	// the same width its live ring shows -- so the two tools agree about how big the eraser is.
	if (erasing) {
		const r = _rapierDrawEraseRadius();
		return { brushId: RAPIER_PAINT_ERASER_ID, color: _rapierPaintColor(), radiusOffset: Math.log(Math.max(2, r * RAPIER_PAINT_GRAIN)) - RAPIER_PAINT_ERASER_LOGR, strength: 'firm', touch: 0, edgeSoftness: _rapierDrawEraseSoftness() / 100, seed: (Math.random() * 0x3fffffff) | 0, erasing: true };
	}
	return { brushId: _rapierPaintBrushId(), color: _rapierPaintColor(), radiusOffset: _rapierPaintRadiusOffset(_rapierPaintSize()), strength: _rapierDrawState.paintStrength === 'light' ? 'light' : 'firm', touch: _rapierPaintTouchLevel(_rapierPaintBrushId(), _rapierDrawState.paintStrength === 'light'), lift: _rapierPaintLiftOf(_rapierPaintBrushId()), seed: (Math.random() * 0x3fffffff) | 0, ..._rapierPaintHeadSettings(_rapierPaintBrushId()) };
}
// Sets up the brush and plants the first dab on whatever layer is already open (state.paintLayer),
// entirely from the gesture's own admitted `settings` and `geom` (never read fresh here): the fast
// synchronous path (a fresh blank layer, or a layer already picked up) and the queued path (below)
// both land here once a live surface is ready.
// A second finger abandons only the live stroke. Older wet paint, layer growth and history return
// to their exact pre-stroke state; no encode of the abandoned pixels may arrive later.
async function _rapierPaintStrokeCheckpoint(gesture, layer) {
	const state = _rapierDrawState, session = state.session, surface = layer.surface;
	// A drying wash's suspended step finishes in the painter, and the page reads what that left: the wet flag decides what follows.
	surface.finishWetWork();
	if (!surface.settled) await surface.sync();
	if (layer.dryFinishing && !surface.wetState) { const flushed = _rapierPaintFlushWet(); if (flushed) await flushed; }
	const flush = _rapierPaintFlushRevision(layer, layer.mode === 'water');
	if (flush) await flush;
	if (layer.mode === 'water' && layer.flipStroke?.entry && surface.revision !== layer.checkpoint?.revision) {
		// Preserve the previous gesture at the wet state the next hand actually meets.
		// This replaces that gesture's latest pixels without running an artificial Dry.
		await _rapierPaintEncodeRevision(layer).promise;
	}
	// A stroke abandoned while it waited owes nothing, and must not leave a checkpoint nobody will end.
	if (!state.open || state.session !== session || gesture.paint?.discarded) return 'gone';
	// Finishing an empty wash or an erased lifted revision can retire this view. Resolve the
	// next stroke against the remaining drawing before taking a rollback or touching pixels.
	if (_rapierPaintLayer() !== layer) return false;
	if (layer.mode === 'water' && layer.waterMaterial) {
		const material=layer.waterMaterial,target=_rapierDrawShapeById(layer.id);
		if(!target || target.raster!==layer.raster || !globalThis.RapierDrawAgentPaint.waterPaintingIsLive(target,material.session))throw Object.assign(new Error('This Water layer changed before the stroke was ready.'),{code:'paint_target_changed'});
		await surface.fromWaterMaterial(material.replay,material.session);
		delete layer.waterMaterial;
		if (!state.open || state.session !== session || gesture.paint?.discarded) return 'gone';
		if (_rapierPaintLayer() !== layer) return false;
	}
	// Keep the prior contribution's identity for cancellation.
	const previousStroke = layer.flipStroke;
	layer.flipStroke = null;
	const props = {};
	for (const key of ['id', 'raster', 'geom', 'origin', 'frame', 'retire', 'checkpoint', 'pendingOverflow', 'setPending', 'paintVersion', 'paintReplay', 'waterCapture', 'waterSheet', 'waterPaper']) props[key] = _rapierDrawHistoryCopy(layer[key]);
	// The checkpoint itself lives in the painter (beginStroke is the first command of the stroke's batch); the page keeps its name.
	gesture.paintRollback = {layer, props, previousStroke, pixels: surface.beginStroke({record: !!layer.paintReplay}), recipe: _rapierDrawHistoryRecipe(), undo: state.undoStack.slice(), redo: state.redoStack.slice(), view: {..._rapierDrawView()}};
}
function _rapierPaintReleaseStroke(gesture, cancel = false) {
	const saved = gesture.paintRollback, state = _rapierDrawState;
	if (gesture.paint?.brush) gesture.paint.brush.inStroke = false;
	if (!gesture.paint?.mouse) { state.headEl?.setAttribute('d', ''); state.headAt = null; }
	if (gesture.paint?.pending) gesture.paint.discarded = true;
	if (gesture.waterStroke && (cancel || gesture.paint?.discarded || !gesture.paint?.lifted)) _rapierPaintWaterFinish(gesture);
	if (!saved) return;
	delete gesture.paintRollback;
	_rapierPaintDropNextSheet(saved.layer); _rapierPaintDropNextSheet(state.paintLayer);
	if (!cancel) { if (!saved.restored) saved.layer.surface?.endStroke(saved.pixels); if (saved.layer !== state.paintLayer) _rapierPaintReleaseSurface(saved.layer); return; }
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
	// The sheet the stroke began on goes back to its baseline in the painter (a sheet the cap's flip left behind was restored then).
	if (!saved.restored) layer.surface.endStroke(saved.pixels, true);
	Object.assign(layer, saved.props); layer.flipStroke = saved.previousStroke;
	state.paintLayer = layer; state.recipe = _rapierDrawRestoreRecipe(saved.recipe);
	state.undoStack = saved.undo; state.redoStack = saved.redo; state.view = saved.view;
	if (!layer.surface || layer.surface.gone || layer.surface.failure) return;
	layer.surface.display = reply => _rapierPaintDisplay(layer, reply);
	if (layer.gpuDisplay) { layer.displayReady = false; _rapierPaintShowLive(layer.liveWanted,layer); }
	else { layer.canvas.width = layer.surface.width; layer.canvas.height = layer.surface.height; }
	layer.liveBox = null;
	layer.mount = _rapierPaintMountLive(layer.canvas, layer.id);
	_rapierPaintPlaceLive(); _rapierPaintRepaintAll(layer);
	// Whether the baseline was wet is the painter's to say once the restore has run.
	layer.surface.sync().then(() => { if (state.paintLayer === layer && layer.surface?.wetState) _rapierPaintScheduleDry(layer); }, () => {});
}
function _rapierPaintOpenGestureLayer(evt, settings, geom) {
	if (settings.mode !== 'water') return _rapierPaintOpenLayer(undefined, null, null, null, settings.mode || 'paint');
	// Water simulates the whole reachable sheet from the first contact, at a resolution its material fits.
	// A sheet that grows under the hand reallocates every material plane and restarts the flow mid-stroke.
	let scale = _rapierPaintLayerScale();
	const nominal = _rapierPaintStageUnion(_rapierDrawState.recipe);
	while (scale > 1 && nominal.w * nominal.h * scale * scale > RAPIER_WATER_SHEET_PIXELS) scale--;
	const width = Math.max(1, Math.round(nominal.w * scale)), height = Math.max(1, Math.round(nominal.h * scale));
	if (globalThis.RapierDrawWater.waterHandSheetFits(width, height, 0, settings.definition.water?.tip)) return _rapierPaintOpenLayer(scale, null, nominal, null, 'water');
	const point = _rapierDrawMapPoint(evt.clientX, evt.clientY, geom.rect, geom.vb);
	const reach = Math.exp(settings.definition.settings[3].base + settings.radiusOffset) / RAPIER_PAINT_GRAIN * scale + RAPIER_PAINT_GROW_MARGIN;
	const x0 = Math.floor(point[0] * scale - reach), y0 = Math.floor(point[1] * scale - reach);
	const x1 = Math.ceil(point[0] * scale + reach + 1), y1 = Math.ceil(point[1] * scale + reach + 1);
	return _rapierPaintOpenLayer(scale, null, {x0:x0/scale, y0:y0/scale, w:(x1-x0)/scale, h:(y1-y0)/scale}, null, 'water');
}
async function _rapierPaintInitStroke(evt, gesture, settings, geom) {
	const state = _rapierDrawState, session = state.session;
	const gone = () => !state.open || state.session !== session || !!gesture.paint?.discarded;
	let layer = state.paintLayer, checkpoint = layer ? await _rapierPaintStrokeCheckpoint(gesture, layer) : false;
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
		checkpoint = await _rapierPaintStrokeCheckpoint(gesture, layer);
		if (checkpoint === 'gone' || gone()) return;
	}
	// The warm view is spent the instant a real gesture takes it: from here it is an ordinary layer.
	delete layer.warmView;
	layer.setPending = true;
	// Everything owed before this stroke is in the recipe: its Undo step starts from here (_rapierPaintEraseOneStep).
	if (gesture.trail && !('base' in gesture.trail)) { gesture.trail.base = _rapierDrawHistoryRecipe(); gesture.trail.top = state.undoStack.at(-1); }
	const id = settings.brushId, brush = _rapierPaintBrushFor(layer, id, settings);
	// A stroke's brush is the painter's until the stroke is released: a later sheet's close or a cap's flip must not let it go.
	brush.inStroke = true;
	const timing = _rapierDrawState.paintTiming;
	if (timing && !timing.brush) timing.brush = performance.now();
	// Wet on wet: this stroke enters the same still-wet field rather than waiting for it to dry.
	if (layer.dryRaf) { cancelAnimationFrame(layer.dryRaf); layer.dryRaf = 0; }
	// Placement is owned by opening, by growth and by a camera change; repeating it here wrote the
	// same attributes again on the frame the first dab is waiting for.
	_rapierPaintShowLive(true);
	brush.seed(settings.seed);
	brush.setColor(settings.color[0], settings.color[1], settings.color[2]);
	brush.setBaseValue('radius_logarithmic', layer.brushRadius + settings.radiusOffset);
	// SVG erasing stays a mathematical cut. Over a raster painting the same Eraser tool can feather
	// its dab edge, like a conventional image editor, without changing vector semantics. Zero is the
	// shipped eraser preset's original 0.72 hardness; 100 approaches a broad soft falloff.
	if (settings.erasing && settings.edgeSoftness > 0) brush.setBaseValue('hardness', 0.72 - 0.64 * _rapierDrawClamp(settings.edgeSoftness, 0, 1));
	brush.setHead(settings.held ?? null, settings.clear);
	brush.reset(); brush.newStroke();
	const p = _rapierPaintEventPoint(evt, geom, layer);
	const holdNeeded = layer.mode === 'water' || _rapierPaintHoldNeeded(brush);
	// This brush's own width decides how far it lands and lifts over -- in drawing units, since the
	// samples are, and the brush works at RAPIER_PAINT_GRAIN of them.
	const reach = Math.exp(layer.brushRadius + settings.radiusOffset) / RAPIER_PAINT_GRAIN;
	gesture.paint = { brush, last: p.t, clockOffset: performance.now() - p.t, x: p.x, y: p.y, tiltX: p.tiltX, tiltY: p.tiltY, twist: p.twist, geom, points: 0, brushId: id, scale: layer.scale, q: RAPIER_PAINT_SIM_START, pressure: 0, holdNeeded, pending: false, settings, reached: p.reach, rollback: gesture.paintRollback,
		// A WET brush holds back almost nothing. Its deposits carry water into the solver, so a held
		// tail lands all of that in one instant at the end: a synchronous burst of physics, and water
		// arriving at a time the hand never spent there. A wash's own bloom softens its end anyway --
		// wet media buy their lift from the physics, dry media from this queue.
		// The floors are ABSOLUTE and they matter more than the ratios: a hand lands and lifts over a
		// distance the HAND sets, not the brush. Scaled only by radius, Pen's lift came to 4.5 drawing
		// units -- shorter than the 14 units between two input samples -- so a thin brush had no room
		// for a taper to exist in, and measured 0.95 out where oil measured 0.41.
		travel: 0, tail: [], drawn: null, drained: false, reach, land: Math.max(RAPIER_PAINT_LAND_MIN, reach * RAPIER_PAINT_LAND),
		lift: brush.wet ? Math.max(1, reach * RAPIER_PAINT_LIFT_WET) : Math.max(RAPIER_PAINT_LIFT_MIN, reach * RAPIER_PAINT_LIFT * (settings.lift || 1)) };
	gesture.paint.inputKind = ['pen', 'touch', 'mouse'].includes(evt.pointerType) ? evt.pointerType : 'mouse';
	const pressure = gesture.paint.pressure = layer.mode === 'water' ? _rapierWaterPointerPressure(evt, gesture.paint.inputKind) : _rapierPaintPressure(evt, gesture.paint, p);
	const seat = pressure * RAPIER_PAINT_SEAT;
	// The seat dabs go straight to the brush, not through `_rapierPaintSample`, so they used to be the
	// one place paint was laid with no chance to grow the surface first -- a stroke STARTED on the
	// edge was clipped before the lift lag released its first sample. That is why the edge witness
	// flapped between a clean brush edge and an 86% wall on the same build: it depended on how much of
	// the mark was seat and how much was sampled.
	layer = _rapierPaintGrowToHold(layer, gesture.paint, p) || layer;
	if (layer.mode === 'water') brush.strokeTo(layer.surface, p.x * RAPIER_PAINT_GRAIN, p.y * RAPIER_PAINT_GRAIN, pressure, p.tiltX, p.tiltY, 1 / 60, 1, 0, p.twist, gesture.paint.inputKind, p.t);
	else {
		brush.strokeTo(layer.surface, p.x * RAPIER_PAINT_GRAIN, p.y * RAPIER_PAINT_GRAIN, seat, p.tiltX, p.tiltY, 0.0001, 1, 0, p.twist);
		brush.strokeTo(layer.surface, p.x * RAPIER_PAINT_GRAIN, p.y * RAPIER_PAINT_GRAIN, seat, p.tiltX, p.tiltY, 0.012, 1, 0, p.twist);
	}
	if (timing && !timing.seat) timing.seat = performance.now();
	gesture.paint.mouse = evt.pointerType === 'mouse'; _rapierPaintHeadAt(evt.clientX, evt.clientY);
	_rapierPaintScheduleBlit();
	if (holdNeeded) _rapierPaintScheduleHold(gesture);
}
// The stroke's own start, once its layer is ready (and after the barriers it owes): the checkpoint, the brush, the first dabs, and then
// the samples and the lift that arrived while it waited, in the order they came. Stale (a target, tool or document change since it was
// queued) discards silently rather than paint the wrong picture, with the exact settings and coordinate transform admitted back at queue
// time -- never whatever the strip, the clock or the screen currently read.
async function _rapierPaintApplyQueued(gesture, admitted = false) {
	if (gesture?.waterStroke && !admitted) return _rapierPaintWaterRun(gesture, () => _rapierPaintApplyQueued(gesture, true));
	const state = _rapierDrawState, paint = gesture?.paint;
	// A gesture that ended normally already nulled state.gesture (draw.js _rapierDrawEndGesture), so
	// that identity is never the staleness test; `discarded` (set by the same function on an actual
	// cancel -- a tool switch, Undo/Redo, a lost pointer -- or by a changed target below) and the
	// target/tool/document facts captured at queue time are.
	if (!paint?.pending || paint.discarded || !state.open || state.session !== paint.session || _rapierDrawTool() !== paint.tool) { if (gesture?.waterStroke) _rapierPaintWaterFinish(gesture); return; }
	const queued = paint;
	try {
		await _rapierPaintInitStroke(queued.downEvt, gesture, queued.settings, queued.geom);
		// The target's decode still owns this gesture, or it was cancelled while waiting.
		if (gesture.paint === queued || gesture.paint?.discarded) return;
		if (queued.moveEvents.length) _rapierPaintMove(queued.moveEvents, gesture);
		if (queued.ended) _rapierPaintEnd(queued.endEvt, gesture);
	} catch (error) { _rapierPaintStrokeFailed(gesture, error); throw error; }
}
// The target's decode failed, or its frame could not be resolved: paint the queued gesture onto a
// fresh blank layer rather than lose the samples -- a new, empty layer is still better than a
// dropped stroke, and it is exactly what painting on blank canvas already does. A material tool
// (the eraser, a smudge) works only the picture's own pixels, so without them it is discarded as
// a cancel is. This is a technical failure to read the target back, never a policy for a target
// that simply changed identity (see the dedicated discard where the rehydrate succeeds against a
// now-different shape, below).
function _rapierPaintQueueFallback(gesture) {
	const state = _rapierDrawState, paint = gesture?.paint;
	if (!paint?.pending || paint.discarded || !state.open || state.session !== paint.session || _rapierDrawTool() !== paint.tool) { if (gesture?.waterStroke) _rapierPaintWaterFinish(gesture); return; }
	if (_rapierPaintIsMaterialTool(paint.settings?.brushId)) {
		// Every admitted mark lands or is refused in words: a browser without a JPEG XL decoder reads no
		// finished painting back, and a tool that works its paint has nothing to work.
		_rapierPaintDiscardChangedTarget(gesture);
		showToast('This browser could not read this painting back, so the stroke was not applied. The painting is unchanged.', 'info');
		return;
	}
	_rapierPaintOpenLayer();
	return _rapierPaintApplyQueued(gesture).catch(() => {});
}
// One deliberate policy for a queued gesture whose target changed identity while its PNG decoded:
// discard the samples exactly as an explicit cancel would (the same `discarded` flag
// `_rapierDrawEndGesture` sets for a tool switch or Undo mid-decode), never paint them onto a
// surprise fresh layer -- that would put the person's touch on paint they never chose.
function _rapierPaintDiscardChangedTarget(gesture) {
	if (gesture?.waterStroke) _rapierPaintWaterFinish(gesture);
	const paint = gesture?.paint;
	if (!paint || paint.discarded) return;
	paint.discarded = true; paint.pending = false;
}
// A finished painting is lossless JPEG XL. Read through an <img> and a 2D canvas its colour arrives
// premultiplied and loses straight colour at low alpha, so the layer picked back up would not be the layer
// at Done; ImageDecoder without premultiplication gives the exact straight RGBA. Null where the browser's
// ImageDecoder does not read JPEG XL: the <img> path below reads it, or the stroke falls back.
async function _rapierPaintDecodeStraight(raster) {
	return globalThis.RapierDrawAgentPaint.decodeNativePaintJXL(raster);
}
// Decodes `target`'s own PNG back into a live surface -- the whole-canvas offset path for an
// untransformed target, the padded local-frame path (above) for a transformed one -- and, once it
// resolves, admits every gesture that was waiting on it (`waiters`; the ambient warm-up from
// `_rapierPaintWarmTarget` passes none). One decode in flight per exact target (id, raster, geom);
// a target that failed to decode is not retried. A new-document interruption (`state.session` moves
// on) or the target changing under a waiting gesture discards it instead of painting the wrong
// picture or a stale one.
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
	// Whether the gesture that is waiting works the MATERIAL: a clean sheet over a picture is a valid
	// layer for a brush and not for a tool, so the check below has to ask the same question
	// `_rapierPaintBegin` asked, or the decode finishes and hands the tool the empty sheet after all.
	const material = _rapierPaintIsMaterialTool(pendingGesture?.paint?.settings?.brushId, pendingGesture?.paint?.settings);
	const waiters = state.paintRehydrateWaiters = pendingGesture ? [pendingGesture] : [];
	const session = state.session, tool = _rapierDrawTool(), targetId = target.id;
	// The decode is done when its pixels are in hand; the adoption is done when the waiting strokes have been laid (the barrier a lift waits on).
	const decoded = () => { if (state.paintRehydrate === key) state.paintRehydrate = null; };
	const finished = task => { if (state.paintRehydrateTask === task) { state.paintRehydrateWaiters = null; state.paintRehydrateTask = null; } };
	// A painting kept in lossless pieces is ONE painting: picking any piece up reopens every piece of
	// its group into the one layer, at each piece's own place, and the commit retires the other
	// pieces (their pixels are then the layer's). Otherwise a stroke run from one piece into its
	// neighbour would land below the neighbour's opaque paint and vanish there. A transformed group
	// (a local frame) is rare and is picked up piece by piece.
	const simple = _rapierPaintFrameIsSimple(frame);
	const group = simple ? _rapierPaintGroupMembers(target, frame) : [];
	// What this decode's pixels are computed FROM, read once, now. Required to still hold below
	// before a single pixel is copied or an id is written down for retirement.
	const groupKey = _rapierPaintGroupKey(target, group);
	const load = async shape => {
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
			// The WHOLE material's dependency, not just the primary's. `loaded` below holds the sibling
			// objects and the sibling PIXELS as they were when the Images were requested, and
			// `layer.retire` is about to write their ids down for the commit to remove. A sibling replaced,
			// removed, added, moved, re-scaled or locked while those Images decoded leaves the primary's
			// own key untouched, so checking only that key would put the old pixels in and retire the
			// current id -- a new edit lost, or an explicit deletion undone by resurrection. The membership
			// is read again from the CURRENT recipe and must match what was captured, before a layer is
			// opened or a pixel is copied.
			if (_rapierPaintGroupKey(again, simple ? _rapierPaintGroupMembers(again, frame) : []) !== groupKey) {
				// Re-resolve from the current recipe with the gesture's own admitted settings -- the
				// samples are completed work and must land on the valid current material or be
				// explicitly refused, never silently vanish. `_rapierPaintRehydrateFor` re-reads the
				// membership as it now stands and decodes that; the waiters are still `pending`, so they
				// queue on it exactly as they queued on this one. One re-resolve per gesture: a recipe
				// changing faster than it decodes falls to the existing truthful changed-target outcome
				// rather than a decode storm. A WARM decode has no waiters and is simply abandoned --
				// nothing admitted anything, so there is nothing owed to anyone.
				let refused = false;
				for (const g of waiters) {
					if (g.paint && !g.paint.reresolved) { g.paint.reresolved = true; _rapierPaintRehydrateFor(again, g); }
					else {
						if (g.paint?.pending && !g.paint.discarded) refused = true;
						_rapierPaintDiscardChangedTarget(g);
					}
				}
				if (refused) showToast('Some strokes could not be added because the painting changed meanwhile.', 'error');
				// Adopt the retry after every waiter has joined it. Done, recovery and tool changes
				// already await this task; resolving between decodes lets them overtake a lifted stroke.
				return state.paintRehydrateTask;
			}
			// A valid layer already stands (a fresh one a failed decode fell back to, or this target's own
			// from an earlier pickup), or the tool moved on: the gestures that waited are still applied --
			// onto that layer, or discarded by their own tool check -- never dropped on the floor, so a
			// stroke that waited on a decode while a fallback opened a sheet is never lost.
			// A hardware eraser borrows this stroke, not the selected tool. A lift before decode completes
			// still needs the photo's material, even when the chosen tool is Select/Pen, or it would join
			// an ambient decode whose original request would accept a clean overlay.
			const erasing = waiters.some(g => g.eraseInk && g.paint?.pending && !g.paint.discarded && g.paint.tool === _rapierDrawTool());
			if (!(_rapierPaintToolPaints() || erasing) || _rapierPaintLayerValid(material || erasing, null, mode)) { await Promise.all(waiters.map(g => _rapierPaintApplyQueued(g).catch(() => {}))); return; }
			// The layer this one replaces settles first (its wash dried and kept, a refused stroke kept as Done keeps it); then everything above is read again.
			const closing = _rapierPaintCloseLayer();
			if (closing) { await closing; return adopt(loaded); }
			// Mount the live layer at the target's OWN current place in the scene order (`again.id`, the
			// shape being picked back up), not the default top -- a lower painting keeps painting under an
			// upper vector or an upper painting even while a stroke is down.
			const layer = simple ? _rapierPaintOpenLayer(frame.scale, again.id, mode === 'water' ? _rapierPaintWaterTargetUnion(again, frame, group) : null, null, mode) : _rapierPaintOpenLocalLayer(frame, again.id, mode);
			for (const { shape, image, pixels } of loaded) {
				let px = pixels;
				if (!px) {
				const canvas = document.createElement('canvas');
				canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
				const ctx = canvas.getContext('2d', { willReadFrequently: true });
				ctx.drawImage(image, 0, 0);
				px = ctx.getImageData(0, 0, canvas.width, canvas.height);
				}
				// The pixels go to the painter as one batch after the sheet's creation (ordered, transferred, never copied on the page).
				if (simple) {
					const f = shape === target ? frame : _rapierPaintTargetFrame(shape);
					const x0 = Math.round((f.c0[0] - (layer.origin?.[0] || 0)) * f.scale), y0 = Math.round((f.c0[1] - (layer.origin?.[1] || 0)) * f.scale);
					layer.surface.fromRGBA8(px.data, px.width, px.height, x0, y0);
				} else {
					layer.surface.fromRGBA8(px.data, px.width, px.height, layer.frame.pad, layer.frame.pad);
				}
			}
			// The overlay carries the picked-up pixels too, when the painter's reply to those pixels arrives, so the next stroke shows them under its dabs.
			layer.id = again.id; layer.raster = again.raster; layer.geom = JSON.stringify(again.geom); layer.brushId = again.paint?.brush || null;
			layer.paintReplay = again.paint?.replay ? _rapierDrawHistoryCopy(again.paint.replay) : null;
			layer.waterPaper = again.paint?.paper || layer.waterPaper;
			if (mode === 'water' && !globalThis.RapierDrawAgentPaint.waterPaintingIsLive(again, _rapierWaterSession())) {
				layer.paintReplay = {mode:'water',paper:layer.waterPaper,session:_rapierWaterSession(),baseRaster:again.raster,px:again.paint.px.slice(),scale:again.paint.scale,entries:[]};
			}
			else if(mode==='water' && !group.length)layer.waterMaterial={replay:_rapierDrawHistoryCopy(layer.paintReplay),session:_rapierWaterSession()};
			layer.retire = group.map(shape => shape.id);
			await Promise.all(waiters.map(g => _rapierPaintApplyQueued(g).catch(() => {})));
		} catch (error) { state.paintRehydrateFailed = key; try { _rapierPaintCloseLayer(); } catch (_) {}
			if (target.paint?.mode === 'water') { for (const g of waiters) _rapierPaintDiscardChangedTarget(g); showToast('This Water layer could not be reopened: ' + String(error.message || error), 'error'); }
			else for (const g of waiters) _rapierPaintQueueFallback(g); }
	};
	task = state.paintRehydrateTask = Promise.all([_rapierPaintStartPainter(mode), load(target), ...group.map(load)]).then(([, ...loaded]) => { decoded(); return adopt(loaded); }, error => {
		decoded(); state.paintRehydrateFailed = key;
		if (mode === 'water') { for (const g of waiters) _rapierPaintDiscardChangedTarget(g); showToast('This Water layer could not be reopened: ' + String(error.message || error), 'error'); }
		else for (const g of waiters) _rapierPaintQueueFallback(g);
	}).finally(() => finished(task));
}
// A lifted finger is completed work even while its target image is still decoding. Keep the
// existing decode as the barrier for Done, recovery and tool changes, not a second sample queue.
function _rapierPaintPendingStroke(finishWet = false) {
	// An erase still reaching the other paintings under its path is owed first: Done, a tool change and a backup wait on it.
	return _rapierDrawState.waterAction || _rapierDrawState.paintEraseFan?.promise || _rapierPaintPendingStrokeOwed(finishWet);
}
function _rapierPaintPendingStrokeOwed(finishWet = false) {
	const state = _rapierDrawState;
	const water = _rapierPaintWaterPending();
	if (water) {
		if (finishWet || (typeof document !== 'undefined' && document.hidden)) for (const layer of _rapierPaintRevisionLayers()) {
			_rapierPaintDropSnapshots(layer); layer.surface?.finishWetWork?.();
			if (layer.pendingLift) _rapierPaintWakeLift(layer, layer.pendingLift);
		}
		return water;
	}
	for (const layer of _rapierPaintRevisionLayers()) {
		const surface = layer.surface;
		// Pagehide and native pause can stop animation frames. Their urgent checkpoint finishes
		// only an already accepted operation; a visible routine backup awaits its bounded driver.
		if (finishWet || (typeof document !== 'undefined' && document.hidden)) { _rapierPaintDropSnapshots(layer); surface?.finishWetWork?.(); }
		// Everything asked of the painter for this sheet has run, and the held operation (if any) is at its boundary.
		if (surface && !surface.settled && !surface.failure) return surface.sync().then(() => {}, () => {});
		if (surface?._wetWork) return new Promise(ok => (layer.wetWaiters = layer.wetWaiters || []).push(ok));
		if (layer.pendingCommit) return layer.pendingCommit.promise;
		if (layer.pendingLift) {
			// Recovery also runs while the page is hidden, when animation frames can stop. Its
			// existing wait starts the same deferred owner without depending on another frame.
			_rapierPaintWakeLift(layer, layer.pendingLift);
			return layer.pendingLift.promise;
		}
	}
	return state.paintRehydrateWaiters?.some(g => g.paint?.pending && g.paint.ended && !g.paint.discarded)
		? state.paintRehydrateTask : null;
}
// ---- One erase, every painting under it ------------------------------------------------------------------------------------
// A stroke works ONE painting, the chosen one or the topmost, but a drawing can hold several paintings (SET opens a new one over
// the picture it made; a reopened drawing keeps its paintings apart). An eraser removes what the person sees under it, whatever
// painting, layer or piece it sits in. The gesture works its own target as always, live under the finger; when it lifts, the
// same rub is laid on each other painting the path reaches, one after another through the ordinary gesture (decode, erase,
// publish), and the steps it made become one Undo. The main Eraser's cut through lines follows the paintings in the same step.
function _rapierPaintShapeBox(shape) {
	const f = _rapierPaintTargetFrame(shape);
	if (!f) return null;
	const xs = [], ys = [];
	for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { xs.push(f.c0[0] + a * f.eux * f.pw + b * f.evx * f.ph); ys.push(f.c0[1] + a * f.euy * f.pw + b * f.evy * f.ph); }
	return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
// How far from its path an erase reaches, in drawing units.
function _rapierPaintEraseReach(settings) {
	try { return 1.5 * Math.exp((settings.definition || _rapierPaintDefFor(settings.brushId)).settings[3].base + settings.radiusOffset) / RAPIER_PAINT_GRAIN + 2; } catch (_) { return 64; }
}
// A stroke's own lift has happened and everything it owed the recipe has landed (or it was discarded: false).
async function _rapierPaintSettled(gesture, alive) {
	for (let waited = 0; ; waited += 16) {
		const paint = gesture.paint;
		if (!alive() || !paint || paint.discarded) return false;
		if (paint.lifted) break;
		if (waited > 120000) return false;
		await new Promise(ok => setTimeout(ok, 16));
	}
	// A turn of the page's own loop between looks, and a bound: an owed promise that is always already settled must never spin the page.
	const end = Date.now() + 60000;
	for (;;) {
		const owed = _rapierPaintPendingStrokeOwed() || _rapierPaintFlushRevision();
		if (!owed) return alive();
		await Promise.race([owed, new Promise(ok => setTimeout(ok, 50))]);
		if (!alive() || Date.now() > end) return false;
		await new Promise(ok => setTimeout(ok, 16));
	}
}
// Whether an erase stroke has anything beyond its own target to reach.
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
	// The main Eraser cuts lines as it always did; paintings are the paint's own part of the same stroke.
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
			// A piece a neighbour's pick-up already took in is not a painting of its own any more.
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
// The steps one erase stroke made are one step of history: Undo takes the whole rub back, Redo lays it again.
function _rapierPaintEraseOneStep(trail) {
	const state = _rapierDrawState, stack = state.undoStack, at = trail.top ? stack.lastIndexOf(trail.top) : -1;
	if (trail.top && at < 0) return;
	const mine = stack.slice(at + 1);
	if (mine.length < 2 || !trail.base || mine.some(entry => entry.agent)) return;
	const entry = _rapierDrawHistoryDelta({ ...trail.base.recipe, fonts: trail.base.fonts }, state.recipe);
	entry.selection = (trail.base.selection || []).slice();
	const shift = mine.reduce((sum, row) => row.shift ? { dx: sum.dx + row.shift.dx, dy: sum.dy + row.shift.dy } : sum, { dx: 0, dy: 0 });
	if (shift.dx || shift.dy) entry.shift = shift;
	state.undoStack = stack.slice(0, at + 1).concat(entry);
	_rapierDrawRenderHistory();
}
// Establishes the gesture's target and generation before admitting it: rather than open an empty
// layer under a fast stroke while the real target is still decoding, the gesture's samples are
// buffered on `gesture.paint` and replayed once `_rapierPaintRehydrateFor` resolves (or falls
// back). `settings` and `geom` are the immutable record, admitted by the caller the instant the
// gesture began -- identical to what the fast synchronous path admits below, just carried through
// the wait instead of being read again on the other side of it.
function _rapierPaintQueueGesture(target, evt, gesture, settings, geom) {
	const state = _rapierDrawState;
	// The stroke's own record (the samples that arrived while it waited are on it) is the queue: it joins the decode, never starts another.
	const paint = gesture.paint?.pending && !gesture.paint.discarded ? gesture.paint
		: (gesture.paint = { pending: true, session: state.session, tool: _rapierDrawTool(), settings, geom, downEvt: evt, moveEvents: [], ended: false, endEvt: null });
	paint.targetId = target.id;
	_rapierPaintRehydrateFor(target, gesture);
}
// Each admitted Water gesture keeps its existing input record and owns material until its lift
// publishes. A later queued start cannot borrow its lift token or reset its brush/history head.
function _rapierPaintWaterPending() {
	// One authority barrier owes the complete lifted prefix, including gestures not started yet.
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
	// Waiting also owns this receipt: cancelling a middle gesture must still wait for its
	// predecessor, or the following gesture could overtake that predecessor's material.
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
	// The first dab's own clock (a measurement): when the stroke began, when its layer stood, when
	// its brush was ready, when the seat was laid, when the first frame showed it. Read through
	// rapierPaintFacts.timing by interaction-budgets and paint-first-dab-stages; costs five
	// timestamps.
	const timing = _rapierDrawState.paintTiming = { begin: performance.now(), layer: 0, brush: 0, seat: 0, blit: 0, opened: false };
	// Admitted once, here, for the whole of the stroke: its brush, colour, size and strength, and the screen it lands on. The stroke then
	// waits on whatever it owes (the painter, the previous stroke's revisions, a drying wash, its target's decode) as a queued gesture
	// does: its samples and its lift are held on this record, in order, and laid when the stroke starts.
	const settings = _rapierPaintAdmitSettings(gesture.eraseInk, gesture.tool), geom = _rapierDrawPointerGeometry();
	// An eraser keeps the path it was swept along, so the same rub can be laid on every other painting under it (_rapierPaintEraseFan).
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
	// The first stroke waits for the painter; the next ones find it ready.
	if (!_rapierPaintRemoteNow(settings.mode || 'paint')) { await _rapierPaintStartPainter(settings.mode || 'paint'); if (!live()) return; }
	// Resolve a new gesture's target after earlier cap sheets have reached the recipe. Otherwise a
	// material tool on the clean sheet could start decoding the picture from before that flip.
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
		// The sheet this one replaces settles first (a stroke the budget refused is kept, a wash dried), as closing a layer always owes.
		const closing = _rapierPaintCloseLayer();
		if (closing) { await closing; if (!live()) return; }
		_rapierPaintOpenGestureLayer(evt, settings, geom);
		timing.opened = true;
	}
	timing.layer = performance.now();
	// The authority changes before any paint is laid; the chrome that shows it -- the handles and the
	// element menu -- follows the first mark rather than delaying it.
	const selected = _rapierDrawSelection().length;
	if (selected) _rapierDrawSetSelection([]);
	await _rapierPaintApplyQueued(gesture);
	if (selected) _rapierPaintAfterFrame(() => { _rapierDrawMarkSelection(); _rapierDrawUpdateMenu(); });
}
// The landing is knowable as it happens; the lift is not, so `_rapierPaintMove` holds the newest
// RAPIER_PAINT_LIFT radii of travel back and `_rapierPaintEnd` draws them with the load falling to
// nothing. The mark trails the hand by a fraction of one brush width -- about 11 drawing units for
// the default oil -- and gains a tail that a mark ending at full width never had.
// The surface GROWS to hold the stroke; it never clips it. Paint is pixels, so the edge is real,
// and any region guessed in advance (the whole window, a pad, the stage union) can be outrun by a
// finger. So the region follows the hand, one lossless reallocation at a time (`PaintSurface.grow`,
// which copies every pixel and keeps the paper's grain anchored under it).
//
// A transformed target grows on the same native pixel grid. Moving that grid's origin through its
// affine basis keeps every retained pixel at the same world point; rotation is never resampling.
const RAPIER_PAINT_GROW_MARGIN = 96;
function _rapierPaintGrowthAt(layer, paint, p) {
	// A Water sheet already covers the reachable window; it grows only for a contact beyond it, never for the brush's halo.
	const surface = layer.surface, k = layer.scale, reach = layer.mode === 'water' ? 0 : (paint?.reach || 0) * k + RAPIER_PAINT_GROW_MARGIN;
	const x = p.x * k, y = p.y * k;
	const left = Math.max(0, Math.ceil(reach - x)), top = Math.max(0, Math.ceil(reach - y));
	const right = Math.max(0, Math.ceil(x + reach - (surface.width - 1))), bottom = Math.max(0, Math.ceil(y + reach - (surface.height - 1)));
	if (!(left || top || right || bottom)) return null;
	const quantise = globalThis.RapierDrawPaint.paintGrowStep;
	const L = quantise ? quantise(left) : left, T = quantise ? quantise(top) : top, R = quantise ? quantise(right) : right, B = quantise ? quantise(bottom) : bottom;
	return (surface.width + L + R) * (surface.height + T + B) > RAPIER_PAINT_AREA_MAX * 2
		? {left, top, right, bottom} : {left: L, top: T, right: R, bottom: B};
}
// This is the cap's exact empty footprint, on the old sheet's integer grid. Keeping it shared
// with preparation means a ready allocation can never narrow the triggering segment.
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
	// Only the dense sheet approaching its cap earns this extra blank display allocation. It owns no
	// world coordinates yet; scale, grain and the exact footprint are admitted at the actual flip. (The
	// painter's own sheet is made at the flip, in the painter, off this thread.)
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
// Returns the layer the sample should be painted on: the same one, grown to hold it, or -- at the
// memory cap -- the fresh sheet the stroke carries on over (`_rapierPaintFlipAtCap`).
function _rapierPaintGrowToHold(layer, paint, p) {
	if (!layer?.surface) return layer;
	const surface = layer.surface, k = layer.scale;
	_rapierPaintPrepareNextSheet(layer, paint, p);
	// Where this sample reaches, in surface pixels: the brush's own half-width plus a margin, so a
	// hand running along an edge grows in strides rather than on every single dab.
	const growth = _rapierPaintGrowthAt(layer, paint, p);
	if (!growth) return layer;
	const {left: L, top: T, right: R, bottom: B} = growth;
	const w = surface.width + L + R, h = surface.height + T + B;
	if (w * h > RAPIER_PAINT_AREA_MAX * 2) {
		if (layer.mode === 'water') throw Object.assign(new Error('This Water layer cannot grow further. Set it and paint on a new layer.'), {code:'WATER_BUDGET',recoverable:true});
		return _rapierPaintFlipAtCap(layer, paint, p);
	}
	// The painter grows the sheet (a lossless reallocation, off this thread); the page's mirror takes the new shape at once and the overlay
	// follows with the painter's whole readout in the reply.
	const { dx, dy } = surface.grow(L, T, R, B);
	if (paint && layer.frame) paint.reached = true;
	if (!(dx || dy)) return layer;
	// The buffer moved under the paint, so everything that names a point in LAYER coordinates moves
	// with it: the origin (which is how future events are mapped), the hand's own running position,
	// every sample the lift lag is still holding -- those were mapped through the old origin -- and
	// the brush's own memory of where it last laid a dab (without that last one the brush sees the
	// hand standing still for as long as growth keeps pace with it, and lays nothing).
	const ux = dx / k, uy = dy / k;
	if (layer.origin) { layer.origin[0] -= ux; layer.origin[1] -= uy; }
	if (layer.frame) {
		const f = layer.frame;
		f.c0 = [f.c0[0] - dx * f.eux - dy * f.evx, f.c0[1] - dx * f.euy - dy * f.evy];
	}
	if (paint) {
		paint.brush?.rebase?.(ux * RAPIER_PAINT_GRAIN, uy * RAPIER_PAINT_GRAIN);
	}
	// At lift the current sample is still in tail, and drawn may name a tail sample too.
	const points = new Set([p]);
	if (paint) { points.add(paint); for (const s of paint.tail) points.add(s.p); if (paint.drawn) points.add(paint.drawn.p); }
	for (const q of points) { q.x += ux; q.y += uy; }
	return layer;
}
// The surface has met the one hard stop, memory: growing to hold this sample would pass
// RAPIER_PAINT_AREA_MAX * 2 (at a phone's pixel density the whole window is already millions of
// pixels, and a canvas that has grown to hold strokes off three edges holds a surface near the cap
// before the fourth begins). The person's work is never deleted and never stopped, so instead of a
// clipped mark (the automatic Set): the painting so far is captured for the worker, and the stroke
// carries on over it on a fresh sheet at the current layer's scale -- the brush carried across with
// everything it remembers (its position, its smudge, its load), the hand's running position and every
// held sample carried as world coordinates. Its picture publishes in order with the other sheets of
// this same stroke, and any canvas growth moves the pending geometry too. Said once, in a toast.
// Returns the layer the stroke continues on; the old one if the flip cannot happen now (a settle
// already in flight), in which case the sample is clipped.
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
		// The settle, the box and the capture of the departing sheet are the painter's, in its order after every dab the sheet owns (a sheet
		// that turns out to hold nothing publishes nothing); the stroke carries on over the clean sheet at once.
		layer.surface.settleWet();
		for (const key of ['raf', 'holdRaf', 'dryRaf']) { if (layer[key]) cancelAnimationFrame(layer[key]); layer[key] = 0; }
		layer.dryBox = null;
		// Closing the view would flush its encoder. Detach it instead: its overlay stays underneath
		// the clean sheet until the immutable revision owns a picture, then its view can be released.
		state.paintLayer = null;
		let fresh, o;
		if (frame) {
			// Keep the brush in its native affine basis across Set. The new sheet begins under the
			// hand on an integer pixel, so its grain and held samples need only the existing rebase.
			const x = Math.floor(p.x * layer.scale), y = Math.floor(p.y * layer.scale);
			fresh = _rapierPaintOpenLocalLayer({ ...frame, pw: 1, ph: 1, c0: [frame.c0[0] + x * frame.eux + y * frame.evx, frame.c0[1] + x * frame.euy + y * frame.evy] });
			o = [(x - fresh.frame.pad) / layer.scale, (y - fresh.frame.pad) / layer.scale];
			fresh.surface.set('toothOX', layer.surface.toothOX + (o[0] - origin[0]) * layer.scale);
			fresh.surface.set('toothOY', layer.surface.toothOY + (o[1] - origin[1]) * layer.scale);
		} else {
			// The old picture has not published or grown the scene yet. Start this blank sheet at the
			// hand, at the current scale and on the same pixel grid. Include the preceding drawn point
			// so an ordinary coalesced segment fits too; a remote jump still gets its own finite sheet.
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
		fresh.previousFlip = layer; layer.nextFlip = fresh;
		paint.brush?.rebase?.((origin[0] - o[0]) * RAPIER_PAINT_GRAIN, (origin[1] - o[1]) * RAPIER_PAINT_GRAIN);
		paint.scale = fresh.scale;
		// A sheet the stroke still holds for its rollback keeps its painter surface and is put back to its baseline once it has been read; any
		// other is let go once read. The readout is asked first: the painter answers in order, so it sees the sheet as the stroke left it.
		const holding = paint.rollback?.layer === layer && !paint.rollback.restored;
		_rapierPaintEncodeRevision(layer, true, {retire: true, release: !holding, compressor: true});
		if (holding) { layer.surface.endStroke(paint.rollback.pixels, true); paint.rollback.restored = true; }
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
// The picture a flip set is the worker's working PNG at first; its JPEG XL is written the moment
// the encoder is done, in place and without a history step (exactly as
// Done would write it), unless the shape has changed or gone meanwhile -- an Undo across the flip
// puts the earlier picture back, and that one is not touched.
async function _rapierPaintEncodeShapeLater(shapeId, was, captured = null, stroke = null) {
	const state = _rapierDrawState, session = state.session;
	const encodes = state.paintEncodes || (state.paintEncodes = new Map());
	// The wait is shown behind the progress popup once it passes a moment (editor/pop.js).
	const notice = typeof _rapierProgressOpen === 'function' ? _rapierProgressOpen({label: 'Finishing at full quality', after: 1500}) : null;
	const work = notice ? {progress: fraction => notice.set(fraction)} : null;
	let task;
	try {
		if (typeof _rapierDefaultImageProfile === 'function' && _rapierDefaultImageProfile() !== 'jxl') return;
		task = (async () => {
			// Register custody now, including for recovery, but let input run between the display's
			// publication and handing these same immutable channels to the final codec.
			await new Promise(ok => _rapierPaintTask(ok));
			const pixels = captured || await _rapierPaintPNG.decode(was), surface = pixels ? _rapierPaintPixelsSurface(pixels) : null;
			const canvas = surface ? null : await _rapierPaintRasterCanvas(was), source = surface || canvas;
			const encode = async box => {
				if (!surface) return _rapierPaintEncodeCanvasBox(canvas, box, {lossless: true});
				const out = await _rapierPaintEncodeJXL(surface, box, {lossless: true}, work);
				return {...out, shown: await _rapierPaintShownFor(surface, box)};
			};
			// A Water painting is never cut: where its JPEG XL does not fit one picture the PNG stays for Done to answer.
			return _rapierPaintLosslessPieces(encode, {x0: 0, y0: 0, x1: source.width - 1, y1: source.height - 1}, _rapierPaintRasterBudget(), 0, _rapierDrawShapeById(shapeId)?.paint?.mode === 'water');
		})();
		encodes.set(was, task);
		const pieces = await task.finally(() => notice?.end());
		if (!pieces || !state.open || state.session !== session) return;
		const shape = _rapierDrawShapeById(shapeId);
		if (!shape || shape.raster !== was) return;
		// A later stroke owns a different history head. Its file keep can finish this representation;
		// this codec result must not reach backwards into the newer stroke's history or an Undo branch.
		if (stroke && stroke.entry !== state.undoStack.at(-1)) return;
		if (stroke) _rapierDrawSnapshot(undefined, true);
		_rapierPaintKeepShown(pieces);
		if (pieces.length === 1) { shape.raster = pieces[0].url; _rapierDrawRenderShapes([shape.id]); }
		else if (_rapierPaintSplitShapeSync(state.recipe.shapes, shape, pieces)) _rapierDrawRenderAll();
		if (stroke) stroke.entry = _rapierDrawSealHistory();
		// The history now owns the final codec too; its large interim display key can be released.
		if (captured) _rapierPaintShownAs.delete(was);
		_rapierPaintReattachLive();
	} catch (error) { console.warn('[rapier] paint flip encode', error); }
	finally { notice?.end(); if (encodes.get(was) === task) encodes.delete(was); }
}
// Resizing a <canvas> CLEARS it, and the live blit only paints the dirty box -- so after a grow
// the next frame would show the new dab on a blank sheet with every earlier stroke gone until the
// commit. The overlay follows the surface it grew, in the SAME turn: a scheduled blit would still
// leave one blank frame on screen.
// Marking the WHOLE surface dirty and converting every float pixel back to bytes -- relief and all
// -- synchronously, at the moment the hand crosses the edge, costs about 27.5 ms for a 927x356
// painting and scales with the painting. The overlay already HOLDS those bytes: growth moves the
// paint to a new address, it does not change it. So the pixels are carried to their new place with
// one canvas copy (premultiplied to premultiplied, exact -- nothing is unpremultiplied and
// re-rounded on the way), and only the work the surface still owes -- the dabs painted since the
// last blit, whose box `grow` has already translated -- is converted. The new margins are
// transparent on both sides, so they need nothing.
function _rapierPaintSample(paint, layer, s, lift) {
	// The live layer, not the one the caller captured: a flip at the cap may have replaced it.
	layer = _rapierPaintLayer() || layer;
	layer = _rapierPaintGrowToHold(layer, paint, s.p) || layer;
	const land = RAPIER_PAINT_TOUCH_FLOOR + (1 - RAPIER_PAINT_TOUCH_FLOOR) * _rapierPaintSmooth(_rapierDrawClamp(s.at / paint.land, 0, 1));
	paint.brush.strokeTo(layer.surface, s.p.x * RAPIER_PAINT_GRAIN, s.p.y * RAPIER_PAINT_GRAIN, s.press * land * lift, s.p.tiltX, s.p.tiltY, s.dt, 1, 0, s.p.twist);
	// Where the MARK now ends, which is behind the hand by the lift lag. The held tick paints here,
	// never at the live finger: one monotonic stream reaches the brush, and a dwell cannot jump the
	// applicator forward past samples still queued behind it.
	paint.drawn = s;
}
function _rapierPaintMove(events, gesture) {
	let layer = _rapierPaintLayer();
	const paint = gesture.paint;
	if (!paint || paint.discarded) return;
	if (paint.pending) { paint.moveEvents.push(...events); return; }
	if (!layer) return;
	for (const sample of events) {
		layer = _rapierPaintLayer() || layer; // a flip at the cap, draining the samples below, moves the stroke to a fresh sheet
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
		// Drained by DISTANCE (the lift lag) and by COUNT. The count bound is what a still hand needs:
		// travel stops advancing, so the distance rule never fires, and a 240 Hz panel held for a minute
		// would otherwise retain every sample of it. Paint held back is paint not yet laid; past the
		// bound it is laid, at full weight, in order.
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
	// The taper is the tail's OWN span, not a fixed lift distance: a flick shorter than one lift
	// would otherwise arrive with every sample below full weight, so the whole mark would be a lift
	// with no body at all. And a stroke so short that the lag never released anything keeps its first
	// held sample at full weight -- that sample IS the body.
	const span = Math.max(1e-4, Math.min(paint.lift, end - (paint.tail.length ? paint.tail[0].at : end)));
	paint.tail.forEach((s, i) => _rapierPaintSample(paint, layer, s,
		i === 0 && !paint.drained ? 1 : _rapierPaintSmooth(_rapierDrawClamp((end - s.at) / span, 0, 1))));
	paint.tail.length = 0;
	_rapierPaintReleaseStroke(gesture);
	// The layer the stroke ENDS on: draining the tail may have flipped the sheet at the cap.
	const ended = _rapierPaintLayer() || layer;
	// A completed wet stroke changes the picture before its later drying commit.
	ended.paintVersion = (ended.paintVersion || 0) + 1;
	// A blocked growth can still leave every sample beyond the target. Name that refusal; a
	// successful extension has already marked the stroke reached in _rapierPaintGrowToHold.
	if (ended.frame && !paint.reached) { _rapierPaintRefuseUnreached(); return; }
	// Whether the paper is wet is the painter's to say, and the whole stroke is in its queue: the lift holds the layer until it has.
	const held = _rapierPaintLiftHold(ended);
	_rapierPaintScheduleBlit();
	ended.surface.sync().then(() => _rapierPaintEndDecide(ended, held), () => { if (ended.pendingLift === held) ended.pendingLift = null; held.decide(); held.resolve(); });
}
// A Water lift publishes its own Undo step while material remains wet. Paint's wet wash keeps
// its existing settlement boundary; a dry Paint stroke is committed at the next frame.
function _rapierPaintEndDecide(layer, held) {
	if (layer.pendingLift !== held) { held.decide(); return; }
	if (layer.mode === 'water') {
		// A lifted Water gesture owns one history step immediately. The GPU remains wet;
		// subsequent drying amends this gesture until the next gesture takes its checkpoint.
		layer.flipStroke ||= {entry:null};
		const job = _rapierPaintEncodeRevision(layer);
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
// The exact held tail belongs to pointer-up. Readout, encoding and recipe/history publication
// follow its next frame. Until then this token owns the completed surface: every existing
// authority barrier drains it before a new stroke, Undo, close or recovery can overtake it.
// The exact held tail belongs to pointer-up. Readout, encoding and recipe/history publication
// follow its next frame. Until then this token owns the completed surface: every existing
// authority barrier drains it before a new stroke, Undo, close or recovery can overtake it.
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
		catch (error) { layer.pendingOverflow = true; showToast('The painting could not be kept. It is still open: ' + String(error?.message || error), 'error'); }
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
// The sibling of `_rapierPaintDiscardOverflow` for the opposite failure: not too many pixels to
// keep, but no pixel ever reachable at all (every admitted mark survives or is explicitly refused)
// -- a stroke beyond a transformed target whose growth could not run. The same toast shape, never
// a new dialog, never a hint.
function _rapierPaintRefuseUnreached() {
	showToast('That stroke landed off the painting -- nothing to paint on there', 'info');
}
// The closing settlement for a live layer holding pixels the working PNG budget refused: KEEP them.
// Every path that ends the layer's life without the person having asked for it gone -- Done and
// Back (draw.js `_rapierDrawFinish`), a tool change (`_rapierDrawSetTool`), closing Draw
// (`_rapierDrawClose`) -- calls this, so the work reaches the recipe and then the file as JPEG XL
// (`_rapierPaintKeepAsJXL`). Only a deliberate Undo discards, and it names itself.
function _rapierPaintSettleOverflow() {
	const layer = _rapierDrawState.paintLayer;
	// A stroke still drying belongs to the picture too.
	return _rapierPaintAfter(_rapierPaintFlushWet(), () => {
		if (!layer?.pendingOverflow) return false;
		// `keep` is the closing path and the budget may not refuse it (the law above _rapierPaintCommit's
		// own refusal): the pixels land in the recipe as the working PNG here, and Done rewrites every
		// painting as JPEG XL before the file is built.
		const kept = _rapierPaintCommit(true);
		return kept ? kept.then(() => true) : true;
	});
}
function _rapierPaintDiscardOverflow() {
	const state = _rapierDrawState, layer = state.paintLayer;
	// Called first by Undo, a tool change, Done/Back, the canvas following the stage and closing
	// Draw: a stroke still drying is committed here rather than silently lost. Undo then pops it
	// from history the way it pops any other stroke.
	return _rapierPaintAfter(_rapierPaintFlushWet(), () => {
		if (!layer?.pendingOverflow) return false;
		// While the automatic Set is settling this very painting, Undo discards nothing: the settle lands
		// the strokes as one history step in a moment, and Undo then takes that step back the way it takes
		// any other, with Redo able to return it. Discarding here would close the layer under the encoder:
		// every stroke since the one that crossed the budget gone, Redo empty.
		if (state.paintSetting) { showToast('Keeping the painting first. Undo is back in a moment.', 'info'); return true; }
		// A person asked for this, so the closing guard must NOT quietly commit it back. That guard
		// exists for view events; this is a choice.
		const was = _rapierDrawState.paintClosing;
		_rapierDrawState.paintClosing = true;
		let closed;
		try { closed = _rapierPaintCloseLayer(); } finally { if (!closed) _rapierDrawState.paintClosing = was; }
		const finish = () => { _rapierPaintSyncPaper(); showToast('Discarded the painting that was too large to keep', 'info'); return true; };
		return closed ? closed.then(finish).finally(() => { _rapierDrawState.paintClosing = was; }) : finish();
	});
}
// Writes the layer into the recipe: crop to painted pixels, one PNG, one `paint` shape (new, or
// the layer's own replaced in place), one history step. A transformed target's geometry is written
// back as its own new four corners (`layer.frame`), computed from the SAME affine map the stroke
// was painted through, so its position, rotation and scale survive exactly; a simple
// (untransformed) layer keeps the plain cx/cy/w/h form.
// A picture of the live layer as the shape it would become, for the backup: the same geometry
// _rapierPaintCommit computes, the pixels as the working PNG; the recipe is untouched, and a layer
// with nothing on it is nothing. A suspended material pass completes before the read; an
// intermediate reconstruction never becomes a recovery picture.
function _rapierPaintMetadata(layer, brush, width, height, scale, replay) {
	return {brush, px:[width,height], scale, ...(layer.mode === 'water' ? {mode:'water',paper:replay?.entries.at(-1)?.sheet?.waterFrame?.paper || layer.waterPaper || 'cold-press'} : {}), ...(replay ? {replay} : {})};
}
function _rapierPaintWaterReplay(layer, capture, box, sheet = layer.surface.waterSheet()) {
	if (!capture) return layer.paintReplay || null;
	return globalThis.RapierDrawAgentPaint.waterReplayAt(layer.paintReplay, capture, box, {raster:null,px:[sheet.width,sheet.height],scale:layer.scale,sheet});
}
function _rapierPaintReplayAt(layer, records, box) {
	if (!layer.paintReplay) return null;
	const replay = _rapierDrawHistoryCopy(layer.paintReplay);
	for (const record of records || []) if (box && record.commands.some(command => command.target === 'stroke')) {
		const entry = {..._rapierDrawHistoryCopy(record), crop: record.crop || [box.x0, box.y0, box.x1, box.y1]};
		const at = replay.entries.findIndex(row => row.id === entry.id);
		if (at < 0) replay.entries.push(entry); else replay.entries[at] = entry;
	}
	// A history is kept while the document's material budget admits it (draw/paint-history.mjs). Past it, the history is
	// dropped and recording stops: the painting keeps its raster and goes on taking strokes, and a selective Undo of one
	// of them refuses, as it does for a painting that never recorded. Nothing the person painted is refused for its history.
	if (!globalThis.RapierDrawAgentPaint.paintReplayFits(replay)) { layer.paintReplay = null; return null; }
	return replay;
}
function _rapierPaintLayerSnapshot(defer = false) {
	const layer = _rapierPaintLayer(); if (!layer || !layer.surface) return null;
	if (!defer) _rapierPaintDropSnapshots(layer);
	const surface = layer.surface;
	// A suspended material pass completes before the read (the urgent path); on the routine path only an operation already finished is
	// read. An intermediate reconstruction never becomes a recovery picture.
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
	// A settled stroke already owns this exact encode. A live wash is read without settling it;
	// its checkpoint preserves the visible straight RGBA without altering the material's physics.
	const cached = layer.checkpoint?.revision === surface.revision;
	const replay = _rapierPaintReplayAt(layer, layer.surface.peekReplay(), box);
	const snapshot = { id: layer.id != null ? layer.id : null, geom, raster: cached ? layer.checkpoint.raster : null, encode: null, paint: _rapierPaintMetadata(layer, layer.brushId, pw, ph, s, replay), retire: layer.retire?.slice() };
	if (cached) return snapshot;
	// A routine backup fixes the material revision and geometry before its IO ticket yields. Its pixels are read at this point of the painter's
	// order, and only while that revision is still held; a later stroke makes the attempt retry. The existing worker compresses the captured
	// bytes. Without workers, retain the exact codec fallback; urgent close always keeps the stored form.
	if (!defer) return surface.readRGBA8(box).then(px => { snapshot.raster = _rapierPaintPixelsToDataURL(px); return snapshot; });
	const owner = _rapierPaintWorker(layer), held = {surface, box, revision: surface.revision, session: _rapierDrawState.session, width: surface.width, height: surface.height};
	if (owner) snapshot.encode = _rapierPaintCaptureSnapshot(layer, owner, held);
	else { const pixels = surface.readRGBA8(box); snapshot.encode = () => pixels.then(px => _rapierPaintPNG.compressed(px).catch(() => _rapierPaintPNG.encode(px))); }
	return snapshot;
}
// Writes the layer into the recipe: crop to painted pixels, one PNG, one `paint` shape (new, or the
// layer's own replaced in place), one history step. A transformed target's geometry is written back
// as its own new four corners (`layer.frame`), computed from the SAME affine map the stroke was
// painted through, so its position, rotation and scale survive exactly; a simple (untransformed)
// layer keeps the plain cx/cy/w/h form.
// The picture's pixels are the painter's: an ordinary lift asks for them at once (the revision, which the finger does not wait on) and
// returns the promise of its publication; Undo, Close, Done and a commit that already holds its raster finish whatever is queued first, in order.
function _rapierPaintCommit(keep = false, kept = null, custody = false) {
	if (keep || custody) { const wait = _rapierPaintFlushRevision(); if (wait) return wait.then(() => _rapierPaintCommit(keep, kept, custody)); }
	const state = _rapierDrawState, layer = _rapierPaintLayer();
	if (!layer) return null;
	// A raster already encoded from this very version of the surface (the automatic settle's JPEG XL, a revision's PNG) is written as the layer's.
	if (kept) return _rapierPaintPublish(layer, keep, kept, custody);
	// Every commit attempt, refused or not, is a new version of the layer's pixels: the automatic
	// settle below encodes against one version and re-encodes if the hand moved on meanwhile.
	layer.paintVersion = (layer.paintVersion || 0) + 1;
	// Water keeps the accepted time boundary. Paint finishes its deferred wet work.
	if (layer.dryRaf) { cancelAnimationFrame(layer.dryRaf); layer.dryRaf = 0; }
	if(layer.mode==='water')layer.surface.finishWetWork();else layer.surface.settleWet();
	layer.dryFinishing = false; layer.dryBox = null;
	// Impasto: the kept mark is lit -- but the lighting lives in `shadeInto`, at read-out (baking it
	// into the stored pixels would make every later stroke re-light every earlier one).
	if (layer.raf) cancelAnimationFrame(layer.raf);
	layer.raf = 0;
	if (layer.holdRaf) { cancelAnimationFrame(layer.holdRaf); layer.holdRaf = 0; }
	return _rapierPaintEncodeRevision(layer, keep, {custody}).promise;
}
function _rapierPaintPublishEmpty(layer) {
	const state = _rapierDrawState, existing = layer.id != null ? _rapierDrawShapeById(layer.id) : null;
	// Everything erased: the layer's shape goes with it.
	if (existing || layer.retire?.length) { const gone = new Set(layer.retire || []); _rapierDrawSnapshot(); state.recipe.shapes = state.recipe.shapes.filter(shape => shape !== existing && !gone.has(shape.id)); _rapierDrawRenderAll(); _rapierDrawSealHistory(); }
	_rapierPaintCloseLayer(); _rapierPaintSyncPaper();
}
function _rapierPaintPublish(layer, keep, kept, custody, synced = false, record = null, waterRead = null) {
	const state = _rapierDrawState, surface = layer.surface;
	// The painted box is read off the painter's mirror, which is the painter's own once everything queued for the sheet has run.
	if (!synced && !surface.settled && !surface.failure) return surface.sync().then(() => _rapierPaintPublish(layer, keep, kept, custody, true, record, waterRead));
	layer.paintVersion = (layer.paintVersion || 0) + 1;
	const box = surface.bounds();
	const existing = layer.id != null ? _rapierDrawShapeById(layer.id) : null;
	if (!box) { _rapierPaintPublishEmpty(layer); return null; }
	const budget0 = _rapierPaintRasterBudget();
	// `kept`: a raster already encoded from this very version of the surface (the automatic settle's
	// JPEG XL), written in place of the working PNG so the stroke and its finished picture are ONE
	// history step.
	const pieces = Array.isArray(kept) ? kept : null;
	const raster = pieces ? pieces[0].url : kept;
	// A window flag a witness can set to force this path deterministically; unset, it is the real
	// fidelity budget every other raster in the drawing answers to.
	const budget = budget0;
	// `keep` is the closing path, and the budget may not refuse it. A picture over the size budget is
	// a SIZE problem -- recoverable by Set, by erasing, by Save's own reporting. A painting deleted
	// because the layer went away is DATA LOSS, and nothing recovers it.
	if (raster.length > budget && !keep) {
		// The budget starts codec custody, never a gap in stroke history. Keep this exact revision
		// immediately, as on a closing path; subsequent strokes get independent deltas while Set
		// encodes. Its final codec change amends only the latest delta. Done still enforces the
		// picture admission law before any oversized working raster can reach the document.
		_rapierPaintPublish(layer, true, raster, custody, true, record, waterRead);
		if (state.paintLayer === layer && !state.paintSetting) void _rapierPaintSetLayer({ auto: true, kib: Math.round(raster.length / 1024) });
		return null;
	}
	// The 24 MiB aggregate is enforced HERE, at the door, never at Done/Download/recovery's exit --
	// so nothing unkeepable is ever admitted into the live state. This picture is under its OWN
	// per-picture budget (the check above already passed), but together with every OTHER
	// already-committed painting it would cross what the document's own admission allows. An ORDINARY
	// commit (`!keep`) refuses here, live and uncommitted, exactly like the per-picture refusal above
	// -- but never auto-Sets: Set's own commit is a closing commit (`keep`) that this same rule may
	// not refuse, so auto-Setting would only rush past the very cap being enforced. A deliberate
	// closing commit (manual Set, Done, Clear, Undo, a tool change, closing Draw) is never refused
	// and may legitimately finish over the cap; Done then refuses to Add by name and Download, which
	// never measures the aggregate, stays open.
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
	// A closing commit on a layer whose pixels and brush are already published (SET, Done or a tool change after a settled
	// stroke) has nothing new to keep: the shape stands as it is and no history step is made, so every Undo answers a step
	// taken. A stroke that painted nothing but changed the brush still records the brush, as it always has.
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
	_rapierDrawSnapshot(undefined, custody || joins);
	// A Water painting keeps the Paper background it was painted on (the default under Water), in the same step.
	if (layer.mode === 'water' && typeof _rapierWaterAdoptPaper === 'function') _rapierWaterAdoptPaper();
	// The paper grows under the hand: ink committed beyond the canvas widens it, shifting every shape
	// when it grows leftward or upward; one history step with the stroke itself.
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
	// What the recipe holds for this layer as of this publish (the checkpoint above is the latest encoded revision, which may
	// still be unpublished): the closing-commit rule above reads it.
	layer.published = {revision: surface.revision, raster};
	// Lossless pieces (the law above _rapierPaintLosslessPieces): the whole painting's shape is cut
	// into one shape per piece, in this same history step; the layer closes below in every path
	// that hands pieces in (the automatic Set opens a clean sheet).
	let made = null, retired = false;
	if (pieces && pieces.length > 1) made = _rapierPaintSplitShapeSync(state.recipe.shapes, shape, pieces.map(piece => ({ url: piece.url, box: { x0: piece.box.x0 - box.x0, y0: piece.box.y0 - box.y0, x1: piece.box.x1 - box.x0, y1: piece.box.y1 - box.y0 } })));
	// The other pieces of a group this layer reopened (_rapierPaintRehydrateFor): their pixels are
	// now this shape's, so they go, in this same history step.
	if (layer.retire?.length) {
		const gone = new Set(layer.retire); layer.retire = null;
		const before = state.recipe.shapes.length;
		state.recipe.shapes = state.recipe.shapes.filter(row => !gone.has(row.id) || row === shape);
		retired = state.recipe.shapes.length !== before;
		// Whole again: a painting with no other piece left drops the group tag (a re-split above
		// has already given its new pieces a fresh one).
		if (!made && shape.paint?.group != null && !state.recipe.shapes.some(row => row !== shape && row.paint?.group === shape.paint.group)) delete shape.paint.group;
	}
	if (grown || made || retired) _rapierDrawRenderAll(); else { _rapierDrawRenderShapes([shape.id]); _rapierDrawUpdateMenu(); }
	_rapierPaintSealRevision(layer, stroke, priorShift, grown);
	// The committed <image> now shows the same pixels the overlay does; hand the picture back to the SVG.
	_rapierPaintShowLive(false);
	_rapierPaintSyncPaper();
	return null;
}

// ---- Paper ------------------------------------------------------------------------------------------
function _rapierPaintWanted() {
	const state = _rapierDrawState;
	return !!state.open && (['paint', 'water'].includes(_rapierDrawTool()) || !!state.recipe?.shapes.some(shape => shape.recognized === 'paint'));
}
// Light paper while painting or while a painting is on the canvas.
function _rapierPaintSyncPaper() {
	const state = _rapierDrawState, surface = state.surface;
	if (!surface) return;
	if (!Object.getOwnPropertyDescriptor(surface, 'rapierPaintFacts')) Object.defineProperty(surface, 'rapierPaintFacts', { enumerable: false, get: _rapierPaintFacts });
	// A canvas colour the person chose is the drawing's own (`recipe.paper`, kept with it), and beats
	// the automatic white a painting brings.
	const choice = state.recipe?.paper;
	const paper = choice === 'white' ? true : choice === 'black' ? false : _rapierPaintWanted();
	// The paper owner projects the stage too: ink uses the same paper choice and body theme in
	// _rapierDrawDarkPaper. Keep Canvas on a live theme token so an OS theme change cannot latch
	// yesterday's ground; an opaque stage also gives the Paint dip its actual background to sample.
	// Black is black in either theme: the light theme's own background is white, so a chosen black
	// canvas must never fall back to it.
	const black = !paper && choice === 'black';
	surface.querySelector('.rapier-draw-stage').style.backgroundColor = 'color-mix(in srgb,var(--draw-paper) 86%,var(--draw-paper-ink))';
	surface.style.setProperty('--draw-paper', paper ? '#fff' : black ? '#000' : 'var(--color-bg)');
	surface.style.setProperty('--draw-paper-ink', paper ? '#000' : black ? '#fff' : 'var(--color-text)');
	_rapierPaintWarmTarget();
	// The icon opens the canvas menu; its CANVAS row says the colour and what a tap does (_rapierDrawSyncCanvasMenu).
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

// ---- Picking a layer up again
// ---------------------------------------------------------------------
// Ambient warm-up: called on every render while Paint is up, so the decode has usually finished
// before the person's next stroke lands (the fast, synchronous path in `_rapierPaintBegin`); when it
// has not, that same stroke queues instead of opening an empty layer under it. Every input the fresh
// layer's geometry is computed from, as one string: a warmed layer is refused the moment any of them
// moves (`_rapierPaintLayerValid`), so a convenience can never decide a stroke's raster scale or
// origin.
function _rapierPaintWarmView(geom = _rapierDrawPointerGeometry()) {
	const { rect, vb } = geom, canvas = _rapierDrawState.recipe.canvas;
	return [canvas.w, canvas.h, rect.left, rect.top, rect.width, rect.height, vb.x, vb.y, vb.width, vb.height, innerWidth, innerHeight, globalThis.devicePixelRatio || 1].join(',');
}
function _rapierPaintWarmTarget() {
	const state = _rapierDrawState;
	if (!state.open || !['paint', 'water'].includes(_rapierDrawTool()) || state.gesture || _rapierPaintLayerValid()) return;
	const target = _rapierPaintTarget();
	// An untouched Water view owns no material. The first admitted gesture or action
	// allocates its sheet; merely opening the view must not consume its GPU budget.
	if (_rapierDrawTool() === 'water' && !target) return;
	// The painter starts the first time Paint is up, ahead of the hand, so that the first stroke does not wait for it.
	if (!_rapierPaintRemoteNow()) { _rapierPaintStartPainter().then(() => _rapierPaintWarmTarget(), () => {}); return; }
	if (target) { _rapierPaintRehydrateFor(target); return; }
	// Nothing to pick up and nothing drawn yet: the empty surface and its overlay are built now,
	// while the hand is still on its way, instead of on the frame the first dab needs. Only a
	// genuinely empty drawing is warmed -- a layer opened above existing shapes would re-append them
	// and could move an earlier painting's place in the scene order.
	if (!state.paintLayer && !state.recipe.shapes.length && !state.recipe.strokes.length) {
		const view = _rapierPaintWarmView();
		try { _rapierPaintOpenLayer().warmView = view; } catch (_) { _rapierPaintCloseLayer(); }
	}
}
