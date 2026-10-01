// SPDX-License-Identifier: AGPL-3.0-only
// The Paint tool: MyPaint brushes (draw/paint.mjs, draw/brushes.mjs) on a raster layer inside the
// drawing. A layer is a `paint` shape: its pixels are one PNG the SVG carries as an <image>, so the
// drawing renders in every browser and viewer exactly as painted; the recipe keeps the frame, the
// brush name and the pixel grid. Consecutive strokes go on one layer (the live surface stays in
// memory) so brushes that smudge, erode or blend act on what was just painted. The stroke's target
// is the painting the person chose (`state.paintChosenId`, written only by `_rapierDrawSetSelection`;
// R76 P01) for as long as it stays eligible and the document is the same, else the topmost eligible
// painting (`_rapierPaintTarget`); a resize or a turn keeps painting into the same layer through the
// transformed target frame (R76 P04), and only removal, a lock or a document change ends it. Paint is pixels on paper: while the tool is up, or a drawing holds paint, the stage
// Paint is pigment on paper: the stage shows light paper while painting, so the physics a wet brush
// obeys (a subtractive wash needs a ground) is the physics the hand sees. The committed pixels carry
// their own alpha and nothing is put behind them in the document.
const {PaintBrush, PaintSurface, parseBrush, serializeBrush} = globalThis.RapierDrawPaint;
const _rapierPaintPNG = globalThis.RapierDrawPaint.createPaintPNGCodec();
const {RAPIER_PAINT_BRUSHES, paintBrushById} = globalThis.RapierDrawBrushes;

// Raster pixels per canvas unit: at least two; a layer opened on a stage is painted at the stage's
// own device pixels up to three (`_rapierPaintLayerScale`), within a pixel budget.
const RAPIER_PAINT_SCALE = 2, RAPIER_PAINT_SCALE_MAX = 3, RAPIER_PAINT_AREA_MAX = 6000000;
// The brush's grain (R77, F77-2): how many of the brush's own canvas units make one drawing unit.
// A MyPaint preset is tuned in canvas pixels at 100% zoom; Brien Dieterle's reference sheet was
// painted on a canvas far denser than a 390-unit phone column, then shrunk, which is what turns
// each preset's dabs into fine texture instead of visible circles. Rendered at one unit per
// drawing unit our marks are the same engine seen under a microscope (docs/evidence/
// paint-look-r77-k1.png); at three they match the sheet's own feather barbs, bristle streaks and
// watery pulls (paint-look-r77-k3.png). The raster is untouched (the surface's scale law above):
// only the brush's coordinates are multiplied and the surface told how many raster pixels one of
// its units now covers. The Size slider still ranges over the preset's own default.
const RAPIER_PAINT_GRAIN = 3;
// Simulated pressure for a finger (`_rapierPaintPressure`): where it starts, its firm and light
// ends, the speed (canvas units per second) at which it has eased most of the way to light, and
// how much of the way a sample moves toward its target.
// Speed as a stand-in for the hand, for a device that reports no contact geometry: a hand bears
// down when it slows and lifts as it flicks. `exp(-speed / SPEED)` is that as a dimensionless 0..1
// slowness -- 1 at rest, 0 on a flick -- which then goes through the SAME `_rapierPaintFeel` curve
// the contact patch does, so both signals answer across the whole of 0..1 and can be blended.
//
// R81 (Astra A6 A5, reproduced in Node): the easing used to move a fixed 0.3 of the way PER SAMPLE,
// so the same physical stroke came out differently at 60 Hz (0.219) and at 240 Hz (0.119) -- a
// phone that delivers coalesced samples felt nothing. It is a time constant now: at 60 Hz the step
// is still exactly 0.3, and every other rate matches it.
// SPEED is the pace at which slowness has fallen to 1/e. 2500 units/s was most of a flick, so an
// ordinary 500-2000 units/s stroke never left the top of the curve and a hand felt nothing; 900
// puts the whole of an ordinary stroke's pace across the whole of the range (200 u/s -> 0.90,
// 1000 -> 0.61, 2000 -> 0.41, 4000 -> 0.21 on Firm). The gamma in `_rapierPaintFeel` is what keeps
// a confident stroke from washing out at the fast end, which is what the old high SPEED was for.
const RAPIER_PAINT_SIM_START = 0.9, RAPIER_PAINT_SIM_SPEED = 900, RAPIER_PAINT_SIM_TAU = 46.73;
// Light reads speed over a much shorter distance, so a deliberate slow pull already lands inside
// the watery presets' own near-pure-blending range instead of needing a flick to get there.
const RAPIER_PAINT_SIM_LIGHT_SPEED = 350;
// A touch pressure that moves is real (Android hands Chrome the digitizer's contact pressure); a
// platform without one reports the same number for every touch (the spec's 0.5, or one constant),
// which says nothing. So a reported touch pressure is trusted only once it has been seen to vary
// by RAPIER_PAINT_TOUCH_VARIES across the session; the speed model stands in until then.
// R77 (F77-1, the founder's own report): a fixed `raw * gain` with a floor cannot serve both ends
// -- Android fingers report roughly 0.05-0.5, which the old formula (gain 1.5, floor 0.25) squeezed
// into 0.25-0.75, a band where Water's own <=0.3 near-pure-mixing line is barely reachable and
// Blender's own long-drag range (its smudge_length_log needs pressure well above that) rarely is
// either -- one linear curve, tuned for neither preset's own law. Trusted real pressure is now
// normalised to the range THIS finger has actually shown this session (running min/max below), so
// its own hardest press this session reaches 1 and its own lightest reaches 0, whatever the raw
// digitizer numbers are -- the same discipline as a mouse's own device-independent, dimensionless
// pressure convention, applied to a sensor that reports its own physical units. A pen keeps its own
// reported pressure exactly as before (real reserve, not a signal that needs a session to calibrate).
const RAPIER_PAINT_TOUCH_VARIES = 0.08;
const _rapierPaintTouchSeen = { min: Infinity, max: -Infinity };
// The finger's own weight (R80). A fingertip is soft: press harder and it flattens, so the patch it
// puts on the glass grows. Android measures that patch (MotionEvent's touchMajor/touchMinor) and
// Chrome hands it to the page as a PointerEvent's `width` and `height` in CSS pixels -- which is the
// one real, continuous "how hard am I pressing" a phone has, since `pressure` for a touch is a
// constant on most Android devices. Rapier reads the patch's own diameter (the geometric mean of
// the two axes, so a finger rolled onto its side is not read as a harder press) and calibrates it to
// this person's own hand.
//
// R81 (the founder: "there's no finger pressing affecting brush width ... we discussed before you
// said you had it tied to speed and we were changing to pressure"). They were right, and the fault
// was the calibration, not the reading. R80 refused to believe the patch until it had SEEN it vary
// by 3.5 px within the session, and fell back to the speed model until then -- so a first stroke was
// always speed, and a person who presses fairly evenly (most people) never opened the spread at all
// and never left it. Rapier's own witness recorded exactly that and nobody read it: a 14 px patch
// came out `speed`, and only the 52 px one came out `patch`.
//
// So the patch is believed AT ONCE, against a real finger's own geometry: about 9 px of contact
// diameter for a light touch and about 26 px for a firm one, which is the range a fingertip actually
// makes on a phone. The session only ever WIDENS that band -- a smaller hand, a heavier press -- and
// never narrows it, so a person is calibrated to themselves within a stroke or two without ever
// having been handed the speed model first. The speed model remains for what it was always for: a
// device that reports no contact geometry at all.
const RAPIER_PAINT_PATCH_LIGHT = 9, RAPIER_PAINT_PATCH_FIRM = 26;
// And the patch answers across the WHOLE of 0..1 (R81). This is the fault underneath "nothing
// responds to how hard I press": the simulated model could only ever produce 0.6..1.0 on Firm, and
// EVERY preset curve -- ours, Brien Dieterle's, and any a person brings or an assistant writes --
// is authored across 0..1. Sixty per cent of every curve in the product was in a region no finger
// ever reached, so radius, opacity, smudge and the wet loads all sat pinned near their top end and
// a press changed nothing anyone could see.
//
// With a real contact patch there is no reason to keep the floor. R77 raised it because pressure
// was inferred from SPEED, and a fast confident stroke was wrongly read as a light one and painted
// almost nothing; a patch does not make that mistake -- a light mark now means the person actually
// touched lightly, which is what they were asking for. So the strength toggle stops being a floor
// that clips the range and becomes what it should always have been: a SENSITIVITY curve over the
// full range. Firm makes a given press yield more paint, Light less, and neither throws away the
// ends. A touch still never reads as nothing (the floor below), because a stroke that leaves no
// mark at all is the one thing that was ruled out.
// R84. The toggle had exactly two positions and every preset shared them, so a brush whose whole
// character is a light hand could only be had by asking the person to hold the toggle down for it --
// which is what the founder found on Scumble: "it's perfect, but only when it has the light setting
// turned on... in the regular firm setting it doesn't look like a scumble at all."
//
// So Firm and Light stop being two curves and become two POSITIONS on one touch scale, and a preset
// says where its own pair sits (`rapier_touch` in its .myb, read by this file alone -- the engine is
// handed a pressure and never asks where it came from). Scumble declares 1: its Firm is this scale's
// Light, and its Light is the third position, lighter again. Nothing special-cases a brush id.
//
// `speed` matters as much as the curve: the toggle changes how fast a stroke has to move before it
// reads as light at all, and a preset shifted up the scale must take that with it -- a gain on the
// preset's own pressure cannot, which is why one was measured, rendered, looked at and rejected.
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
// The position a gesture actually paints at: the person's toggle, carried up by the preset's own.
function _rapierPaintTouchLevel(id, light) {
	return _rapierDrawClamp((light ? 1 : 0) + _rapierPaintTouchOf(id), 0, RAPIER_PAINT_TOUCH.length - 1);
}
// R81, the second half of the same fault. Believing the patch AT ONCE was right; believing it
// ALONE was not. A digitizer that reports one constant width for every touch (plenty do) then pins
// the pressure at whatever that constant maps to, for the whole session, for every preset -- which
// is exactly "nothing responds to how hard I press", and worse than the speed model it displaced
// because it also shuts the speed model out. So the patch earns its weight: the blend is by how
// much spread the patch has actually SHOWN (`lo`/`hi`, the raw readings), reaching the patch alone
// once it has moved RAPIER_PAINT_PATCH_TRUST px. A real finger opens that inside one stroke; a
// constant never does and the hand is read from speed, as it was before the patch existed. There is
// no cliff between the two: one continuous weight, and no state that has to be right first time.
// How far apart a finger's own readings must come before the patch outvotes speed. Four pixels was
// most of a real finger's whole light-to-firm range, so the patch almost never earned its say.
// How many pixels the contact patch must be seen to vary across before it is fully believed. Two was
// far too sensitive: a panel whose reported width jitters by a single pixel -- which is noise, not a
// press -- earned half the vote and dragged every stroke halfway toward a light touch. A real finger
// swings its contact width by tens of pixels between a light touch and a firm one (14 to 52 on this
// harness's own emulated digitizer), so belief is scaled against that, not against jitter.
const RAPIER_PAINT_PATCH_TRUST = 12;
// A brush lands and lifts; it does not begin and end at full width. Measured at R81 on the real app,
// four of seven presets had no taper at all and Pen landed FATTER than its own body (1.30 in) --
// because the speed model reads slow as hard, and a stroke is slowest exactly where it starts and
// stops. Travel, not time: a careful slow stroke must not earn a longer fat ramp than a quick one.
// In brush radii of travel.
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
// R81: requiring BOTH axes threw away every device that reports only one. Plenty of Android panels
// give a real major axis and a placeholder 1 on the minor; the old guard read that as "no finger" and
// fell silently through to the speed model, which is why pressing harder changed nothing. Take the
// informative axis when only one is; a genuine 1x1 is still no information.
function _rapierPaintPatch(evt) {
	const w = Number.isFinite(evt.width) && evt.width > 1 ? evt.width : 0;
	const h = Number.isFinite(evt.height) && evt.height > 1 ? evt.height : 0;
	if (w && h) return Math.sqrt(w * h);
	return w || h || 0;
}
// The chosen brush and size are preferences and stay origin-wide; a person's own brush files are
// content and live under the deployment's storage scope like documents do (Weapon Audit P1-7), so
// a stable and a beta copy on one origin keep their own libraries.
// (RapierStorage is the shell's lexical global, the way editor/engine.js reads it -- never a
// property of globalThis.)
const RAPIER_PAINT_BRUSH_KEY = 'rapier:draw.paintbrush', RAPIER_PAINT_OWN_KEY = 'rapier:draw.paintbrushes' + RapierStorage.scope;
const RAPIER_PAINT_STRENGTH_KEY = 'rapier:draw.paintstrength';
// Blend, Dissolve and Erase (Dieterle's Smear, Water-erode and Eraser) are the brushes that work
// existing paint rather than lay fresh ink; the founder's Paint standard ("fit for an artist") asks
// that they be found, not stumbled into 12 chips deep in a scrolling strip, so they are pinned at
// its front -- each still shown by the engine's own sample working a band of paint (R73's glyph
// rule, unchanged). Smudge (R77, F77-1: "we need smudge") joins them -- Rapier's own preset,
// `draw/brushes/rapier/Smudge.myb`, a pure drag with no colour of its own that does not need a
// firm press to move paint (dieterle/blender's own law: only a firm press drags at all).
// R78 (the founder, 14 September: "the brushes look like shit"): the strip opens on Rapier's own
// finger set -- presets tuned so ONE finger pass on a phone lays a stroke that reads as paint
// (draw/brushes/rapier/*.myb, each derived from a Dieterle brush by the .myb route): Oil, Bristle,
// Water, Pencil, Pen, Marker, Smudge, then the eraser; the Dieterle originals follow.
// The brushes that LAY paint come first and the three that work paint already there come last
// (R81, the founder on the strip: "number three just looks nothing like any kind of real
// paintbrush" -- it was Water, a blender, which on bare canvas can only look like nothing).
// R86i: Rapier's own set leads BOTH sections, so the four new operators are pinned with the three
// that were already here -- the Tools row a thumb arrives at is Rapier's own seven, in the order
// a person meets them, and the factory pack follows in Brushes.
const RAPIER_PAINT_PINNED = ['rapier/oil', 'rapier/bristle', 'rapier/scumble', 'rapier/marker', 'rapier/watercolour', 'rapier/pencil', 'rapier/pen',
	'rapier/water', 'rapier/smudge', 'rapier/smear', 'rapier/blend', 'rapier/eraser', 'rapier/dissolve', 'rapier/erode', 'rapier/wetflat'];
// R86g (docs/intent.md "R86g laws" 7): Scumble is the brush paint mode opens with, and it is a
// larger brush the moment it is selected -- its own default size (500%, the founder's "much larger,
// like 500%"). A size the person sets is remembered per brush, so each brush comes back at the size
// it was last used at; a brush never set before opens at its own default. The strength (Firm/Light)
// is the person's one toggle for every brush and no brush's own: Scumble's light hand on Firm is the
// touch scale's doing (docs/intent.md "R84 laws": nothing may special-case a brush id for it), and a
// first draft that opened Scumble on Light silently doubled that -- four paint witnesses read the
// brush at a strength the panel did not show.
const RAPIER_PAINT_DEFAULT_ID = 'rapier/scumble';
// Smudge is a fingertip, not a thumb (the founder, 27 September: "The default size is way too big ... When you make it five
// times smaller it actually looks good"): 30, the width at which a pull on the phone reads as a fingertip's. Watercolour is a
// wash: at 50 it laid a 21-point tube with a dark rim, a marker's line; at 62 a passage that glazes what it crosses, for the same
// drying.
const RAPIER_PAINT_SIZE_DEFAULTS = Object.freeze({ 'rapier/scumble': 89, 'rapier/smudge': 30, 'rapier/watercolour': 62 });
const RAPIER_PAINT_SIZES_KEY = 'rapier:draw.paintsizes';
function _rapierPaintSizeDefault(id) { return Object.hasOwn(RAPIER_PAINT_SIZE_DEFAULTS, id) ? RAPIER_PAINT_SIZE_DEFAULTS[id] : RAPIER_PAINT_SIZE_DEFAULT; }
function _rapierPaintSizesRead() { try { const raw = JSON.parse(localStorage.getItem(RAPIER_PAINT_SIZES_KEY) || '{}'); return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}; } catch (_) { return {}; } }
function _rapierPaintSizeFor(id) { const own = _rapierPaintSizesRead()[id]; const n = Number(own); return Number.isFinite(n) ? _rapierDrawClamp(Math.round(n), 0, 100) : _rapierPaintSizeDefault(id); }
// The preset the ERASE tool paints with over a painting, and the radius its own settings declare
// (`radius_logarithmic` base), so the tool's radius can be expressed as an offset from it.
// R86i: the preset's radius was 0.4 -- e^0.4, one and a half drawing units, four raster pixels
// across. A stylus eraser's width on a chooser meant for a thumb; measured and named by an audit,
// and nobody could have erased anything with it. It is a fingertip now and this constant follows it,
// so the ERASE tool's own offset still lands exactly on the width its live ring shows.
const RAPIER_PAINT_ERASER_ID = 'rapier/eraser', RAPIER_PAINT_ERASER_LOGR = 2.85;
// The tools that paint on a paint layer. Erase joined Paint at R82 (it erases pixels over a
// painting), and every gate that used to read `tool === 'paint'` has to know that or the erase
// gesture's layer is quietly never opened -- which is exactly how the first cut of this failed.
function _rapierPaintToolPaints(tool = _rapierDrawTool()) { return tool === 'paint' || tool === 'erase'; }
function _rapierPaintDefaultId() { return RAPIER_PAINT_BRUSHES.some(entry => entry.id === RAPIER_PAINT_DEFAULT_ID) ? RAPIER_PAINT_DEFAULT_ID : RAPIER_PAINT_BRUSHES[0].id; }
// A person's own brushes: MyPaint .myb files uploaded into the strip, kept on this device (bounded),
// exportable again as the same file. An id is `own/` plus a digest of the preset's settings, so the
// same file uploaded twice is one chip.
const RAPIER_PAINT_OWN_FILE_MAX = 256 * 1024;
// A small gauge, its needle high (firm) or low (light): the strength affordance's own icon, painted
// like every other Draw control rather than labelled in words (intent.md "Draw is icons").
const RAPIER_PAINT_ICON_GAUGE_FIRM = RAPIER_DRAW_ICON_WRAP('<path d="M4 16a8 8 0 0 1 16 0"></path><line x1="12" y1="16" x2="16" y2="9"></line><circle cx="12" cy="16" r="1.3" fill="currentColor" stroke="none"></circle>');
const RAPIER_PAINT_ICON_GAUGE_LIGHT = RAPIER_DRAW_ICON_WRAP('<path d="M4 16a8 8 0 0 1 16 0"></path><line x1="12" y1="16" x2="8" y2="10"></line><circle cx="12" cy="16" r="1.3" fill="currentColor" stroke="none"></circle>');
// R83, the founder: "the brush presets. They're totally confusing. You can't even see what brush is
// which from the little thumbnails. And the blenders and stuff, like where it's got like a blue and
// yellow square, and, you know, people just can't even see what that is."
//
// They had found the exact seam. A chip's art is the ENGINE'S OWN painted sample, which is honest
// and beautiful for a brush that lays colour -- and meaningless for one that does not. Water, Smudge
// and the blenders have nothing of their own to show, so their sample is whatever scratch colour the
// sampler happened to lay: the blue and yellow square. A tool that MOVES paint is drawn, not
// sampled, and everything on the strip carries its NAME, because a thumb-sized mark is not a
// memory. So the strip is two labelled sections -- what lays colour, and what works it.
// R86i. A Tool is an OPERATOR, not a renamed preset. Until now this set held four of Brien
// Dieterle's own brushes under Rapier words, and a brush has no obligation to satisfy a word it was
// never given: measured on this tree, Dissolve ADDED alpha at the pressure a finger uses, Erode took
// -0.75 units at a light touch and -312 at a hard one, and Wet flat painted the selected colour in
// every one of 2,571 trail pixels. Seven Rapier presets now carry `rapier_op` and the engine runs the
// named operator in place of laying colour (draw/paint.mjs, docs/paint-tools.md); the four Dieterle
// brushes go back among Brushes, which is what they are. Law 27 (the founder, 25 September): Smear
// and Posterize work the paint rather than laying it, so they stand under TOOL. Smear was Dieterle's
// Blender until 27 September, when the founder found it "just glitches out erases dots": eleven random
// colour buckets that resample once in forty dabs at a finger's firm press, laid at random offsets --
// a speckle, as its author made it. Smear is Rapier's drag, combed; the Blender is among Brushes again.
const RAPIER_PAINT_TOOL_IDS = new Set(['rapier/water', 'rapier/smudge', 'rapier/smear', 'rapier/blend', 'rapier/eraser',
	'rapier/dissolve', 'rapier/erode', 'rapier/wetflat', 'rapier/posterize']);
function _rapierPaintIsTool(id) { return RAPIER_PAINT_TOOL_IDS.has(id); }
// A tool that works the material under it rather than laying colour. It is the one kind of gesture
// that must see the painting a SET or the memory-cap rollover left beneath a clean sheet.
function _rapierPaintIsMaterialTool(id) { return _rapierPaintIsTool(id) || id === RAPIER_PAINT_ERASER_ID; }
// A drop, for water: it thins and carries.
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
// A flat brush head with its bristles: the wet flat.
const RAPIER_PAINT_ICON_FLAT = RAPIER_DRAW_ICON_WRAP('<rect x="6" y="3" width="12" height="7"></rect><path d="M8 10v9"></path><path d="M12 10v10"></path><path d="M16 10v9"></path>');
// Nine paint tools, nine words, nine marks (the founder, R85, on the chooser that showed two
// ERASERs and three WATERs with one icon each: "That's crazy."). A tool's word is what it does,
// in one word; the preset's own full name stays in the label a screen reader and the tip use,
// and no .myb is touched. Law 27 brought Smear and Posterize under TOOL, where a chip shows a mark
// and not the engine's sample, so each has a mark of its own: an unnamed tool wore the eraser's.
const RAPIER_PAINT_TOOL_WORDS = Object.freeze({ 'rapier/water': 'Water', 'rapier/smudge': 'Smudge', 'rapier/eraser': 'Eraser',
	'rapier/blend': 'Blend', 'rapier/dissolve': 'Dissolve', 'rapier/erode': 'Erode', 'rapier/wetflat': 'Wet flat',
	'rapier/smear': 'Smear', 'rapier/posterize': 'Posterize' });
function _rapierPaintToolWord(id, name) { return RAPIER_PAINT_TOOL_WORDS[id] || name; }
// The factory pack's own names collide on a chip (two "Fountain pen"s, a second "Pencil", two
// "Tail feathers" cut to the same word): each carries a word of its own on the chip. The full
// name stays in the label and the tip; the .myb is untouched.
// R86i: the Watery Flat Brush and the Dissolver came back among Brushes when the Tools became
// operators, and the chip's word then cut at the first comma -- so "Water" and "Water, erode" both
// read "Water" on the strip, which is exactly the founder's "three options called water. That's
// crazy." Each takes a word of its own; the pack's full name stays in the label and the tip. A chip
// shows its word whole since law 50, a name that is no table's (the person's own brush) as it came.
const RAPIER_PAINT_BRUSH_WORDS = Object.freeze({ 'dieterle/fountain-sf-1': 'Fountain', 'dieterle/fount-offset-1': 'Offset pen', 'dieterle/pencil-left-handed': 'Left pencil',
	'dieterle/flight-feathers': 'Feathers', 'dieterle/tail-feathers': 'Tail feather', 'dieterle/tail-feathers2': 'Tail plume',
	'dieterle/wateryflatbrush': 'Watery flat', 'dieterle/dissolver': 'Dissolver' });
function _rapierPaintBrushWord(id, name) { return RAPIER_PAINT_BRUSH_WORDS[id] || name; }
const RAPIER_PAINT_TOOL_ICONS = Object.freeze({ 'rapier/water': RAPIER_PAINT_ICON_WATER, 'rapier/smudge': RAPIER_PAINT_ICON_SMUDGE, 'rapier/eraser': RAPIER_PAINT_ICON_RUBBER,
	'rapier/blend': RAPIER_PAINT_ICON_BLEND, 'rapier/dissolve': RAPIER_PAINT_ICON_DISSOLVE, 'rapier/erode': RAPIER_PAINT_ICON_ERODE, 'rapier/wetflat': RAPIER_PAINT_ICON_FLAT,
	'rapier/smear': RAPIER_PAINT_ICON_SMEAR, 'rapier/posterize': RAPIER_PAINT_ICON_POSTERIZE });
function _rapierPaintToolIcon(id) { return RAPIER_PAINT_TOOL_ICONS[id] || ''; }
const RAPIER_PAINT_SIZE_DEFAULT = 50;
// The linear-light white the layer is painted on (draw/paint.mjs PaintSurface.paper).
// Smudge samples the layer alone, as libmypaint does: an earlier build composited an opaque white
// sheet under the layer for the smudge probe (so the Dieterle brushes' transparency gate always
// saw paint), and every light-pressure stroke then smeared white -- the pale, washed-out look the
// founder saw. Where the layer is bare the picked-up alpha is low and the dab thins or is skipped,
// which is what paint on paper does; the stage's white paper is display only.
const RAPIER_PAINT_PAPER = null;
// The wet media a live layer runs on (R79). `cell` is the raster pixels the physics runs a cell
// over -- 3, one drawing unit at the brush's grain, so a phone-sized layer's wet window costs about
// 20 MB instead of the 360 MB a dense state would. The rest is the look the eye settled on: a short
// drying time (a wash that still bloomed visibly at 8 s came out ragged), the pigment read as a
// transparent film over what is under it (Beer-Lambert, so a glaze multiplies with the wash beneath
// rather than covering it), and the reference's per-raster-pixel flow slowed for the coarser grid.
// `bleed` (R80) is the other half of wet-in-wet: suspended pigment wanders through still water on
// its own, so two colours laid side by side while both are wet run into one another instead of
// meeting along a hard joint. At 0.6 a crossing mixes -- blue over gold reads green where they
// share water -- while each stroke still keeps its own body.
const RAPIER_PAINT_WET = {dryingTime: 1600, cell: 3, maxBytes: 64000000, film: true, filmGain: 0.55,
	flow: 0.55, pin: 1.2, bleed: 0.6, grain: 1, granulation: 0.2, tooth: 0.85, edgeDarkening: 1};
// A drying tick advances at most this much wet time, so a long stroke's owed time drains over a few
// frames -- the wash blooms in view instead of freezing the hand at the moment it lifts.
// Simulated ms per physics step, and the real ms a drying frame may spend before it yields. The
// first is granularity; the second is the jank budget the split above finally makes meaningful.
const RAPIER_PAINT_DRY_FEED = 8, RAPIER_PAINT_DRY_SLICE = 8, RAPIER_PAINT_DRY_BUDGET = 8;
// Which way is down (R80). A phone knows how it is being held, and a wash on a tilted sheet runs
// downhill -- so a person can lean the phone and watch the water go. `beta` is the front-to-back
// lean and `gamma` the side-to-side one; flat on a table is no bias at all. Scaled well below the
// full pull of gravity: a lean should send the water travelling, not empty the wash off the page.
// Nothing is requested and no permission is asked for: a device that reports nothing simply paints
// on a flat sheet, which is what every wash did before this.
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
// sample at a fraction of the preset's own radius -- at full size every brush filled its tile with
// one blob and the strip stopped telling them apart (R79). Natural log, so this is about 0.33x.
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
// Every brush the strip can show: Rapier's own finger set first (RAPIER_PAINT_PINNED), then the rest
// of the factory set, then the person's own -- so what a thumb meets first is never a scroll away.
// The Brushes/Tools split then sorts them: the seven operators are Tools, everything else Brushes.
// The whole pack is the strip's. R80 hid Brien Dieterle's stylus-tuned presets behind a disclosure
// ("the presets that actually require a stylus should be kept in a separate advanced stylus bit");
// R81 the founder took it back ("what happened to the other brushes? ... we need them all for
// fingers"), once a finger's pressure reached 0.12..1.0. A preset that cannot answer a finger is
// fixed by name against the sheet, never hidden.
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
	// array: two valid brushes differing only in `rapier_bristle_load` 1 against 200 hashed the same
	// and the second silently replaced the first (Codex R81). The wet loads, their maps and the
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
// The size a session opens with is the remembered brush's own (its row, else its default: law 7,
// Scumble at 89) -- never another brush's last width read from a shared key (Grok's R86w audit).
function _rapierPaintRememberedSize() {
	try { return _rapierPaintSizeFor(_rapierPaintRememberedBrush()); } catch (_) { return RAPIER_PAINT_SIZE_DEFAULT; }
}
function _rapierPaintBrushId() { const id = _rapierDrawState.paintBrush; return _rapierPaintEntry(id) ? id : _rapierPaintDefaultId(); }
function _rapierPaintSetBrush(id) {
	if (!_rapierPaintEntry(id)) return;
	_rapierDrawState.paintBrush = id;
	// The brush's own size, the person's remembered one for it first (R86g law 7); the strength is
	// the person's own and a pick never touches it.
	_rapierDrawState.paintSize = _rapierPaintSizeFor(id);
	try { localStorage.setItem(RAPIER_PAINT_BRUSH_KEY, id); } catch (_) {}
	_rapierPersonal.rememberDrawing('paintBrush', id);
	_rapierDrawState.paintPicked = id;
	_rapierPaintUpdateStrip();
}
function _rapierPaintSize() { const n = Number(_rapierDrawState.paintSize); return Number.isFinite(n) ? _rapierDrawClamp(Math.round(n), 0, 100) : RAPIER_PAINT_SIZE_DEFAULT; }
// The Size slider is a log offset on the brush's own radius: 50 is the preset as its author tuned
// it (one canvas unit per MyPaint pixel), 0 is an eighth of that, 100 eight times.
// The layer's raster scale is the surface's (`surface.scale`), never folded into the radius.
// The founder, 17 September: "the default brush size actually needs to be double... as soon as I get
// into the paint surface, I increase the brush size to 200%. That's a good starting point. So I guess
// what we should do is just uniformly increase all the sizes by double and then have that be the new
// 100%."
//
// So the SETTING is what moves, not the label. Every position of the slider now lays a brush twice
// as wide as it did, and the panel still reads 100% in the middle -- a percentage here has no
// absolute referent, it is relative to the brush's own natural width, so redefining what 100% draws
// is the honest way to do this and it leaves the person's muscle memory alone. Nobody has to move a
// slider they were already moving every single time.
//
// The one consequence worth knowing: the FINEST setting is now twice as coarse as it was, because
// the whole range moved rather than stretching. If the fine end is ever wanted back, widen the
// slider's own range (the log-8 span below); do not shrink this, which would just put the default
// back where it was too small.
const RAPIER_PAINT_SIZE_DOUBLED = Math.log(2);
function _rapierPaintRadiusOffset(size = _rapierPaintSize()) { return (size - 50) / 50 * Math.log(8) + RAPIER_PAINT_SIZE_DOUBLED; }
function _rapierPaintSetSize(value) {
	const n = _rapierDrawClamp(Math.round(Number(value)), 0, 100);
	if (!Number.isFinite(n)) return;
	_rapierDrawState.paintSize = n;
	try { const sizes = _rapierPaintSizesRead(); sizes[_rapierDrawState.paintBrush] = n; localStorage.setItem(RAPIER_PAINT_SIZES_KEY, JSON.stringify(sizes)); _rapierPersonal.rememberDrawing('paintSizes', JSON.stringify(sizes)); } catch (_) {}
}
function _rapierPaintSizeWord(size = _rapierPaintSize()) { return Math.round(Math.exp((size - 50) / 50 * Math.log(8)) * 100) + '%'; }

// sRGB hex -> 0..1 components; the file's ink (light-paper colour), never the dark-paper display ink.
function _rapierPaintColor() {
	const hex = _rapierDrawShapeInk({ ink: _rapierDrawState.ink });
	return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
}

// ---- Brush glyphs: each preset paints its own sample --------------------------------------------
// R77 (F77-1): the glyph's own pressure sequence is the strip's real pressure law (the same
// RAPIER_PAINT_SIM_* recurrence `_rapierPaintPressure` runs on an actual gesture, at the glyph's
// own slow, deliberate path), not an idealized sine that could show a preset dragging harder than
// the strip's current toggle actually delivers. A tile is the founder's own promise of what tapping
// it does; a promise the phone cannot keep is worse than a plainer one it can. Keyed by the current
// strength toggle so Blender's and Water's own tiles change with it, exactly as a real stroke would.
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
const _rapierPaintGlyphCache = new Map(), RAPIER_PAINT_GLYPH_CACHE_MAX = 256;
function _rapierPaintGlyph(id, color, light) {
	const level = _rapierPaintTouchLevel(id, light);
	const key = id + '|' + color.join(',') + '|' + level + '|' + _rapierPaintDipKey(id);
	const cached = _rapierPaintGlyphCache.get(key);
	if (cached) return cached;
	let url = '';
	try {
		// A tile is a small picture of the brush, not a live layer: a wet preset paints its stroke and
		// the paper is dried on the spot (`settleWet` below), so the strip never runs a drying loop
		// per tile and a tile costs what its own few thousand pixels cost.
		const def = _rapierPaintDefFor(id), W = RAPIER_PAINT_GLYPH_W, H = RAPIER_PAINT_GLYPH_H;
		const surface = new PaintSurface(W, H, {wet: {...RAPIER_PAINT_WET, maxBytes: 4000000}});
		surface.paper = RAPIER_PAINT_PAPER;
		// A brush that only acts on paint (eraser, posterize, colorize, a pure smudge) shows itself
		// working on a band of paint; every other brush shows its own stroke on bare paper.
		const at = RAPIER_PAINT_SETTING_AT, setting = name => def.settings[at[name]];
		// R78: a smudge brush is one whose smudge is high at rest, whatever its inputs do with pressure
		// (Blender, Dissolver and Smudge all map smudge by pressure); on bare paper such a tile was a
		// blank white rectangle, which the founder rightly called meaningless.
		if (setting('eraser').base > 0 || setting('posterize').base > 0 || setting('colorize').base > 0 || setting('smudge').base >= 0.9 || setting('lock_alpha').base > 0) {
			const band = new Uint8ClampedArray(W * H * 4);
			for (let y = Math.round(H * 0.28); y < Math.round(H * 0.72); y++) for (let x = 0; x < W; x++) { const q = (y * W + x) * 4, left = x < W / 2; band[q] = left ? 232 : 46; band[q + 1] = left ? 176 : 112; band[q + 2] = left ? 38 : 216; band[q + 3] = 255; }
			surface.fromRGBA8(band, W, H, 0, 0);
		}
		const brush = new PaintBrush(def);
		const pts2d = []; for (let i = 0; i <= 32; i++) { const t = i / 32; pts2d.push([W * 0.12 + t * W * 0.76, H / 2 + Math.sin(t * Math.PI * 2) * H * 0.22]); }
		const pts = _rapierPaintGlyphPressures(pts2d, level);
		globalThis.RapierDrawPaint.paintStroke(surface, brush, pts, { color, seed: 7, radiusOffset: RAPIER_PAINT_GLYPH_RADIUS });
		// A wet tile shows the mark AS IT IS LAID, before the water has had time to travel: the owed
		// time is dropped rather than stepped. A stroke's second of flow belongs to a stage the size
		// of a phone; run into a tile a twelfth of that, the same water floods it and every wet brush
		// shows the same solid rectangle -- which is the meaningless tile the founder called out in
		// R77, arrived at from the other direction.
		if (surface.wetState) { surface.wetPending = 0; surface.settleWet(); }
		url = _rapierPaintSurfaceToDataURL(surface, null);
	} catch (_) { url = ''; }
	// Tiles are keyed by brush AND ink, so a person trying colours walks through the whole strip
	// again at each one. Dropping the oldest tile keeps that bounded without the cliff a wholesale
	// clear used to give, where every tile in the strip was repainted at once.
	while (_rapierPaintGlyphCache.size >= RAPIER_PAINT_GLYPH_CACHE_MAX) _rapierPaintGlyphCache.delete(_rapierPaintGlyphCache.keys().next().value);
	_rapierPaintGlyphCache.set(key, url);
	return url;
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
const RAPIER_PAINT_DIP_MIN = 14, RAPIER_PAINT_DIP_MAX = 260, RAPIER_PAINT_DIP_FULL = 0.97;
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
	const [load, water] = _rapierPaintDip(id);
	if (load >= RAPIER_PAINT_DIP_FULL && water <= 0.005) return def;
	def.rapier = { ...(def.rapier || {}) };
	// Quadratic, because the bottom of the axis is where a painter wants the fine control: the
	// difference between a nearly dry brush and a half-loaded one is most of what drybrush is.
	if (load < RAPIER_PAINT_DIP_FULL) def.rapier.rapier_load = Math.round(RAPIER_PAINT_DIP_MIN + (RAPIER_PAINT_DIP_MAX - RAPIER_PAINT_DIP_MIN) * load * load);
	if (water > 0.005) {
		def.rapier.rapier_thinners = water;
		if (def.wet) {
			def.wet = { ...def.wet };
			if (def.wet.rapier_water > 0) def.wet.rapier_water = Math.min(4, def.wet.rapier_water * (1 + 1.1 * water));
			if (def.wet.rapier_pigment_load > 0) def.wet.rapier_pigment_load *= 1 - 0.62 * water;
		}
	}
	return def;
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
	// A jar, not a swatch (R85): the paint stands inside an outlined well with a lip, so a full load
	// still reads as a well full of paint beside the colour dot, and a thinned one as paint let down.
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
function _rapierPaintDipSample(id, color, light) {
	const level = _rapierPaintTouchLevel(id, light);
	const key = id + '|' + color.join(',') + '|' + level + '|' + _rapierPaintDipKey(id);
	const cached = _rapierPaintDipCache.get(key);
	if (cached) return cached;
	let url = '';
	try {
		const W = RAPIER_PAINT_DIP_W, H = RAPIER_PAINT_DIP_H;
		const surface = new PaintSurface(W, H, { wet: { ...RAPIER_PAINT_WET, maxBytes: 8000000 } });
		surface.paper = RAPIER_PAINT_PAPER;
		const brush = new PaintBrush(_rapierPaintDefFor(id));
		const pts2d = []; for (let i = 0; i <= 96; i++) { const t = i / 96; pts2d.push([W * 0.05 + t * W * 0.90, H / 2 + Math.sin(t * Math.PI * 1.1) * H * 0.17 - t * H * 0.06]); }
		globalThis.RapierDrawPaint.paintStroke(surface, brush, _rapierPaintGlyphPressures(pts2d, level), { color, seed: 7, radiusOffset: RAPIER_PAINT_DIP_RADIUS });
		if (surface.wetState) { surface.wetPending = 0; surface.settleWet(); }
		url = _rapierPaintSurfaceToDataURL(surface, null);
	} catch (_) { url = ''; }
	while (_rapierPaintDipCache.size >= RAPIER_PAINT_DIP_CACHE_MAX) _rapierPaintDipCache.delete(_rapierPaintDipCache.keys().next().value);
	_rapierPaintDipCache.set(key, url);
	return url;
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
// The one thing opening a layer changes on screen: whether there is a painting to Set. It used to
// be reached by rebuilding the whole brush strip at layer open -- chip HTML, glyph tiles and all --
// on the very frame the first dab needs. Only SET's word changes: its glyph stays (law 15; writing
// the whole button's text was the second reason SET showed no icon).
function _rapierPaintSyncSet() {
	const set = _rapierDrawState.surface?.querySelector('[data-draw-act="paintSet"]'), word = set?.querySelector('.rapier-draw-btn-name');
	const layer = _rapierPaintLayer();
	if (set) set.disabled = !!_rapierDrawState.paintSetting || !layer || !!layer.warmView;
	if (word) word.textContent = _rapierDrawState.paintSetting ? 'setting' : 'set';
}
function _rapierPaintDipSyncPanel(repaintSample = true) {
	_rapierPaintSyncSet();
	const panel = _rapierPaintDipPanel();
	if (!panel || panel.hidden) return;
	const id = _rapierPaintBrushId(), color = _rapierPaintColor(), [load, water] = _rapierPaintDip(id);
	const pad = panel.querySelector('.rapier-draw-dip-pad'), knob = panel.querySelector('.rapier-draw-dip-knob'), track = panel.querySelector('.rapier-draw-dip-track');
	const ink = color.join(',');
	if (panel.dataset.dipInk !== ink) { panel.dataset.dipInk = ink; _rapierPaintDipField(panel.querySelector('.rapier-draw-dip-field'), color); }
	// Positioned so the knob stays wholly inside the pad at both extremes rather than half hanging
	// off it: the travel is the pad less the knob's own width.
	// The knob rides a track the pad's size, carried by a transform (the track's percentages are the pad's): a drag
	// moves it on the compositor, never laying the panel out.
	track.style.transform = 'translate(calc((100% - 26px) * ' + water.toFixed(4) + '), calc((100% - 26px) * ' + (1 - load).toFixed(4) + '))';
	const a = _rapierPaintDipStrength(load, water), paper = _rapierPaintDipPaper();
	knob.style.setProperty('--rapier-dip-ink', 'rgb(' + [0, 1, 2].map(k => Math.round(color[k] * 255 * a + paper[k] * (1 - a))).join(',') + ')');
	const word = _rapierPaintDipWord(id);
	panel.querySelector('.rapier-draw-dip-word').textContent = word;
	pad.setAttribute('aria-label', 'Dip the brush. Left and right for water, up and down for paint. Now: ' + word);
	panel.querySelector('[data-draw-paint-act="redip"]').hidden = !_rapierPaintDipped(id);
	const light = _rapierDrawState.paintStrength === 'light';
	for (const button of panel.querySelectorAll('[data-draw-paint-strength]')) button.setAttribute('aria-pressed', String((button.dataset.drawPaintStrength === 'light') === light));
	if (repaintSample) _rapierPaintDipSampleSoon();
}
// The sample is a real stroke through the real engine -- measured at 50-150 ms for a 300x58 tile on
// a desktop, so several times that on a phone -- which is far too much to spend per frame. It is
// therefore painted when the thumb PAUSES, not while it moves: the knob and the words answer the
// drag instantly, and the picture arrives a breath after the hand stops. Repainting per frame was
// tried first and is exactly the jank the founder called out.
const RAPIER_PAINT_DIP_SETTLE = 140;
function _rapierPaintDipSampleSoon() {
	const state = _rapierDrawState;
	clearTimeout(state.paintDipTimer);
	state.paintDipTimer = setTimeout(() => {
		state.paintDipTimer = 0;
		const panel = _rapierPaintDipPanel();
		if (!panel || panel.hidden) return;
		const img = panel.querySelector('.rapier-draw-dip-sample'), url = _rapierPaintDipSample(_rapierPaintBrushId(), _rapierPaintColor(), _rapierDrawState.paintStrength === 'light');
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
		// Held, the knob swells under the finger and glides to where the finger came down; moved, it follows at once;
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
	return { layerId: layer ? layer.id : null, live: !!layer, valid: _rapierPaintLayerValid(), loading: state.paintRehydrate || null, failed: state.paintRehydrateFailed || null, setting: !!state.paintSetting, pendingOverflow: !!layer?.pendingOverflow,
		// Z13: an ordinary lift's PNG now finishes off the main thread (_rapierPaintEncodeRevision).
		// A watcher that only read `setting`/`pendingOverflow` to know the layer is idle (the automatic
		// Set is the same wait, just later) would see both false while this worker round trip is still
		// outstanding -- the commit has not reached the recipe yet. Expose it as its own fact.
		committing: !!layer?.pendingCommit, flips: state.paintFlips || 0, timing: state.paintTiming ? { ...state.paintTiming } : null, surface: layer?.surface ? layer.surface.width + 'x' + layer.surface.height : null, brush: layer?.brushId || null, brushChosen: state.paintBrush || null, size: _rapierPaintSize(), strength: state.paintStrength || null, dirty: !!layer?.surface?.dirty, scale: layer?.scale || null, showing: !!layer && layer.canvas.style.visibility !== 'hidden',
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
		// came from, and the patch the glass reported (R80).
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
// The founder's own design, and the answer to a painting that grew past what one picture can hold:
// "you paint as per usual right now and then we discussed we need to add a button users press to
// commit their paint and convert to JpegXL as a paint layer which then becomes just a new image on
// the canvas and they can paint fresh layer."
//
// Painting stays cheap and lossless while it is live. Pressing Set is the moment the expensive,
// beautiful encode happens, ONCE: the layer is dried, encoded as JPEG XL (the picture-format law --
// intent.md, and open-work.md section 2, "The painting is JPEG XL, not PNG"), and left on the canvas
// as an ordinary picture. A clean surface opens over it, so the next strokes cost nothing that the
// finished work underneath used to cost.
// The picture-format law, the founder: "every painting when you press done should be saved as JPEG
// XL full quality... the default for JPEG XL should not be quality 95, because that loses quality.
// We would only offer that to people as an extra option for extra large paintings."
//
// So LOSSLESS is what every painting gets, always, with no question asked. Quality 95 is never
// reached for automatically: it is offered, by name and with both sizes, only when a painting is
// genuinely too large to hold losslessly -- and the person decides.
// A painting Paint turns into JPEG XL (Set, the automatic Set, the flip at the memory cap) is kept as JPEG XL, and Draw shows a
// painting from its own bytes. A browser that cannot show JPEG XL (Chrome on Android) then showed nothing where the painting was:
// every automatic Set made everything painted before it vanish from the screen. So Paint keeps the same pixels as PNG beside each
// JPEG XL it makes, for display only (`_rapierPaintShowable`, read by `_rapierDrawDisplayMarkup`); the recipe, the file, history
// and every kept byte stay JPEG XL. Held for the drawing that made them and forgotten when another opens.
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
async function _rapierPaintShownFor(surface, box) { return (await _rapierPaintJxlShowable()) ? null : _rapierPaintPNG.compressed(surface.toRGBA8(box)); }
function _rapierPaintKeepShown(pieces) { for (const piece of pieces || []) if (piece?.shown && piece.url) _rapierPaintShownAs.set(piece.url, piece.shown); }
function _rapierPaintShowable(html) {
	if (!html || !_rapierPaintShownAs.size || !html.includes('data:image/jxl')) return html;
	return html.replace(/(href=")(data:image\/jxl;base64,[A-Za-z0-9+/=]+)"/g, (whole, lead, url) => { const shown = _rapierPaintShownAs.get(url); return shown ? lead + shown + '"' : whole; });
}
async function _rapierPaintEncodeJXL(surface, box, options = {lossless: true}) {
	if (Array.isArray(globalThis.__rapierPaintEncodeLog)) globalThis.__rapierPaintEncodeLog.push({...options}); // witness seam (paint-auto-set-lossless)
	if (globalThis.__rapierPaintEncodeHold) await globalThis.__rapierPaintEncodeHold; // witness seam (paint-auto-set-lossless): the encoder held so a press can land while a Set settles
	const px = surface.toRGBA8(box);
	const data = new Uint8Array(px.data.buffer.slice(0));
	const out = await globalThis.RapierEmbeddedImages.codec('encode', {width: px.width, height: px.height, data, options});
	return {url: 'data:image/jxl;base64,' + RapierBundleIO.toBase64(out.bytes || out), options};
}
// R85b, the founder on their phone (15 September 2026): "I painted heaps and then pressed done and
// rapier REMOVED my latest painting work when I pressed Done... rapier needs to save the user's work
// automatically as jpegxl never delete it and save without their work." Done used to DISCARD a live
// layer the working PNG budget had refused (_rapierPaintDiscardOverflow, below), which was written
// as a settlement law and is in fact the worst outcome there is: the person's paint, on screen, gone
// on the one press that means "keep this". The refusal was also measured against the wrong number --
// the working PNG, not the JPEG XL the picture is actually written as, which for a big painting is
// several times smaller. So nothing is ever discarded on a closing path now: the pixels are kept, as
// JPEG XL, at the best quality that fits, and the person is told if quality had to move.
//
// The picture-format law in code (intent.md "Picture format law"; open-work.md: "Quality 95 is
// never reached for automatically ... the person decides"; Codex's R86d audit P-02/P-03, verified
// at R86e): every AUTOMATIC path -- the Set at the budget, the Done keep, the cap flip's re-encode
// -- writes lossless JPEG XL and nothing else. A painting whose lossless bytes pass what one
// picture may hold (RAPIER_DRAW_RASTER_MAX, the reader's own admission cap) is kept as SEVERAL
// lossless pictures: the painted box is halved along its longer side, at a whole pixel, until each
// piece fits, the pieces butting edge to edge (never overlapping: translucent paint drawn twice in
// an overlap would darken a strip along the seam; a butt join composites exactly). No quality step
// is ever taken quietly, and no raster the reader would refuse on reopen is ever written. Returns
// the pieces as [{box, url}] in reading order, or null only when even sixty-four pieces cannot fit.
// The one owner of the per-picture cap every paint path answers to: the reader's own admission
// cap, or the tiny cap a witness injects (`window.__rapierPaintRasterMaxTest`, read only when set)
// so the paths past the cap can be proven with a short stroke.
function _rapierPaintRasterBudget() {
	const test = typeof window !== 'undefined' ? window.__rapierPaintRasterMaxTest : undefined;
	return Number.isFinite(test) ? test : globalThis.RapierDrawCore.RAPIER_DRAW_RASTER_MAX;
}
async function _rapierPaintLosslessPieces(encodeBox, box, budget, depth = 0) {
	// The encoder refuses a whole picture past its own 16 MiB bound (JXL_SIZE, images/encoder.mjs)
	// before this can measure it: that refusal is the cutter's signal to halve, the same as a
	// measured picture past the budget, never the person's dead end (Lane I's finding, task #335).
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
	// data:, so fetch(dataUrl) was refused and every painting that was not the live layer at Done
	// silently stayed PNG (found at R86d by a witness that finally reached this path).
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
async function _rapierPaintEncodeCanvasBox(canvas, box, options = {lossless: true}) {
	const b = box || { x0: 0, y0: 0, x1: canvas.width - 1, y1: canvas.height - 1 };
	if (Array.isArray(globalThis.__rapierPaintEncodeLog)) globalThis.__rapierPaintEncodeLog.push({...options}); // witness seam
	const px = canvas.getContext('2d').getImageData(b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
	const data = new Uint8Array(px.data.buffer.slice(0));
	const out = await globalThis.RapierEmbeddedImages.codec('encode', {width: px.width, height: px.height, data, options});
	return {url: 'data:image/jxl;base64,' + RapierBundleIO.toBase64(out.bytes || out), options};
}
// A committed painting whose lossless bytes pass the cap, cut into lossless pieces from its own
// raster: the shape is replaced by one shape per piece, each with the piece's own corner geometry
// (an affine cut of the whole's), in the same recipe position. Returns the pieces' shapes, or null
// when the raster is not a picture this can read.
// `shapes` is the array the shape lives in: the live recipe's while painting, and at Done the
// restored snapshot's -- a clone, so an insertion aimed at the live recipe found no such shape and
// every piece but the first was left out of the file while the toast said nothing was lost (a
// read at R86e, the R85b law; `paint-done-keeps-pieces`).
function _rapierPaintSplitShapeSync(shapes, shape, pieces) {
	const state = _rapierDrawState, geom = shape.geom || {}, [pw, ph] = shape.paint?.px || [0, 0];
	if (!(pw > 0 && ph > 0)) return null;
	// A rotated rectangle and an explicit corner frame are the same pixel-to-world map (ZA3 F6: a
	// painted shape's rot was dropped here, so a rotated rectangle's pieces occupied the axis-aligned
	// box of the pixels rather than the world the person rotated it into).
	const frame = geom.p || (geom.rot ? _rapierDrawRectPolygon(geom.cx, geom.cy, geom.w, geom.h, geom.rot) : null);
	// ZA3 F5: `shapes` is sometimes a DETACHED snapshot (a checkpoint normalizing while a newer
	// drawing is already open) -- allocating a piece id against the LIVE recipe's `_rapierDrawNextId`
	// can mint an id the snapshot itself already used, and the reader's duplicate-id repair then drops
	// a connector binding to the ambiguous shape. Allocate against the array actually being cut.
	const used = new Set(shapes.flatMap(row => [row.id, row.group, row.paint?.group]));
	let seq = 0;
	const nextId = () => {
		let id;
		do { id = shapes === state.recipe.shapes ? _rapierDrawNextId() : 's' + (++seq); } while (used.has(id));
		used.add(id); return id;
	};
	const at = (u, v) => frame
		? [frame[0][0] + (frame[1][0] - frame[0][0]) * u / pw + (frame[3][0] - frame[0][0]) * v / ph, frame[0][1] + (frame[1][1] - frame[0][1]) * u / pw + (frame[3][1] - frame[0][1]) * v / ph]
		: [geom.cx - geom.w / 2 + geom.w * u / pw, geom.cy - geom.h / 2 + geom.h * v / ph];
	const made = pieces.map((piece, index) => {
		const b = piece.box, c0 = at(b.x0, b.y0), c1 = at(b.x1 + 1, b.y0), c3 = at(b.x0, b.y1 + 1);
		const g = frame ? { p: [c0, c1, [c1[0] + c3[0] - c0[0], c1[1] + c3[1] - c0[1]], c3] }
			: { cx: (c0[0] + c1[0]) / 2, cy: (c0[1] + c3[1]) / 2, w: c1[0] - c0[0], h: c3[1] - c0[1] };
		const next = index === 0 ? shape : { ...shape, id: nextId() };
		// The pieces are ONE painting: each carries the group (the first piece's id), and picking any
		// of them up to paint reopens the whole group as one layer (_rapierPaintRehydrateFor).
		next.geom = g; next.raster = piece.url; next.paint = { ...(shape.paint || {}), px: [b.x1 - b.x0 + 1, b.y1 - b.y0 + 1], group: shape.id };
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
	return {width: px.width, height: px.height, toRGBA8(b) {
		const width = b.x1 - b.x0 + 1, height = b.y1 - b.y0 + 1, data = new Uint8ClampedArray(width * height * 4);
		for (let y = 0; y < height; y++) data.set(px.data.subarray(((b.y0 + y) * px.width + b.x0) * 4, ((b.y0 + y) * px.width + b.x1 + 1) * 4), y * width * 4);
		return {width, height, data};
	}};
}
async function _rapierPaintKeepAsJXL(recipe) {
	// One owner for which codec a picture is written in: `_rapierDefaultImageProfile`. A painting is
	// a picture and follows the same rule, so it never disagrees with the rest of the document.
	if (typeof _rapierDefaultImageProfile === 'function' && _rapierDefaultImageProfile() !== 'jxl') return [];
	const state = _rapierDrawState, budget = _rapierPaintRasterBudget(), split = [];
	// A supplied recipe is an immutable-in-time snapshot, not permission to read a later live layer.
	const layer = recipe ? null : state.paintLayer;
	// Done owns a frozen recipe. Capture its matching live surface now, before any encoder await;
	// a later stroke cannot change the requested pixels. Closed layers use their exact working PNG.
	const current = state.paintLayer, frozenShape = recipe?.shapes.find(shape => shape.id === current?.id);
	const frozenBox = frozenShape && frozenShape.raster === current.raster && current.checkpoint?.revision === current.surface.revision ? current.surface.bounds() : null;
	const frozenPixels = frozenBox ? current.surface.toRGBA8(frozenBox) : null;
	for (const shape of ((recipe || state.recipe)?.shapes || []).slice()) {
		if (shape.recognized !== 'paint' || !shape.raster || shape.raster.startsWith('data:image/jxl')) continue;
		// The live surface holds the exact pixels and is preferred; a painting whose layer has been
		// closed is re-encoded from its own committed bytes rather than left as an oversized PNG.
		// One restored from a file already carries its author's JPEG XL and never reaches here.
		const live = layer && layer.id === shape.id && layer.surface ? layer : null;
		const box = live ? live.surface.bounds() : null;
		if (live && !box) continue;
		const was = shape.raster.length;
		let pieces;
		if (live) pieces = await _rapierPaintLosslessPieces(b => _rapierPaintEncodeJXL(live.surface, b, { lossless: true }), box, budget);
		else {
			const exact = shape === frozenShape && frozenPixels ? frozenPixels : await _rapierPaintPNG.decode(shape.raster);
			if (exact) {
				const surface = _rapierPaintPixelsSurface(exact);
				pieces = await _rapierPaintLosslessPieces(b => _rapierPaintEncodeJXL(surface, b, {lossless: true}), {x0: 0, y0: 0, x1: exact.width - 1, y1: exact.height - 1}, budget);
			} else {
				const canvas = await _rapierPaintRasterCanvas(shape.raster);
				pieces = await _rapierPaintLosslessPieces(b => _rapierPaintEncodeCanvasBox(canvas, b, { lossless: true }), { x0: 0, y0: 0, x1: canvas.width - 1, y1: canvas.height - 1 }, budget);
			}
		}
		if (!pieces) continue;
		if (pieces.length === 1 && !live) { shape.raster = pieces[0].url; continue; }
		if (pieces.length === 1) { shape.raster = pieces[0].url; continue; }
		// Several pieces: the shape becomes one shape per piece. A live layer's box is the surface's
		// own coordinates; the shape's raster pixels are that box, so the pieces are rebased onto it.
		const origin = live ? { x: box.x0, y: box.y0 } : { x: 0, y: 0 };
		const made = await _rapierPaintSplitShape((recipe || state.recipe).shapes, shape, pieces.map(piece => ({ url: piece.url, box: { x0: piece.box.x0 - origin.x, y0: piece.box.y0 - origin.y, x1: piece.box.x1 - origin.x, y1: piece.box.y1 - origin.y } })));
		if (made) split.push({ shape, was, pieces: made.length });
	}
	return split;
}
// The founder's own next clause, in the same breath as the quote above _rapierPaintEncodeJXL:
// quality 95 is "an extra option for extra large paintings", never the default. Every painting
// above is already lossless, in as many pieces as it needs to pass under one picture's own cap
// (RAPIER_DRAW_RASTER_MAX) -- but the drawing itself is written as ONE SVG asset
// (globalThis.RapierImageAssets.createAsset, capped at IMAGE_LIMITS.bytes), and the pieces' own sum
// can still pass THAT even though no single piece does. This is the fallback for exactly that case,
// reached only from _rapierDrawFinish after _rapierPaintKeepAsJXL, and only once the person has
// agreed to it (_rapierPaintOfferQuality95, below): every already-lossless painting or piece in
// `recipe` is re-encoded IN PLACE at quality 95 -- same box, same grouping, same piece count, only
// the bytes shrink, so nothing about where a painting sits in the drawing moves. A piece was already
// at or under the per-picture cap at full quality; quality 95 only shrinks it further, so no piece
// is ever re-cut here. A live, still-unsplit painting is re-encoded from its own surface, the same
// as its lossless encode was a moment ago; a closed layer, or any piece of a group, is re-encoded
// from its own just-written raster, decoded back (_rapierPaintRasterCanvas) -- the round trip loses
// nothing extra, since what it decodes was itself lossless a moment ago. Returns how many distinct
// paintings were touched (a group's several pieces count once).
async function _rapierPaintReencodeQuality95(recipe) {
	const state = _rapierDrawState, layer = state.paintLayer, options = { lossless: false, quality: 95 }, touched = new Set();
	for (const shape of (recipe?.shapes || [])) {
		if (shape.recognized !== 'paint' || !shape.raster || !shape.raster.startsWith('data:image/jxl')) continue;
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
// The one dialog the picture-format law ever asks (intent.md "Picture format law", the founder:
// "the default for JPEG XL should not be quality 95 ... We would only offer that to people as an
// extra option for extra large paintings"): named, with both real sizes, never decided silently.
// Reached only when the drawing's own SVG asset cannot hold its paintings losslessly. No secondary
// label: "cancel" -- always offered by the confirm dialog itself -- is the decline, read back as
// `false` the same as a true dismiss (Escape, the backdrop).
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
	// The guard goes up BEFORE any commit that could start an automatic Set from inside this one
	// (Codex P-04, verified at R86e): a manual SET commits as the closing path does (`keep`), which
	// the working budget never refuses, and then asks its question below.
	// ZA3 F8: an exact {layer, session} token, not a bare flag -- a shared boolean left one closed
	// drawing's abandoned encoder blocking every later drawing's own SET until that promise settled.
	const setting = state.paintSetting = { layer, session: state.session, auto };
	_rapierPaintUpdateStrip();
	let shape = null, laid = null;
	try {
		// Whatever is still wet belongs to this picture, not to the clean sheet. INSIDE the try
		// (R87j P03): this settlement used to run above the error boundary, so when it refused -- a
		// long wet stroke's accumulated debt reaching paper.mjs's per-call `Wet time` bound -- Set
		// threw with no toast at all. The person's pixels were still live and recoverable, but
		// nothing said the keep had failed. The debt itself is now paid by the engine's own
		// `_drainWet`; this move is the other half, so any GENUINE refusal left is visible in the
		// same toast every other Set failure uses and `finally` still lowers the guard and restores
		// the strip. The two are independent: neither hides the other.
		layer.surface.settleWet();
		if (!auto) {
			_rapierPaintCommit(true);
			shape = layer.id != null ? _rapierDrawShapeById(layer.id) : null;
			if (!shape) { showToast('There is nothing painted to set yet.', 'info'); return; }
		}
		const budget = _rapierPaintRasterBudget();
		const asJXL = typeof _rapierDefaultImageProfile !== 'function' || _rapierDefaultImageProfile() === 'jxl';
		// Measure the PNG we will keep, not the emergency stored-block working encoding. The
		// existing raw-RGBA codec compresses losslessly without a canvas alpha round-trip; measuring
		// stored blocks exhausted the sixty-four-piece bound for paintings compressed PNG can hold.
		const encode = (box, options) => asJXL ? _rapierPaintEncodeJXL(layer.surface, box, options).then(async out => ({ ...out, shown: await _rapierPaintShownFor(layer.surface, box) }))
			: _rapierPaintPNG.compressed(layer.surface.toRGBA8(box)).then(url => ({ url, options }));
		let kept = null, pieces = null;
		if (auto) {
			// Encoded against one version of the surface; if a stroke lands while the encoder works,
			// the picture is encoded again so nothing painted before the sheet flips is left off it.
			// Bounded: a hand that never lifts falls back to the closing keep (Done re-encodes).
			for (let tries = 0; ; tries++) {
				layer.surface.settleWet();
				const version = layer.paintVersion || 0, box = layer.surface.bounds();
				if (!box) return;
				pieces = await _rapierPaintLosslessPieces(b => encode(b, { lossless: true }), box, budget);
				kept = pieces ? { url: pieces[0].url, options: { lossless: true } } : null;
				if (!state.open || state.session !== setting.session || state.paintSetting !== setting || state.paintLayer !== layer) return;
				const moving = state.gesture?.kind === 'paint';
				if (kept && (layer.paintVersion || 0) === version && !moving) break;
				if (!kept || tries >= 7) {
					// An active stroke has not made its own history step yet. Leave it live until
					// pointer-up, rather than folding its partial pixels into the previous stroke.
					if (!moving) { layer.pendingOverflow = true; _rapierPaintCommit(true, null, true); layer.pendingOverflow = false; }
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
			_rapierPaintCommit(true, pieces.length === 1 ? kept.url : pieces, true);
			shape = layer.id != null ? _rapierDrawShapeById(layer.id) : null;
			if (!shape) return;
		} else {
			// Full quality, always (R85b, the founder: "save the user's work automatically as jpegxl
			// never delete it"): one lossless picture where it fits, lossless pieces where it does not.
			// No quality is ever offered, because none is ever needed.
			const box = layer.surface.bounds(), version = layer.paintVersion || 0;
			const session = state.session, currentLayer = state.paintLayer;
			pieces = await _rapierPaintLosslessPieces(b => encode(b, { lossless: true }), box, budget);
			// Encoding is asynchronous; a later stroke, Undo or another drawing owns its own pixels.
			// The initial keep already committed this picture, so refusing a stale encoding loses nothing.
			if (!state.open || state.session !== session || state.paintLayer !== currentLayer ||
				_rapierDrawShapeById(shape.id) !== shape || (layer.paintVersion || 0) !== version || state.gesture?.kind === 'paint' || layer.surface.wetState) {
				if (state.open && state.session === session) showToast('The painting changed while Set was working. Your work is kept; press Set again to finish the current picture.', 'info');
				return;
			}
			if (!pieces) { showToast('This painting is past what even sixty-four pictures can hold. Erase some of it and set it again.', 'info'); return; }
			kept = { url: pieces[0].url, options: { lossless: true } };
			_rapierPaintKeepShown(pieces);
			_rapierDrawSnapshot();
			shape.raster = kept.url;
			if (pieces.length > 1) { _rapierPaintSplitShapeSync(state.recipe.shapes, shape, pieces.map(piece => ({ url: piece.url, box: { x0: piece.box.x0 - box.x0, y0: piece.box.y0 - box.y0, x1: piece.box.x1 - box.x0, y1: piece.box.y1 - box.y0 } }))); _rapierDrawRenderAll(); }
			else _rapierDrawRenderShapes([shape.id]);
			_rapierDrawSealHistory();
		}
		// The picture is finished; the next stroke starts on a clean sheet over it.
		_rapierPaintCloseLayer();
		_rapierPaintOpenLayer();
		_rapierPaintSyncPaper();
		const how = (kept.options?.lossless ? 'full quality' : 'quality ' + (kept.options?.quality ?? kept.quality)) + (pieces && pieces.length > 1 ? ', in ' + pieces.length + ' pieces' : '');
		if (auto) showToast('This painting reached what one working picture holds (' + kib + ' KiB), so it was set as a ' + (asJXL ? 'JPEG XL' : 'PNG') + ' picture (' + how + ', ' + Math.round((pieces ? pieces.reduce((n, piece) => n + piece.url.length, 0) : kept.url.length) / 1024) + ' KiB)' + (kept.fits === false ? ', still larger than one picture usually holds' : '') + '. You are on a clean sheet over it -- keep going.', 'info');
		else showToast('Set as a picture (' + how + ', ' + Math.round(kept.url.length / 1024) + ' KiB). A clean sheet is open over it.', 'info');
		if (!auto) laid = shape;
	} catch (error) {
		showToast('This painting could not be set: ' + String(error?.message || error), 'error');
	} finally {
		// Only this attempt's own token releases the latch: a later drawing's SET, or this same
		// layer's own close, may already have moved it on (ZA3 F8).
		if (state.paintSetting === setting) { state.paintSetting = false; _rapierPaintUpdateStrip(); }
	}
	// SET's moment plays once the painting is kept, its clean sheet open and the latch down: nothing it does can
	// touch the keep. An automatic Set, which comes mid-painting, lays nothing.
	if (laid) _rapierPaintSettle(laid);
}
// SET's moment (docs/paint-tools.md, "Draw's moments"): the picture just set is laid down like paper -- a sheet of the
// paper's own colour, a breath above it, settles onto it and is gone. Only the part of it on the screen is laid.
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
	if (!state.paintLayer || state.paintSetting || typeof rapierConfirm !== 'function') return;
	const confirmed = await rapierConfirm({
		title: 'Set painting?',
		message: 'Your current painting will be flattened to a JPEG XL image that maintains transparency in the canvas. A fresh painting layer will open above it so you can keep painting.',
		confirmLabel: 'Set',
		secondaryLabel: '',
	});
	if (confirmed && state.open && !state.finishing) await _rapierPaintSetLayer();
}
function _rapierPaintSetPicker(kind, open = true) {
	const state = _rapierDrawState, mode = kind === 'tools' ? 'tools' : 'brushes';
	state.paintPicker = open ? mode : null;
	const row = _rapierPaintStrip();
	if (row) row.dataset.drawPanel = mode === 'tools' ? 'paintTools' : 'paintBrushes';
	for (const [act, value] of [['paintBrushes', 'brushes'], ['paintTools', 'tools']]) state.surface?.querySelector('[data-draw-act="' + act + '"]')?.setAttribute('aria-expanded', String(state.paintPicker === value));
	_rapierPaintUpdateStrip();
}
// R83's law, strip by strip: the person finds a strip where they left it. One row shows BRUSH's strip and TOOL's, so
// its place is kept for the strip it is showing whenever that strip goes -- hidden (R85: the row is one floating panel
// among several, and display:none drops a scroll) or replaced by the other -- and each is given back its own (since
// law 50 TOOL's strip scrolls too, and it opened at BRUSH's place, mid-word).
function _rapierPaintKeepScroll(row) {
	if (!row.hidden && row.dataset.paintShown) row.dataset[row.dataset.paintShown] = String(row.scrollLeft);
}
function _rapierPaintUpdateStrip() {
	const row = _rapierPaintStrip();
	if (!row) return;
	_rapierPaintDipSyncButton();
	_rapierPaintDipSyncPanel();
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
			'" aria-label="' + _rapierDrawEscapeAttr(entry.name + (entry.notes ? '. ' + entry.notes : '')) + '" data-tip="' + _rapierDrawEscapeAttr(entry.name.toLowerCase()) + '" aria-checked="' + on + '" aria-pressed="' + on + '">' +
			// Law 50: the chip's word is whole -- the table's word for a factory brush or tool, the person's own brush's
			// name as it came (it was cut at its first comma and at twelve letters, "Witness spl…").
			art + '<span class="rapier-draw-chip-name">' + _rapierDrawEscapeAttr(tool ? _rapierPaintToolWord(entry.id, entry.name) : _rapierPaintBrushWord(entry.id, entry.name)) + '</span></button>';
	};
	const focused = row.contains(document.activeElement) ? document.activeElement : null;
	const wasKey = focused ? (focused.dataset.drawPaintBrush ? 'brush:' + focused.dataset.drawPaintBrush : focused.dataset.drawPaintAct ? 'act:' + focused.dataset.drawPaintAct : '') : '';
	row.innerHTML = entries.map(chip).join('') +
		(own ? '<button type="button" class="rapier-draw-chip rapier-draw-chip--icon" data-draw-paint-act="fit" role="switch" aria-checked="' + _rapierPaintFitsFinger(chosen) + '" aria-label="' +
			(_rapierPaintFitsFinger(chosen) ? 'This brush is fitted for a finger. Turn that off to use its authored response' : 'Use finger fitting for this brush') + '">' + (_rapierPaintFitsFinger(chosen) ? RAPIER_PAINT_ICON_GAUGE_FIRM : RAPIER_PAINT_ICON_GAUGE_LIGHT) + '<span class="rapier-draw-chip-name">fit</span></button>' : '') +
		(own ? '<button type="button" class="rapier-draw-chip rapier-draw-chip--icon rapier-draw-chip--delete" data-draw-paint-act="remove" aria-label="Remove this brush from your set">' + RAPIER_DRAW_ICONS.trash + '<span class="rapier-draw-chip-name">remove</span></button>' : '') +
		// R86e, the founder: ADD and SAVE are the last two cells of Brushes, not the primary row --
		// "that makes total sense and would declutter the draw interface which is always our goal."
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
function _rapierPaintSurfaceToDataURL(surface, box) {
	const crop = box || { x0: 0, y0: 0, x1: surface.width - 1, y1: surface.height - 1 };
	return _rapierPaintPNG.encode(surface.toRGBA8(crop));
}
// The worker receives an immutable straight-RGBA revision, never the display canvas. Jobs stay
// ordered: a newer stroke does not drop an older one, and a late reply cannot publish over it.
// The bytes on the job are the ones encoded; the buffer posted to the worker is a copy, transferred,
// so the job can still be finished here if the worker never answers.
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
function _rapierPaintEncodeRevision(layer, px, keep, frozen) {
	if (typeof Worker !== 'function') return false;
	let owner = layer.pngWorker;
	if (!owner) {
		let url;
		try {
			url = URL.createObjectURL(new Blob(['const codec = (' + globalThis.RapierDrawPaint.createPaintPNGCodec.toString() + ')(); self.onmessage = async e => { const {id, px} = e.data; try { self.postMessage({id, raster: await codec.compressed(px)}); } catch (e) { self.postMessage({id, error: String(e.message || e)}); } };'], {type: 'text/javascript'}));
			owner = layer.pngWorker = {worker: new Worker(url), url, serial: 0};
		} catch (_) { if (url) URL.revokeObjectURL(url); return false; }
		const worker = owner.worker;
		worker.onmessage = event => {
			const job = (layer.revisions || []).find(item => item.id === event.data.id);
			if (!job || job.raster) return;
			try { job.raster = event.data.raster || _rapierPaintPNG.encode(job.px); }
			catch (error) { layer.pendingOverflow = true; showToast('The painting could not be kept. It is still open: ' + String(error?.message || error), 'error'); return; }
			_rapierPaintDrainRevisions(layer);
		};
		worker.onerror = worker.onmessageerror = () => { try { _rapierPaintFlushRevision(layer); } catch (error) { layer.pendingOverflow = true; showToast('The painting could not be kept. It is still open: ' + String(error?.message || error), 'error'); } };
	}
	const {worker} = owner;
	let resolve;
	const held = { width: px.width, height: px.height, data: new Uint8ClampedArray(px.data) };
	const wire = new Uint8ClampedArray(held.data);
	layer.pngSerial = (layer.pngSerial || 0) + 1;
	const job = {id: layer.pngSerial, px: held, keep, frozen, brushId: layer.brushId, worker, url: owner.url, session: _rapierDrawState.session, revision: layer.surface.revision, promise: new Promise(ok => { resolve = ok; }), resolve: () => resolve()};
	layer.revisions = layer.revisions || [];
	layer.revisions.push(job);
	layer.pendingCommit = layer.revisions[0];
	_rapierDrawRenderHistory();
	job.timer = setTimeout(() => { if ((layer.revisions || []).includes(job)) { try { _rapierPaintFlushRevision(layer); } catch (error) { layer.pendingOverflow = true; showToast('The painting could not be kept. It is still open: ' + String(error?.message || error), 'error'); } } }, 15000);
	try { worker.postMessage({id: job.id, px: {width: held.width, height: held.height, data: wire}}, [wire.buffer]); }
	catch (_) { _rapierPaintFlushRevision(layer); }
	return true;
}
function _rapierPaintDrainRevisions(layer) {
	const queue = layer.revisions || [];
	while (queue[0]?.raster && layer.revisions === queue) _rapierPaintFinishRevision(layer, queue[0].raster);
}
function _rapierPaintFinishRevision(layer, raster, cancel = false) {
	const queue = layer.revisions || [];
	const job = queue[0] || (!queue.length ? layer.pendingCommit : null);
	if (!job) return;
	if (queue[0] === job) queue.shift();
	layer.revisions = queue;
	layer.pendingCommit = queue[0] || null;
	clearTimeout(job.timer);
	if (cancel && !queue.length) { try { job.worker.terminate(); } catch (_) {} try { URL.revokeObjectURL(job.url); } catch (_) {} layer.pngWorker = null; }
	try {
		if (_rapierDrawState.paintLayer !== layer || _rapierDrawState.session !== job.session) throw new Error('The painting changed before its revision was kept');
		const live = layer.surface.revision === job.revision && !_rapierDrawState.gesture && !queue.length;
		if (live) _rapierPaintCommit(job.keep, raster);
		else _rapierPaintPublishFrozen(layer, job, raster);
	} catch (error) { layer.pendingOverflow = true; throw error; }
	finally { job.resolve(); }
}
// The stroke was already lifted. Its pixels and its place were taken then. Publishing them now
// must not settle the wash a newer stroke is still in, must not hide that stroke's overlay, and
// must not pretend this raster is the live revision.
function _rapierPaintPublishFrozen(layer, job, raster) {
	const state = _rapierDrawState;
	const built = job.frozen;
	if (!built) throw new Error('The painting changed before its revision was kept');
	const geom = layer.frame ? built.geom : { ...built.geom };
	const pw = built.pw, ph = built.ph, s = built.s;
	const existing = layer.id != null ? _rapierDrawShapeById(layer.id) : null;
	const joins = !!layer.joinsStroke && layer.joinsStroke === state.undoStack.at(-1);
	if (joins) layer.joinsStroke = null;
	_rapierDrawSnapshot(undefined, joins);
	const grown = !layer.frame && _rapierDrawGrowCanvas(geom.cx - geom.w / 2, geom.cy - geom.h / 2, geom.cx + geom.w / 2, geom.cy + geom.h / 2);
	state.paintLastGrown = grown || null;
	if (grown) { geom.cx += grown.dx; geom.cy += grown.dy; }
	let shape = existing;
	if (shape) { shape.geom = geom; shape.raster = raster; shape.paint = { brush: job.brushId, px: [pw, ph], scale: s }; }
	else {
		shape = { id: _rapierDrawNextId(), stroke: null, recognized: 'paint', asDrawn: false, brush: 'ink', style: null, geom, raster, paint: { brush: job.brushId, px: [pw, ph], scale: s } };
		state.recipe.shapes.push(shape);
	}
	layer.id = shape.id; layer.raster = raster; layer.geom = JSON.stringify(geom);
	layer.checkpoint = {revision: job.revision, raster};
	if (grown || layer.retire?.length) _rapierDrawRenderAll(); else { _rapierDrawRenderShapes([shape.id]); _rapierDrawUpdateMenu(); }
	_rapierDrawSealHistory();
	if (grown) _rapierPaintFollowGrowth(layer, grown);
	_rapierPaintSyncPaper();
}
// The paper grew under a kept stroke, and every shape and the view moved by (dx, dy) canvas units with it. The live layer moves
// too -- its pixels are where they were, only its origin names them anew -- so the next stroke begins on the painting as it stands.
// Closing it instead made that stroke read the whole painting back from its PNG before its first dab (1.2-1.6 s at the 4x
// throttle on a phone-sized painting, a large Scumble), and left it open with its old origin when a revision was published while
// the next stroke was already down, so that stroke would have been kept shifted by the growth. A stroke in progress takes the new
// pointer map; its held samples are the layer's own coordinates and need nothing.
function _rapierPaintFollowGrowth(layer, grown) {
	if (layer.frame || !layer.origin) { _rapierPaintCloseLayer(); return; }
	layer.origin[0] += grown.dx; layer.origin[1] += grown.dy;
	_rapierPaintPlaceLive();
	const gesture = _rapierDrawState.gesture;
	if (gesture?.kind === 'paint' && gesture.paint && !gesture.paint.pending && _rapierDrawState.paintLayer === layer) gesture.paint.geom = _rapierDrawPointerGeometry();
}
function _rapierPaintFlushRevision(layer = _rapierPaintLayer()) {
	if (!layer) return;
	const queue = layer.revisions?.length ? layer.revisions.splice(0) : (layer.pendingCommit ? [layer.pendingCommit] : []);
	layer.pendingCommit = null;
	layer.revisions = [];
	const owner = layer.pngWorker;
	if (owner) {
		owner.worker.onmessage = owner.worker.onerror = owner.worker.onmessageerror = null;
		try { owner.worker.terminate(); } catch (_) {}
		try { URL.revokeObjectURL(owner.url); } catch (_) {}
		layer.pngWorker = null;
	}
	for (const job of queue) {
		clearTimeout(job.timer);
		try {
			if (_rapierDrawState.paintLayer !== layer || _rapierDrawState.session !== job.session) throw new Error('The painting changed before its revision was kept');
			const raster = _rapierPaintPNG.encode(job.px);
			if (layer.surface.revision === job.revision && !_rapierDrawState.gesture) _rapierPaintCommit(job.keep, raster);
			else _rapierPaintPublishFrozen(layer, job, raster);
		} catch (error) { layer.pendingOverflow = true; job.resolve(); throw error; }
		job.resolve();
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
// The target a stroke works on (Astra-R74 P02/P04): one explicit shape, resolved fresh before the
// gesture is admitted -- stateless, never a remembered "last painted" that could go stale across an
// Undo, a reload or a switch to a different painting. First, whatever is selected: a person who taps
// a painting with Select and switches to Paint (or a contextual Blend affordance that keeps the
// selection) is choosing that painting on purpose, wherever it sits and however it has since been
// moved, resized, rotated or flipped. Otherwise the topmost painting still eligible -- scanning down
// from the top of the stack rather than requiring the very last shape, so a vector added above it
// (lettering, an arrow) no longer knocks it out of eligibility, which "top of the stack" used to
// require. A locked shape, one turned into something other than paint, or one whose frame cannot be
// read is skipped; nothing eligible means the next stroke opens a fresh layer -- never a guess.
function _rapierPaintEligiblePaint(shape) {
	return !!shape && shape.recognized === 'paint' && !shape.locked && !!shape.raster && !!shape.geom && !!_rapierPaintTargetFrame(shape);
}
function _rapierPaintTarget() {
	const state = _rapierDrawState;
	// The person's chosen paint identity (Astra-R75 P01): `state.paintChosenId` is owned by
	// `_rapierDrawSetSelection` (draw.js) alone, and outlives the on-canvas selection that Paint
	// itself clears on every stroke -- so choosing the lower of two paintings, then painting three
	// strokes, keeps targeting the lower one instead of drifting to whatever is topmost the moment
	// the visual selection is gone. It is forgotten -- falling through to the topmost-eligible
	// default below -- the moment it is no longer a real choice: removed, locked, turned into
	// something other than paint, or its frame no longer reads (each already covered by
	// `_rapierPaintEligiblePaint`); a fresh document forgets it explicitly (`_rapierDrawOpenSurface`).
	if (state.paintChosenId != null) {
		const shape = _rapierDrawShapeById(state.paintChosenId);
		if (_rapierPaintEligiblePaint(shape)) return shape;
		state.paintChosenId = null;
	}
	const shapes = state.recipe?.shapes || [];
	for (let i = shapes.length - 1; i >= 0; i--) if (_rapierPaintEligiblePaint(shapes[i])) return shapes[i];
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
// original whole-canvas-surface, byte-identical continuation; every other case maps pointer samples
// through this frame's inverse into the target's own pixels (P04's fix, stated exactly).
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
	// B03: a real transform, however small (1 %), is a transform; float noise from the frame's own
	// arithmetic is not (an exact comparison here made every reopened piece and every grown paper a
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
// Astra-R75 P06: how far outside a transformed target's own padded surface a sample may still land
// (raster pixels) before it is honestly unreachable rather than merely "near the edge" -- generous
// enough that a wide, soft brush whose dab centre sits just past the pad's own boundary is never
// mistaken for off-target.
const RAPIER_PAINT_REACH_FRINGE = 48;
// The target's own identity (Astra-R75 P03): a content digest of its raster, not just its length --
// two different paintings the same size in bytes must never read as the same target -- alongside
// its id and its exact geometry (a move, resize or rotate is a different key even at the same id).
function _rapierPaintTargetKey(shape) { return shape.id + ':' + (shape.raster ? _rapierPaintDigest(shape.raster) : '0') + ':' + JSON.stringify(shape.geom); }
// The immutable dependency of ONE member of a grouped painting being decoded (R87j P02). A decode
// carries pixels computed FROM a member, so everything that decides which pixels those are has to
// be part of its identity: `_rapierPaintTargetKey`'s id/content/geometry, plus the raster grid that
// geometry maps (`px`), the scale it was painted at, the group it belongs to, and whether it is
// still eligible paint at all. A member locked, un-painted or re-pixelled between request and
// resolution is a CHANGED member even at the same id, raster and box.
function _rapierPaintMemberKey(shape) {
	const px = shape?.paint?.px;
	return _rapierPaintTargetKey(shape) + '|' + (Array.isArray(px) ? px.join('x') : '?') + '|' + (shape?.paint?.scale ?? '?')
		+ '|' + (shape?.paint?.group ?? '?') + '|' + JSON.stringify(shape?.effect || null) + '|' + (_rapierPaintEligiblePaint(shape) ? '1' : '0');
}
// Every OTHER piece of `target`'s painting, in recipe order: a painting kept in lossless pieces is
// ONE painting (the picture-format law, R86e), so picking any piece up reopens the whole group.
// Factored out of `_rapierPaintRehydrateFor` so the membership can be read at request time and read
// AGAIN the instant the decode resolves, against whatever the recipe is by then -- the two readings
// are the same question asked twice, never two slightly different filters. Pieces are matched by id
// rather than object identity: a recipe rebuilt around an equal-id primary must not fold that
// primary into its own group.
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
// locked is the same single changed fact -- never "the primary is still fine, carry on", which is
// what let a stale sibling's pixels be copied over a changed one and its id retired (R87j P02).
function _rapierPaintGroupKey(target, members) {
	return [target, ...members].map(_rapierPaintMemberKey).join(';');
}
// Whether the open layer can still take another stroke: its shape is on the canvas, unlocked, and
// exactly what the layer last wrote (undo, a move or an edit makes it a different picture) -- and,
// for an already-committed layer, still the resolved target (P04: painting a different selected or
// last-painted shape invalidates whatever was open before).
function _rapierPaintLayerValid(forMaterialTool = false, geom = null) {
	const layer = _rapierPaintLayer(), state = _rapierDrawState;
	if (!layer || layer.session !== state.session || !layer.surface) return false;
	// A layer warmed before the finger arrived is a convenience, never an admission: it is refused
	// the moment the drawing has anything in it, or any input its geometry was computed from has
	// moved (a zoom, a resize, a device-pixel-ratio change), so the stroke opens a fresh one.
	if (layer.warmView && (state.recipe.shapes.length || state.recipe.strokes.length || layer.warmView !== _rapierPaintWarmView(geom || undefined))) return false;
	// R86i, the layer-ownership fault two audits found independently and this lane reproduced in the
	// browser. SET and the 12-million-pixel rollover both finish the painting and open a CLEAN SHEET
	// over the picture they made -- which is the right durability design and stays. But a clean sheet
	// has `id == null` and so passed here, and a tool that works the material under it then had a
	// genuinely empty surface to work: the person saw a full painting and Smudge saw nothing. That is
	// the founder's "the tools feel fundamentally broken", with its cause.
	//
	// So: a material tool beginning on a sheet that holds no paint OF ITS OWN is not on a valid layer.
	// `_rapierPaintBegin` then resolves the painting beneath it through the ordinary target path, and
	// a painting set as several lossless pieces comes back as one layer (`paint.group`). A BRUSH is
	// untouched -- after SET a brush stroke is a new painting over the picture, exactly as
	// `paint-pieces-reopen-as-one` requires -- and once the clean sheet holds paint of its own, that
	// sheet is the material for everything, which is the seam named in docs/paint-tools.md §7.
	if (layer.id == null) return !(forMaterialTool && _rapierPaintTarget() && !layer.surface.bounds());
	const target = _rapierPaintTarget();
	if (!target || target.id !== layer.id) return false;
	return target.raster === layer.raster && JSON.stringify(target.geom) === layer.geom;
}
// A layer holds pixels the document does not. Closing it therefore COMMITS first, always, unless a
// person deliberately chose to discard them (_rapierPaintDiscardOverflow, wired into Undo).
//
// This is the law the R84 canvas-clearing bug broke, and it is the one that makes the whole class
// impossible: a layer is a VIEW onto work, the recipe is the work, and no view change -- a zoom, a
// canvas growth, a restage, a tool change -- may be able to destroy the work by discarding a view.
// `_rapierPaintOpenLayer` begins by closing, so before this guard existed every restage silently
// vaporised anything the raster budget had refused to commit; if the painting had never committed
// once, the canvas went empty and said DRAW WITH YOUR FINGER.
function _rapierPaintCloseLayer() {
	_rapierPaintFlushRevision();
	const state = _rapierDrawState, layer = state.paintLayer;
	if ((layer?.pendingOverflow || layer?.surface?.wetState) && !state.paintClosing) {
		state.paintClosing = true;
		try { _rapierPaintCommit(true); } catch (error) { showToast('The painting could not be kept. It is still open: ' + String(error?.message || error), 'error'); throw error; }
		finally { state.paintClosing = false; }
		if (state.paintLayer !== layer) return;
	}
	state.paintLayer = null;
	// The encoder may still finish, but it no longer owns this view or the next drawing's latch
	// (ZA3 F8): only the SET that actually holds this layer's own token is released here.
	if (state.paintSetting?.layer === layer) { state.paintSetting = false; _rapierPaintUpdateStrip(); }
	if (layer?.pngWorker) { layer.pngWorker.worker.terminate(); URL.revokeObjectURL(layer.pngWorker.url); layer.pngWorker = null; }
	if (layer?.raf) cancelAnimationFrame(layer.raf);
	if (layer?.holdRaf) cancelAnimationFrame(layer.holdRaf);
	if (layer?.dryRaf) cancelAnimationFrame(layer.dryRaf);
	if (layer?.mount) layer.mount.remove();
	if (layer?.id != null && state.svg) state.svg.querySelector('[data-shape-id="' + layer.id + '"]')?.removeAttribute('data-paint-live');
}
// Astra-R75 P06 (closed R77): the live overlay used to be a plain HTML sibling of the whole SVG
// (`state.svgRoot.after(canvas)`), so it necessarily painted above every shape while a stroke was
// down -- a lower translucent painting under upper paint or vector lettering drew above them mid-
// stroke and only dropped back to the settled order on release. An SVG `<foreignObject>` is the one
// standards mechanism that lets ordinary HTML content (the canvas) take a real place in an SVG's own
// paint order: mounted as a sibling of the target shape's own `<g>` inside `.rapier-draw-shapes`
// (right after it -- the target's own node is hidden throughout via `data-paint-live`, so which side
// it sits on does not matter, only what is above and below), it now shares the target's exact
// z-slot. A layer with no known target yet (a brand new stroke, or the queued-gesture fallback for a
// target whose decode failed) mounts at the END of the shape list -- the natural place for a shape
// that does not exist until commit, which then appends it there for real.
function _rapierPaintMountLive(canvas, atShapeId) {
	const mount = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
	mount.setAttribute('x', '0'); mount.setAttribute('y', '0');
	mount.style.overflow = 'visible';
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
	const layer = _rapierDrawState.paintLayer;
	if (!layer?.mount || !layer.canvas) return;
	_rapierPaintPositionMount(layer.mount, layer.id);
	_rapierPaintShowLive(layer.canvas.style.visibility !== 'hidden', layer);
}
// The paper is what is seen (R78, the founder: strokes were cut off at a square canvas inside a
// portrait phone). A whole-canvas layer covers the union of the drawing's canvas and the visible
// stage, in canvas units, with an origin at that union's top-left (never above 0,0); a stroke
// committed beyond the canvas grows the canvas to hold it (`_rapierDrawGrowCanvas`).
// The margin a live layer keeps OUTSIDE the visible stage, in drawing units. Without it the surface
// ends exactly where the canvas does, so a dab centred on the edge loses the half of its footprint
// that falls past it and the mark is sliced flat against a straight vertical or horizontal line --
// the founder, painting near the edges on their phone: "you can visibly see your brushes being cut
// off." A brush is a disc, not a pixel: it must have room to land with its whole width on the edge
// of the paper. The margin is never committed (the kept raster is `surface.bounds()`, the painted
// box), so it costs working memory during a stroke and nothing at all afterwards.
const RAPIER_PAINT_EDGE_PAD = 56;
function _rapierPaintStageUnion(recipe, pad = RAPIER_PAINT_EDGE_PAD) {
	const state = _rapierDrawState, svg = state.svgRoot;
	let x0 = 0, y0 = 0, x1 = recipe.canvas.w, y1 = recipe.canvas.h;
	if (svg) {
		const rect = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
		if (rect.width && rect.height && vb.width && vb.height) {
			// R83: the WHOLE WINDOW, not the stage's own rectangle. A finger keeps painting wherever it
			// goes once the gesture has it -- over the toolbar, past the top of the glass -- and the
			// surface ended at the stage, so the mark was sliced flat exactly there. The founder, three
			// times: "I've swiped my finger up to the top and the canvas has automatically cut off my
			// brush stroke." Every point a pointer can reach is now inside the paper, and the pad is
			// still there for the brush's own width at the very corner. The margin is never committed:
			// what is kept is `surface.bounds()`, the painted box, so this costs working memory during
			// a stroke and nothing at all in the file.
			const a = _rapierDrawMapPoint(0, 0, rect, vb), b = _rapierDrawMapPoint(innerWidth, innerHeight, rect, vb);
			x0 = Math.min(x0, Math.floor(a[0])); y0 = Math.min(y0, Math.floor(a[1])); x1 = Math.max(x1, Math.ceil(b[0])); y1 = Math.max(y1, Math.ceil(b[1]));
		}
	}
	return { x0: x0 - pad, y0: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}
function _rapierPaintOpenLayer(scale = _rapierPaintLayerScale(), atShapeId = null) {
	const state = _rapierDrawState, recipe = state.recipe;
	_rapierPaintCloseLayer();
	let union = _rapierPaintStageUnion(recipe);
	// R84, REVERTED after it destroyed a person's work. The version here shrinks the layer back to
	// the CANVAS BOX when the union will not fit, and that is deliberate: the canvas box is the one
	// region the committed painting is guaranteed to live inside.
	//
	// What was tried and taken out: keeping the whole-window union and buying the area back by
	// dropping `scale`, then, below scale 1, shrinking the union about the STAGE'S centre. The second
	// step is the fatal one. `layer.origin` is that union's corner, and a commit writes back only what
	// the layer holds -- so the moment the union stops containing the existing painting, the parts
	// outside it are gone. The founder, on the build that shipped it: "I kept drawing and then I
	// zoomed a little and then all of a sudden the whole canvas cleared."
	//
	// The edge crop this was meant to fix is real and still owed, but it loses a brush's outer edge;
	// this lost the picture. A layer may never be smaller than the work it is holding, and any future
	// attempt at the crop has to start from that, not from the reachable area.
	let w = Math.max(1, Math.round(union.w * scale)), h = Math.max(1, Math.round(union.h * scale));
	if (w * h > RAPIER_PAINT_AREA_MAX * 2) {
		union = { x0: -RAPIER_PAINT_EDGE_PAD, y0: -RAPIER_PAINT_EDGE_PAD, w: recipe.canvas.w + RAPIER_PAINT_EDGE_PAD * 2, h: recipe.canvas.h + RAPIER_PAINT_EDGE_PAD * 2 };
		w = Math.max(1, Math.round(union.w * scale)); h = Math.max(1, Math.round(union.h * scale));
	}
	if (w * h > RAPIER_PAINT_AREA_MAX * 2) { union = { x0: 0, y0: 0, w: recipe.canvas.w, h: recipe.canvas.h }; w = Math.max(1, Math.round(union.w * scale)); h = Math.max(1, Math.round(union.h * scale)); }
	if (w * h > RAPIER_PAINT_AREA_MAX * 2) throw new Error('Canvas is too large to paint on');
	const surface = new PaintSurface(w, h, {wet: RAPIER_PAINT_WET});
	surface.paper = RAPIER_PAINT_PAPER;
	surface.scale = scale / RAPIER_PAINT_GRAIN;
	const canvas = document.createElement('canvas');
	canvas.className = 'rapier-draw-paint-live'; canvas.width = w; canvas.height = h; canvas.setAttribute('aria-hidden', 'true');
	// The overlay holds every pixel of the surface at all times. An EMPTY one is safe to leave
	// showing -- there is nothing on it to double with the committed picture -- so a fresh layer's
	// overlay does not wait for the stroke to make it visible; a decoded target's still must, because
	// its own translucent pixels would add to the <image> underneath.
	canvas.style.visibility = atShapeId == null ? '' : 'hidden';
	const ctx = canvas.getContext('2d');
	// One transparent pixel, before the canvas is in the document: it asks the browser for the 2D
	// backing store now rather than on the frame the first dab is waiting for. It changes nothing
	// that can be seen, and it is NOT proof the real allocation happened -- only a device measurement
	// is that.
	ctx.putImageData(new ImageData(1, 1), 0, 0);
	const mount = _rapierPaintMountLive(canvas, atShapeId);
	if (!Object.getOwnPropertyDescriptor(state.surface, 'rapierPaintFacts')) Object.defineProperty(state.surface, 'rapierPaintFacts', { enumerable: false, get: _rapierPaintFacts });
	surface.tilt(_rapierPaintTilt.gx, _rapierPaintTilt.gy); _rapierPaintTiltOn();
	const layer = { session: state.session, surface, canvas, mount, ctx, scale, id: null, raster: null, geom: null, brush: null, brushId: null, raf: 0, holdRaf: 0, dryRaf: 0, dryAt: 0, frame: null, origin: [union.x0, union.y0], setPending: true };
	state.paintLayer = layer;
	_rapierPaintWatchOverlay(layer);
	_rapierPaintPlaceLive();
	return layer;
}
// A transformed target's own live layer: sized to its native raster plus growth padding, not the
// whole canvas -- `layer.frame` carries the affine map every pointer sample and every commit reads.
function _rapierPaintOpenLocalLayer(frame, atShapeId = null) {
	const state = _rapierDrawState;
	_rapierPaintCloseLayer();
	const pad = _rapierPaintFramePad(frame.pw, frame.ph, frame.scale);
	const w = Math.max(1, Math.round(frame.pw + pad * 2)), h = Math.max(1, Math.round(frame.ph + pad * 2));
	if (w * h > RAPIER_PAINT_AREA_MAX * 2) throw new Error('Painting is too large to reopen for painting');
	const surface = new PaintSurface(w, h, {wet: RAPIER_PAINT_WET});
	surface.paper = RAPIER_PAINT_PAPER;
	surface.scale = frame.scale / RAPIER_PAINT_GRAIN;
	const canvas = document.createElement('canvas');
	canvas.className = 'rapier-draw-paint-live'; canvas.width = w; canvas.height = h; canvas.setAttribute('aria-hidden', 'true');
	canvas.style.visibility = 'hidden';
	const ctx = canvas.getContext('2d');
	ctx.putImageData(new ImageData(1, 1), 0, 0);
	const mount = _rapierPaintMountLive(canvas, atShapeId);
	if (!Object.getOwnPropertyDescriptor(state.surface, 'rapierPaintFacts')) Object.defineProperty(state.surface, 'rapierPaintFacts', { enumerable: false, get: _rapierPaintFacts });
	surface.tilt(_rapierPaintTilt.gx, _rapierPaintTilt.gy); _rapierPaintTiltOn();
	const layer = { session: state.session, surface, canvas, mount, ctx, scale: frame.scale, id: null, raster: null, geom: null, brush: null, brushId: null, raf: 0, holdRaf: 0, dryRaf: 0, dryAt: 0, frame: { ...frame, pad }, setPending: true };
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
function _rapierPaintPlaceLive() {
	const state = _rapierDrawState, layer = state.paintLayer;
	if (!layer?.mount || !layer.canvas) return;
	const mount = layer.mount, canvas = layer.canvas, w = canvas.width, h = canvas.height;
	mount.setAttribute('width', w); mount.setAttribute('height', h);
	canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
	const f = layer.frame;
	const matrix = f
		? [f.eux, f.euy, f.evx, f.evy, f.c0[0] - f.pad * f.eux - f.pad * f.evx, f.c0[1] - f.pad * f.euy - f.pad * f.evy]
		: [1 / layer.scale, 0, 0, 1 / layer.scale, layer.origin?.[0] || 0, layer.origin?.[1] || 0];
	mount.setAttribute('transform', 'matrix(' + matrix.map(n => (Number.isFinite(n) ? n : 0)).join(',') + ')');
}
// The overlay's pixels are the browser's to take. A phone short of GPU memory -- a big painting is exactly that --
// drops a 2D canvas's backing store (`contextlost`) and hands the canvas back blank (`contextrestored`), and the
// blit only ever repaints the dirty box, so the overlay stayed blank for good: every touch-down then hid the kept
// picture behind an empty sheet until the lift brought it back (the founder: "every time you put your finger down
// to go and paint, the whole painting disappears until you lift your finger again"). While the store is gone the
// kept picture does not step aside (`_rapierPaintShowLive`); when it returns, the whole layer is painted again.
function _rapierPaintWatchOverlay(layer) {
	layer.canvas.addEventListener('contextlost', () => { layer.lost = true; _rapierPaintShowLive(layer.canvas.style.visibility !== 'hidden', layer); });
	layer.canvas.addEventListener('contextrestored', () => {
		layer.lost = false;
		if (_rapierDrawState.paintLayer !== layer) return;
		const surface = layer.surface;
		surface.dirty = { x0: 0, y0: 0, x1: surface.width - 1, y1: surface.height - 1 };
		_rapierPaintBlit();
		_rapierPaintShowLive(layer.canvas.style.visibility !== 'hidden', layer);
	});
}
function _rapierPaintOverlayLost(layer) { return !!layer?.lost || !!layer?.ctx?.isContextLost?.(); }
function _rapierPaintBlit() {
	const layer = _rapierPaintLayer();
	if (!layer) return;
	layer.raf = 0;
	const box = layer.surface.takeDirty();
	if (!box) return;
	const px = layer.surface.toRGBA8(box);
	layer.ctx.putImageData(new ImageData(px.data, px.width, px.height), box.x0, box.y0);
	if (layer.setPending) { layer.setPending = false; _rapierPaintAfterFrame(_rapierPaintSyncSet); }
	const timing = _rapierDrawState.paintTiming;
	if (timing && timing.seat && !timing.blit) timing.blit = performance.now();
}
// Housekeeping that must not stand between the finger and the first mark. Two frame boundaries,
// because a blit that ran synchronously is still ahead of the browser's next render opportunity;
// the session is rechecked, so nothing from a closed surface runs against a new one.
function _rapierPaintAfterFrame(update) {
	const state = _rapierDrawState, session = state.session;
	requestAnimationFrame(() => requestAnimationFrame(() => { if (state.open && state.session === session) update(); }));
}
// ---- Drying (R79) ---------------------------------------------------------------------------
// A wet stroke is NOT committed when the finger lifts. Under the finger the physics is owed, not
// run (`surface.wetPending`), so the mark shows at once but the water has not moved yet; on release
// this loop hands the surface that owed time a slice at a time and blits every frame, which is when
// a wash visibly blooms, its rim darkens and the tooth takes the pigment. When the paper is dry the
// stroke commits itself: one `paint` shape, one history step, exactly as a dry stroke does.
//
// A second stroke laid while the paper is still wet simply joins the same wash -- the layer is
// still live and uncommitted, so the two strokes settle into one another and share that one history
// step. Every path that would end the layer (Undo, a tool change, Done, closing Draw, the canvas
// following the stage) flushes first, so a drying stroke is committed rather than lost.
function _rapierPaintScheduleDry(layer) {
	if (!layer || layer.dryRaf || !layer.surface.wetState) return;
	layer.dryAt = performance.now();
	layer.dryRaf = requestAnimationFrame(() => _rapierPaintDryTick(layer));
}
function _rapierPaintDryTick(layer) {
	const state = _rapierDrawState;
	layer.dryRaf = 0;
	if (state.paintLayer !== layer || !layer.surface.wetState) return;
	// A finger is down: that stroke owns the layer. Wait for it rather than dropping the loop -- the
	// paper is still wet either way, and a dropped loop is a wash that never commits itself.
	if (state.gesture) { layer.dryRaf = requestAnimationFrame(() => _rapierPaintDryTick(layer)); return; }
	const now = performance.now();
	layer.dryAt = now;
	// Drying time is fed at a fixed rate, not taken from the clock: a budget under the real frame
	// time used to grow a backlog that never committed. A slow phone simply dries slower.
	// A pointer already queued owns the frame. One solver step is not sliced, but it is not started,
	// and the paper is not settled, while the finger is waiting. Where the host cannot say, the
	// budget is the slice.
	const inputWaiting = () => { try { return !!navigator.scheduling?.isInputPending?.({includeContinuous: true}); } catch (_) { return false; } };
	const until = now + RAPIER_PAINT_DRY_BUDGET;
	if (!inputWaiting()) {
		do {
			if (inputWaiting()) break;
			layer.surface.stepWet(RAPIER_PAINT_DRY_FEED, RAPIER_PAINT_DRY_FEED + RAPIER_PAINT_DRY_SLICE);
			if (inputWaiting()) break;
		} while ((layer.surface.wet || layer.surface.wetPending) && performance.now() < until);
	}
	if (inputWaiting()) { layer.dryRaf = requestAnimationFrame(() => _rapierPaintDryTick(layer)); return; }
	layer.surface.composeWet(true);
	_rapierPaintBlit();
	if (inputWaiting()) { layer.dryRaf = requestAnimationFrame(() => _rapierPaintDryTick(layer)); return; }
	if (layer.surface.wet || layer.surface.wetPending) { layer.dryRaf = requestAnimationFrame(() => _rapierPaintDryTick(layer)); return; }
	if (inputWaiting()) { layer.dryRaf = requestAnimationFrame(() => _rapierPaintDryTick(layer)); return; }
	layer.surface.settleWet();
	_rapierPaintBlit();
	_rapierPaintCommit();
}
// Dry the paper now and commit what is on it: the settlement every path that ends a live layer owes
// a stroke still drying on it. `settleWet` finishes the physics exactly (every suspended band
// settles, the water goes), so the committed pixels are the ones the drying would have reached.
function _rapierPaintFlushWet() {
	_rapierPaintFlushRevision();
	const layer = _rapierPaintLayer();
	if (!layer?.surface?.wetState) return false;
	if (layer.dryRaf) { cancelAnimationFrame(layer.dryRaf); layer.dryRaf = 0; }
	layer.surface.settleWet();
	_rapierPaintBlit();
	_rapierPaintCommit();
	_rapierPaintFlushRevision();
	return true;
}
function _rapierPaintScheduleBlit() {
	const layer = _rapierPaintLayer();
	if (layer && !layer.raf) layer.raf = requestAnimationFrame(_rapierPaintBlit);
}
// The stroke shows on the overlay (every pixel of the layer, the new dabs included) and the committed
// <image> of the same layer steps aside; at commit they swap back. Both never show at once (a
// translucent edge would double) and never both hide (a mark would vanish).
function _rapierPaintShowLive(on, layer = _rapierDrawState.paintLayer) {
	const state = _rapierDrawState;
	if (!layer?.canvas || state.paintLayer !== layer) return;
	const visibility = on ? '' : 'hidden';
	if (layer.canvas.style.visibility !== visibility) layer.canvas.style.visibility = visibility;
	// An overlay whose pixels the browser took away shows nothing: the kept picture stays up under it.
	const aside = on && !_rapierPaintOverlayLost(layer);
	if (layer.id != null) { const g = state.svg?.querySelector('[data-shape-id="' + layer.id + '"]'); if (g) { if (aside) g.setAttribute('data-paint-live', ''); else g.removeAttribute('data-paint-live'); } }
}
// A brush a person brings is theirs, and the file they get back out is the file they brought in --
// `_rapierPaintExportBrush` writes the stored `.myb` untouched. But a preset written for a stylus on
// a desk does not necessarily work under a thumb, and the two ways it fails are known (R79, found by
// painting): it can refuse to paint on bare paper at all, and it can lay its dabs so sparsely that
// one finger pass is a row of separate dots where the author expected many careful passes. Rapier
// repairs exactly those two, on the brush it loads and never on the file it keeps, and the person
// can switch it off for the brush they are holding. Factory presets are never touched: MyPaint's
// own pack paints here exactly as its author tuned it.
const RAPIER_PAINT_FINGER_DABS = 1.5;
function _rapierPaintFitFinger(def, finger) {
	const at = RAPIER_PAINT_SETTING_AT, changed = [];
	// R83, the founder: "I don't want any of the presets to be stylus-only. Every single preset
	// should be Rapierized... The magic finger approach is what we're going for."
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
function _rapierPaintBrushFor(layer, id) {
	// Cached against the dip as well as the id -- a re-dipped brush is a different brush, and the
	// cached one would otherwise keep painting the old dip for the rest of the session. The dip lives
	// in its own field: `brushId` is written into the saved shape as the brush that painted it and
	// must stay the plain preset id.
	const dip = _rapierPaintDipKey(id);
	if (layer.brush && layer.brushId === id && layer.brushDip === dip) return layer.brush;
	layer.brush = null;
	const def = _rapierPaintDefFor(id);
	layer.brush = new PaintBrush(def); layer.brushId = id; layer.brushDip = dip; layer.brushRadius = def.settings[3].base;
	return layer.brush;
}

// ---- Gesture ----------------------------------------------------------------------------------------
// World canvas coordinates, mapped through the live layer's own frame when it has one (P04): a
// transformed target's pointer samples land in its own pixels, not the page's, so a resize, rotate
// or move since it was painted changes nothing about how a stroke feels.
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
	// before comparing against MyPaint's barrel_rotation input, Astra-R75 P06: "twist is not
	// forwarded" -- it previously never reached strokeTo at all).
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
	// The gesture's own admitted strength (Astra-R75 P03), not whatever the strip currently reads --
	// a toggle tapped mid-stroke (or while a stroke is still queued on a decode) never reaches back
	// into a gesture already under way. Read once, here, so both the real-touch branch below and the
	// simulated-speed model share one definition of what Firm/Light mean (R77, F77-1): the strength
	// toggle's two states are the person's own pressure for every preset -- Firm reaches this band's
	// own top end, Light this band's own top end is lower still -- and it is each preset's own
	// pressure-input curve (opaque_multiply, smudge_length_log and the rest) that decides what its
	// own hard and soft actually do; the adapter never special-cases a brush.
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
	// actually moved this session; none of them returns early. The first cut branched on the patch and
	// returned inside it, so a panel reporting a CONSTANT 14x14 contact -- which many do -- made the
	// raw pressure branch unreachable even while that pressure swung 0.1 to 0.9 (Codex R81). Contact
	// diameter is not force; a reading that never varies is not evidence of anything.
	//
	// Authority runs speed < patch < pressure: speed is an inference about the hand, the patch a proxy
	// for it, a reported force the thing itself -- so each is folded over the last by its own trust.
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
		// Belief is earned by VARIATION, and only by variation. Trusting a single reading was tried at
		// R81 and is wrong for the reason Codex named: a contact diameter is not a force, and the
		// panels that matter report a placeholder -- the emulated digitizer here reports a constant
		// 16x16 with a constant pressure of 0.6, and a real Motorola reports much the same. A constant
		// says the finger is there, nothing about how hard it is pressing, and reading it as an
		// absolute position in a fingertip band silently turned every firm stroke into a light one
		// (Blender's drag fell from 36.6 to 1.1 under exactly that rule).
		const trust = _rapierDrawClamp((seen.hi - seen.lo) / RAPIER_PAINT_PATCH_TRUST, 0, 1);
		value += (_rapierPaintFeel(q, level) - value) * trust;
		if (trust > .5) from = 'patch';
	}
	if (evt.pointerType === 'touch' && Number.isFinite(evt.pressure) && evt.pressure > 0) {
		const seen = _rapierPaintTouchSeen;
		seen.min = Math.min(seen.min, evt.pressure); seen.max = Math.max(seen.max, evt.pressure);
		// R77 (F77-1): this finger's own hardest press this session maps to 1, its own lightest to
		// 0 -- reached, not assumed -- then through the same feel curve as every other signal. Graded
		// rather than a threshold, so a panel whose pressure is slowly proving itself is not ignored
		// entirely and then trusted wholly one sample later.
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
// ---- Stationary time (Astra-R74 P07) ---------------------------------------------------------------
// A preset can spend dabs on held time alone (`dabs_per_second`, the fountain pens): libmypaint
// advances that on every motion event, however small, and Rapier's gesture only fires those on
// down/move/up -- a hand that rests mid-stroke never generates one, so a held fountain nib stayed
// dry. Only presets that declare `dabs_per_second` schedule this; every other brush is untouched,
// and the loop advances the SAME `paint.last` clock a real move event would, so held time is never
// counted twice. It runs only while the gesture is still the live one and stops the moment it isn't
// -- pointer up, cancel, a lost pointer or a hidden page all end the gesture first (draw.js), which
// is what actually stops it; the checks here are the belt to that buckle.
function _rapierPaintHoldNeeded(brush) { try { return brush.getBaseValue('dabs_per_second') > 0; } catch (_) { return false; } }
function _rapierPaintScheduleHold(gesture) {
	const layer = _rapierPaintLayer(), paint = gesture?.paint;
	if (!layer || !paint || !paint.holdNeeded || paint.pending || layer.holdRaf) return;
	layer.holdRaf = requestAnimationFrame(() => _rapierPaintHoldTick(gesture));
}
function _rapierPaintHoldTick(gesture) {
	const state = _rapierDrawState, layer = _rapierPaintLayer(), paint = gesture?.paint;
	if (layer) layer.holdRaf = 0;
	if (!layer || !paint || paint.pending || state.gesture !== gesture) return;
	// paint.last lives in the pointer event clock (evt.timeStamp), which a real move or end event
	// keeps advancing in the same domain; performance.now() is read here only through the fixed
	// offset measured at the gesture's first event, so a held stroke's dt and a moved stroke's dt
	// are never counted against two different clocks (or against each other twice).
	const now = performance.now() - paint.clockOffset, dt = _rapierDrawClamp((now - paint.last) / 1000, 0.001, 0.5);
	paint.last = now;
	// The last REAL tilt and twist a move or the initial dab reported (Astra-R75 P06: a held tick
	// used to reset both to 0, so a stylus held still at an angle read as flat the moment it stopped
	// moving); a held hand does not typically change its angle, so holding the last real reading is
	// the honest value, not a fabricated one.
	// Where the MARK ends, not where the hand is: the frontier sample the lift lag last released. The
	// landing envelope is NOT reapplied here -- it is a function of travel, a held hand has none, and
	// charging it again would hold a dwelling brush at the landing floor for as long as it rested.
	const at = paint.drawn;
	const hx = at ? at.p.x : paint.x, hy = at ? at.p.y : paint.y;
	const htx = at ? at.p.tiltX : paint.tiltX, hty = at ? at.p.tiltY : paint.tiltY, hw = at ? at.p.twist : paint.twist;
	paint.brush.strokeTo(layer.surface, hx * RAPIER_PAINT_GRAIN, hy * RAPIER_PAINT_GRAIN, paint.pressure, htx, hty, dt, 1, 0, hw);
	_rapierPaintScheduleBlit();
	_rapierPaintScheduleHold(gesture);
}
// ---- Beginning, continuing and ending a stroke -----------------------------------------------------
// The gesture's own admitted facts (Astra-R75 P03): read once, the instant the gesture begins --
// never again from whatever the strip or the clock currently say -- so a brush, colour, size or
// strength changed while a stroke waits on a decode can never reach back into that stroke. A fresh
// seed is minted here (not inside init) for the same reason: one admitted seed per gesture, not one
// per replay.
function _rapierPaintAdmitSettings(erasing) {
	// Erasing is an ordinary paint gesture with the eraser preset and the ERASE tool's own radius --
	// the same width its live ring shows -- so the two tools agree about how big the eraser is.
	if (erasing) {
		const r = _rapierDrawEraseRadius();
		return { brushId: RAPIER_PAINT_ERASER_ID, color: _rapierPaintColor(), radiusOffset: Math.log(Math.max(2, r * RAPIER_PAINT_GRAIN)) - RAPIER_PAINT_ERASER_LOGR, strength: 'firm', touch: 0, edgeSoftness: _rapierDrawEraseSoftness() / 100, seed: (Math.random() * 0x3fffffff) | 0, erasing: true };
	}
	return { brushId: _rapierPaintBrushId(), color: _rapierPaintColor(), radiusOffset: _rapierPaintRadiusOffset(_rapierPaintSize()), strength: _rapierDrawState.paintStrength === 'light' ? 'light' : 'firm', touch: _rapierPaintTouchLevel(_rapierPaintBrushId(), _rapierDrawState.paintStrength === 'light'), seed: (Math.random() * 0x3fffffff) | 0 };
}
// Sets up the brush and plants the first dab on whatever layer is already open (state.paintLayer),
// entirely from the gesture's own admitted `settings` and `geom` (never read fresh here): the fast
// synchronous path (a fresh blank layer, or a layer already picked up) and the queued path (P02,
// below) both land here once a live surface is ready.
// A second finger abandons only the live stroke. Older wet paint, layer growth and history
// return to their exact pre-stroke state; no encode of the abandoned pixels may arrive later.
function _rapierPaintStrokeCheckpoint(gesture, layer) {
	const state = _rapierDrawState;
	_rapierPaintFlushRevision(layer);
	const props = {};
	for (const key of ['id', 'raster', 'geom', 'origin', 'frame', 'retire', 'checkpoint', 'pendingOverflow', 'setPending', 'paintVersion', 'joinsStroke']) props[key] = _rapierDrawHistoryCopy(layer[key]);
	gesture.paintRollback = {layer, props, pixels: layer.surface.beginStroke(), recipe: _rapierDrawHistoryRecipe(), undo: state.undoStack.slice(), redo: state.redoStack.slice(), view: {..._rapierDrawView()}};
}
function _rapierPaintReleaseStroke(gesture, cancel = false) {
	const saved = gesture.paintRollback, state = _rapierDrawState;
	if (gesture.paint?.pending) gesture.paint.discarded = true;
	if (!saved) return;
	delete gesture.paintRollback;
	if (!cancel) { saved.layer.surface.endStroke(saved.pixels); return; }
	const layers = new Set([saved.layer, state.paintLayer].filter(Boolean));
	for (const layer of layers) {
		for (const key of ['raf', 'holdRaf', 'dryRaf']) { if (layer[key]) cancelAnimationFrame(layer[key]); layer[key] = 0; }
		for (const job of layer.revisions || []) { clearTimeout(job.timer); job.resolve(); }
		layer.revisions = []; layer.pendingCommit = null;
		if (layer.pngWorker) { layer.pngWorker.worker.terminate(); URL.revokeObjectURL(layer.pngWorker.url); layer.pngWorker = null; }
		layer.mount?.remove();
	}
	state.paintSetting = false;
	const layer = saved.layer;
	layer.surface.endStroke(saved.pixels, true);
	Object.assign(layer, saved.props);
	state.paintLayer = layer; state.recipe = _rapierDrawRestoreRecipe(saved.recipe);
	state.undoStack = saved.undo; state.redoStack = saved.redo; state.view = saved.view;
	layer.canvas.width = layer.surface.width; layer.canvas.height = layer.surface.height;
	layer.mount = _rapierPaintMountLive(layer.canvas, layer.id);
	_rapierPaintPlaceLive(); _rapierPaintScheduleBlit();
	if (layer.surface.wetState) _rapierPaintScheduleDry(layer);
}
function _rapierPaintInitStroke(evt, gesture, settings, geom) {
	let layer = _rapierDrawState.paintLayer;
	_rapierPaintStrokeCheckpoint(gesture, layer);
	// The warm view is spent the instant a real gesture takes it: from here it is an ordinary layer.
	delete layer.warmView;
	const id = settings.brushId, brush = _rapierPaintBrushFor(layer, id);
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
	brush.reset(); brush.newStroke();
	const p = _rapierPaintEventPoint(evt, geom, layer);
	const holdNeeded = _rapierPaintHoldNeeded(brush);
	// This brush's own width decides how far it lands and lifts over -- in drawing units, since the
	// samples are, and the brush works at RAPIER_PAINT_GRAIN of them.
	const reach = Math.exp(layer.brushRadius + settings.radiusOffset) / RAPIER_PAINT_GRAIN;
	gesture.paint = { brush, last: p.t, clockOffset: performance.now() - p.t, x: p.x, y: p.y, tiltX: p.tiltX, tiltY: p.tiltY, twist: p.twist, geom, points: 0, brushId: id, scale: layer.scale, q: RAPIER_PAINT_SIM_START, pressure: 0, holdNeeded, pending: false, settings, reached: p.reach,
		// A WET brush holds back almost nothing. Its deposits carry water into the solver, so a held
		// tail lands all of that in one instant at the end: a synchronous burst of physics, and water
		// arriving at a time the hand never spent there. A wash's own bloom softens its end anyway --
		// wet media buy their lift from the physics, dry media from this queue.
		// The floors are ABSOLUTE and they matter more than the ratios: a hand lands and lifts over a
		// distance the HAND sets, not the brush. Scaled only by radius, Pen's lift came to 4.5 drawing
		// units -- shorter than the 14 units between two input samples -- so a thin brush had no room
		// for a taper to exist in, and measured 0.95 out where oil measured 0.41.
		travel: 0, tail: [], drawn: null, drained: false, reach, land: Math.max(RAPIER_PAINT_LAND_MIN, reach * RAPIER_PAINT_LAND),
		lift: brush.wet ? Math.max(1, reach * RAPIER_PAINT_LIFT_WET) : Math.max(RAPIER_PAINT_LIFT_MIN, reach * RAPIER_PAINT_LIFT) };
	const pressure = gesture.paint.pressure = _rapierPaintPressure(evt, gesture.paint, p);
	const seat = pressure * RAPIER_PAINT_SEAT;
	// The seat dabs go straight to the brush, not through `_rapierPaintSample`, so they used to be the
	// one place paint was laid with no chance to grow the surface first -- a stroke STARTED on the
	// edge was clipped before the lift lag released its first sample. That is why the edge witness
	// flapped between a clean brush edge and an 86% wall on the same build: it depended on how much of
	// the mark was seat and how much was sampled.
	layer = _rapierPaintGrowToHold(layer, gesture.paint, p) || layer;
	brush.strokeTo(layer.surface, p.x * RAPIER_PAINT_GRAIN, p.y * RAPIER_PAINT_GRAIN, seat, p.tiltX, p.tiltY, 0.0001, 1, 0, p.twist);
	brush.strokeTo(layer.surface, p.x * RAPIER_PAINT_GRAIN, p.y * RAPIER_PAINT_GRAIN, seat, p.tiltX, p.tiltY, 0.012, 1, 0, p.twist);
	if (timing && !timing.seat) timing.seat = performance.now();
	_rapierPaintScheduleBlit();
	if (holdNeeded) _rapierPaintScheduleHold(gesture);
}
// Replays a gesture that was queued while its target decoded (P02, P03): stale (a target, tool or
// document change since it was queued) discards silently rather than paint the wrong picture, with
// the exact settings and coordinate transform admitted back at queue time -- never whatever the
// strip, the clock or the screen currently read.
function _rapierPaintApplyQueued(gesture) {
	const state = _rapierDrawState, paint = gesture?.paint;
	// A gesture that ended normally already nulled state.gesture (draw.js _rapierDrawEndGesture), so
	// that identity is never the staleness test; `discarded` (set by the same function on an actual
	// cancel -- a tool switch, Undo/Redo, a lost pointer -- or by a changed target below) and the
	// target/tool/document facts captured at queue time are.
	if (!paint?.pending || paint.discarded || !state.open || state.session !== paint.session || _rapierDrawTool() !== paint.tool) return;
	paint.pending = false;
	const queued = paint;
	_rapierPaintInitStroke(queued.downEvt, gesture, queued.settings, queued.geom);
	if (queued.moveEvents.length) _rapierPaintMove(queued.moveEvents, gesture);
	if (queued.ended) _rapierPaintEnd(queued.endEvt, gesture);
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
	if (!paint?.pending || paint.discarded || !state.open || state.session !== paint.session || _rapierDrawTool() !== paint.tool) return;
	if (_rapierPaintIsMaterialTool(paint.settings?.brushId)) {
		// Every admitted mark lands or is refused in words (Astra-R75 P06): a browser without a JPEG XL
		// decoder reads no finished painting back, and a tool that works its paint has nothing to work.
		_rapierPaintDiscardChangedTarget(gesture);
		showToast('This browser could not read this painting back, so the stroke was not applied. The painting is unchanged.', 'info');
		return;
	}
	paint.pending = false;
	const queued = paint;
	_rapierPaintOpenLayer();
	_rapierPaintInitStroke(queued.downEvt, gesture, queued.settings, queued.geom);
	if (queued.moveEvents.length) _rapierPaintMove(queued.moveEvents, gesture);
	if (queued.ended) _rapierPaintEnd(queued.endEvt, gesture);
}
// One deliberate policy for a queued gesture whose target changed identity while its PNG decoded
// (Astra-R75 P03): discard the samples exactly as an explicit cancel would (the same `discarded`
// flag `_rapierDrawEndGesture` sets for a tool switch or Undo mid-decode), never paint them onto a
// surprise fresh layer -- that would put the person's touch on paint they never chose, which is
// exactly the "contrary to its own discard comment" the fallback above used to do for this case.
function _rapierPaintDiscardChangedTarget(gesture) {
	const paint = gesture?.paint;
	if (!paint || paint.discarded) return;
	paint.discarded = true; paint.pending = false;
}
// A finished painting is lossless JPEG XL. Read through an <img> and a 2D canvas its colour arrives
// premultiplied and loses straight colour at low alpha, so the layer picked back up would not be the layer
// at Done; ImageDecoder without premultiplication gives the exact straight RGBA. Null where the browser's
// ImageDecoder does not read JPEG XL: the <img> path below reads it, or the stroke falls back.
async function _rapierPaintDecodeStraight(raster) {
	const head = 'data:image/jxl;base64,';
	if (!raster.startsWith(head) || typeof ImageDecoder !== 'function' || !await ImageDecoder.isTypeSupported('image/jxl').catch(() => false)) return null;
	const decoder = new ImageDecoder({data: Uint8Array.from(atob(raster.slice(head.length)), c => c.charCodeAt(0)), type: 'image/jxl', premultiplyAlpha: 'none'});
	try {
		const {image} = await decoder.decode();
		try {
			const width = image.displayWidth, height = image.displayHeight, format = image.format;
			if (!['RGBA', 'RGBX', 'BGRA', 'BGRX'].includes(format)) return null;
			const data = new Uint8ClampedArray(width * height * 4);
			await image.copyTo(data, {rect: {x: 0, y: 0, width, height}, layout: [{offset: 0, stride: width * 4}]});
			if (format[0] === 'B') for (let q = 0; q < data.length; q += 4) { const b = data[q]; data[q] = data[q + 2]; data[q + 2] = b; }
			if (format[3] === 'X') for (let q = 3; q < data.length; q += 4) data[q] = 255;
			return {width, height, data};
		} finally { image.close(); }
	} finally { decoder.close(); }
}
// Decodes `target`'s own PNG back into a live surface -- the whole-canvas offset path for an
// untransformed target, the padded local-frame path (above) for a transformed one -- and, once it
// resolves, admits every gesture that was waiting on it (`waiters`; the ambient warm-up from
// `_rapierPaintWarmTarget` passes none). One decode in flight per exact target (id, raster, geom); a
// target that failed to decode is not retried. A new-document interruption (`state.session` moves
// on) or the target changing under a waiting gesture discards it instead of painting the wrong
// picture or a stale one (P02).
function _rapierPaintRehydrateFor(target, pendingGesture = null) {
	const state = _rapierDrawState;
	if (!state.open) { if (pendingGesture) _rapierPaintQueueFallback(pendingGesture); return; }
	const frame = _rapierPaintTargetFrame(target);
	if (!frame) { if (pendingGesture) _rapierPaintQueueFallback(pendingGesture); return; }
	const targetKey = _rapierPaintTargetKey(target), key = state.session + ':' + targetKey;
	if (state.paintRehydrate === key) { if (pendingGesture) (state.paintRehydrateWaiters = state.paintRehydrateWaiters || []).push(pendingGesture); return; }
	if (state.paintRehydrateFailed === key) { if (pendingGesture) _rapierPaintQueueFallback(pendingGesture); return; }
	state.paintRehydrate = key;
	// Whether the gesture that is waiting works the MATERIAL (R86i): a clean sheet over a picture is
	// a valid layer for a brush and not for a tool, so the check below has to ask the same question
	// `_rapierPaintBegin` asked, or the decode finishes and hands the tool the empty sheet after all.
	const material = _rapierPaintIsMaterialTool(pendingGesture?.paint?.settings?.brushId);
	const waiters = state.paintRehydrateWaiters = pendingGesture ? [pendingGesture] : [];
	const session = state.session, tool = _rapierDrawTool(), targetId = target.id;
	const settle = () => { if (state.paintRehydrate === key) { state.paintRehydrate = null; state.paintRehydrateWaiters = null; state.paintRehydrateTask = null; } };
	// A painting kept in lossless pieces (the picture-format law, R86e) is ONE painting: picking any
	// piece up reopens every piece of its group into the one layer, at each piece's own place, and
	// the commit retires the other pieces (their pixels are then the layer's). Otherwise a stroke run
	// from one piece into its neighbour would land below the neighbour's opaque paint and vanish
	// there. A transformed group (a local frame) is rare and is picked up piece by piece as before.
	const simple = _rapierPaintFrameIsSimple(frame);
	const group = simple ? _rapierPaintGroupMembers(target, frame) : [];
	// What this decode's pixels are computed FROM, read once, now (R87j P02). Required to still hold
	// below before a single pixel is copied or an id is written down for retirement.
	const groupKey = _rapierPaintGroupKey(target, group);
	const load = async shape => { const pixels = await _rapierPaintPNG.decode(shape.raster) || await _rapierPaintDecodeStraight(shape.raster); if (pixels) return {shape, pixels}; return new Promise((ok, no) => { const image = new Image(); image.onload = () => ok({ shape, image }); image.onerror = () => no(new Error('a painting could not be read back')); image.src = shape.raster; }); };
	state.paintRehydrateTask = Promise.all([load(target), ...group.map(load)]).then(loaded => {
		settle();
		try {
			if (!state.open || state.session !== session) { for (const g of waiters) _rapierPaintQueueFallback(g); return; }
			const again = _rapierDrawShapeById(targetId);
			if (!again || _rapierPaintTargetKey(again) !== targetKey) { for (const g of waiters) _rapierPaintDiscardChangedTarget(g); return; }
			// The WHOLE material's dependency, not just the primary's (R87j P02). `loaded` below holds
			// the sibling objects and the sibling PIXELS as they were when the Images were requested,
			// and `layer.retire` is about to write their ids down for the commit to remove. So a
			// sibling replaced, removed, added, moved, re-scaled or locked while those Images decoded
			// used to be invisible here: the primary's own key was untouched, the gate passed, the old
			// pixels went in and the current id was retired -- a new edit lost, or an explicit deletion
			// undone by resurrection. The membership is read again from the CURRENT recipe and must
			// match what was captured, before a layer is opened or a pixel is copied.
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
			// A valid layer already stands (a fresh one a failed decode fell back to, or this target's
			// own from an earlier pickup), or the tool moved on: the gestures that waited are still
			// applied -- onto that layer, or discarded by their own tool check -- never dropped on the
			// floor (R86e; before this they were, silently, and a stroke that waited on a decode while a
			// fallback opened a sheet was lost, against the R85b law).
			// A hardware eraser borrows this stroke, not the selected tool. A lift before decode
			// completes still needs the photo's material, even when the chosen tool is Select/Pen,
			// or it joined an ambient decode whose original request would accept a clean overlay.
			const erasing = waiters.some(g => g.eraseInk && g.paint?.pending && !g.paint.discarded && g.paint.tool === _rapierDrawTool());
			if (!(_rapierPaintToolPaints() || erasing) || _rapierPaintLayerValid(material || erasing)) { for (const g of waiters) _rapierPaintApplyQueued(g); return; }
			// Astra-R75 P06: mount the live layer at the target's OWN current place in the scene order
			// (`again.id`, the shape being picked back up), not the default top -- a lower painting keeps
			// painting under an upper vector or an upper painting even while a stroke is down.
			const layer = simple ? _rapierPaintOpenLayer(frame.scale, again.id) : _rapierPaintOpenLocalLayer(frame, again.id);
			for (const { shape, image, pixels } of loaded) {
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
			// The overlay carries the picked-up pixels too, so the next stroke shows them under its dabs.
			_rapierPaintBlit();
			layer.id = again.id; layer.raster = again.raster; layer.geom = JSON.stringify(again.geom); layer.brushId = again.paint?.brush || null;
			layer.retire = group.map(shape => shape.id);
			for (const g of waiters) _rapierPaintApplyQueued(g);
		} catch (_) { state.paintRehydrateFailed = key; _rapierPaintCloseLayer(); for (const g of waiters) _rapierPaintQueueFallback(g); }
	}, () => { settle(); state.paintRehydrateFailed = key; for (const g of waiters) _rapierPaintQueueFallback(g); });
}
// A lifted finger is completed work even while its target image is still decoding. Keep the
// existing decode as the barrier for Done, recovery and tool changes, not a second sample queue.
function _rapierPaintPendingStroke() {
	const state = _rapierDrawState;
	if (state.paintLayer?.pendingCommit) return state.paintLayer.pendingCommit.promise;
	return state.paintRehydrateWaiters?.some(g => g.paint?.pending && g.paint.ended && !g.paint.discarded)
		? state.paintRehydrateTask : null;
}
// Establishes the gesture's target and generation before admitting it (P02): rather than open an
// empty layer under a fast stroke while the real target is still decoding, the gesture's samples
// are buffered on `gesture.paint` and replayed once `_rapierPaintRehydrateFor` resolves (or falls
// back). `settings` and `geom` are the immutable record (P03), admitted by the caller the instant
// the gesture began -- identical to what the fast synchronous path admits below, just carried
// through the wait instead of being read again on the other side of it.
function _rapierPaintQueueGesture(target, evt, gesture, settings, geom) {
	const state = _rapierDrawState;
	gesture.paint = { pending: true, targetId: target.id, session: state.session, tool: _rapierDrawTool(), settings, geom, downEvt: evt, moveEvents: [], ended: false, endEvt: null };
	_rapierPaintRehydrateFor(target, gesture);
}
function _rapierPaintBegin(evt, gesture) {
	// The first dab's own clock (task #180, a measurement): when the stroke began, when its layer
	// stood, when its brush was ready, when the seat was laid, when the first frame showed it. Read
	// through rapierPaintFacts.timing by interaction-budgets and paint-first-dab-stages; costs
	// five timestamps.
	const timing = _rapierDrawState.paintTiming = { begin: performance.now(), layer: 0, brush: 0, seat: 0, blit: 0, opened: false };
	// Admitted once, here, for both paths below (P03): the fast synchronous path uses it at once: the
	// queued path (a decode still in flight) carries it through unread until replay.
	const settings = _rapierPaintAdmitSettings(gesture.eraseInk), geom = _rapierDrawPointerGeometry();
	if (!_rapierPaintLayerValid(_rapierPaintIsMaterialTool(settings.brushId), geom)) {
		const target = _rapierPaintTarget();
		if (target) { _rapierPaintQueueGesture(target, evt, gesture, settings, geom); return; }
		_rapierPaintOpenLayer();
		timing.opened = true;
	}
	timing.layer = performance.now();
	// The authority changes before any paint is laid; the chrome that shows it -- the handles and the
	// element menu -- follows the first mark rather than delaying it.
	const selected = _rapierDrawSelection().length;
	if (selected) _rapierDrawSetSelection([]);
	_rapierPaintInitStroke(evt, gesture, settings, geom);
	if (selected) _rapierPaintAfterFrame(() => { _rapierDrawMarkSelection(); _rapierDrawUpdateMenu(); });
}
// The landing is knowable as it happens; the lift is not, so `_rapierPaintMove` holds the newest
// RAPIER_PAINT_LIFT radii of travel back and `_rapierPaintEnd` draws them with the load falling to
// nothing. The mark trails the hand by a fraction of one brush width -- about 11 drawing units for
// the default oil -- and gains a tail that a mark ending at full width never had.
// R84. The surface GROWS to hold the stroke; it never clips it. The founder, having met a cut mark
// at the edge four times: "tldraw doesn't cut off strokes so let's get serious."
//
// tldraw cannot cut a stroke off because its drawn shapes are vectors on an unbounded page -- there
// is no edge to meet. Paint is pixels, so the edge is real, and every previous attempt tried to
// GUESS a region big enough in advance (the whole window, a pad, the stage union). Guessing is what
// keeps failing: a finger goes where it goes. So the region stops being a guess and follows the
// hand, one lossless reallocation at a time (`PaintSurface.grow`, which copies every pixel and keeps
// the paper's grain anchored under it).
//
// A transformed target grows on the same native pixel grid. Moving that grid's origin through its
// affine basis keeps every retained pixel at the same world point; rotation is never resampling.
const RAPIER_PAINT_GROW_MARGIN = 96;
// Returns the layer the sample should be painted on: the same one, grown to hold it, or -- at the
// memory cap -- the fresh sheet the stroke carries on over (`_rapierPaintFlipAtCap`).
function _rapierPaintGrowToHold(layer, paint, p) {
	if (!layer?.surface) return layer;
	const surface = layer.surface, k = layer.scale;
	// Where this sample reaches, in surface pixels: the brush's own half-width plus a margin, so a
	// hand running along an edge grows in strides rather than on every single dab.
	const reach = (paint?.reach || 0) * k + RAPIER_PAINT_GROW_MARGIN;
	const x = p.x * k, y = p.y * k;
	let left = Math.ceil(reach - x), top = Math.ceil(reach - y);
	let right = Math.ceil(x + reach - (surface.width - 1)), bottom = Math.ceil(y + reach - (surface.height - 1));
	left = Math.max(0, left); top = Math.max(0, top); right = Math.max(0, right); bottom = Math.max(0, bottom);
	if (!(left || top || right || bottom)) return layer;
	const quantise = globalThis.RapierDrawPaint.paintGrowStep;
	let L = quantise ? quantise(left) : left, T = quantise ? quantise(top) : top, R = quantise ? quantise(right) : right, B = quantise ? quantise(bottom) : bottom;
	if ((surface.width + L + R) * (surface.height + T + B) > RAPIER_PAINT_AREA_MAX * 2) { L = left; T = top; R = right; B = bottom; }
	const w = surface.width + L + R, h = surface.height + T + B;
	if (w * h > RAPIER_PAINT_AREA_MAX * 2) return _rapierPaintFlipAtCap(layer, paint, p);
	const { dx, dy } = surface.grow(L, T, R, B);
	if (paint && layer.frame) paint.reached = true;
	if (!(dx || dy)) { _rapierPaintResizeLive(layer, 0, 0); return layer; }
	// The buffer moved under the paint, so everything that names a point in LAYER coordinates moves
	// with it: the origin (which is how future events are mapped), the hand's own running position,
	// every sample the lift lag is still holding -- those were mapped through the old origin -- and
	// the brush's own memory of where it last laid a dab (R86e: without that last one the brush saw
	// the hand standing still for as long as growth kept pace with it, and laid nothing).
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
	_rapierPaintResizeLive(layer, dx, dy);
	return layer;
}
// R86e. The surface has met the one hard stop, memory: growing to hold this sample would pass
// RAPIER_PAINT_AREA_MAX * 2 (at a phone's pixel density the whole window is already millions of
// pixels, and a canvas that has grown to hold strokes off three edges holds a surface near the cap
// before the fourth begins). The founder's durability law (R85b: never delete the person's work,
// never stop it; canvas-durability.md: the automatic Set) says what happens instead of a clipped
// mark: the painting so far is set as a picture, in its own history step, and the stroke carries
// on over it on a fresh sheet at the view's own scale -- the brush carried across with everything
// it remembers (its position, its smudge, its load), the hand's running position and every held
// sample carried as world coordinates, the pointer's map re-read once because the canvas may have
// grown under the hand -- so the mark is one continuous mark across two pictures. Said once, in a
// toast. Returns the layer the stroke continues on; the old one if the flip cannot happen now (a
// settle already in flight), in which case the sample is clipped as before.
function _rapierPaintFlipAtCap(layer, paint, p) {
	const state = _rapierDrawState;
	if (!paint || state.paintSetting || state.paintFlipping || !state.open) return layer;
	const frame = layer.frame;
	const origin = layer.origin ? layer.origin.slice() : [-frame.pad / layer.scale, -frame.pad / layer.scale];
	const carried = new Set([p, paint, ...paint.tail.map(s => s.p)]);
	if (paint.drawn) carried.add(paint.drawn.p);
	state.paintFlipping = true;
	try {
		for (const q of carried) { q.x += origin[0]; q.y += origin[1]; }
		layer.surface.settleWet();
		state.paintLastGrown = null;
		_rapierPaintCommit(true);
		const settled = layer.id != null ? _rapierDrawShapeById(layer.id) : null;
		// The canvas grew to hold the picture and every shape moved with it; so does the hand.
		const grown = state.paintLastGrown;
		if (grown) for (const q of carried) { q.x += grown.dx; q.y += grown.dy; }
		if (grown) paint.geom = _rapierDrawPointerGeometry();
		if (state.paintLayer === layer) _rapierPaintCloseLayer();
		let fresh, o;
		if (frame) {
			// Keep the brush in its native affine basis across Set. The new sheet begins under the
			// hand on an integer pixel, so its grain and held samples need only the existing rebase.
			const x = Math.floor(p.x * layer.scale), y = Math.floor(p.y * layer.scale);
			fresh = _rapierPaintOpenLocalLayer({ ...frame, pw: 1, ph: 1, c0: [frame.c0[0] + x * frame.eux + y * frame.evx, frame.c0[1] + x * frame.euy + y * frame.evy] });
			o = [(x - fresh.frame.pad) / layer.scale, (y - fresh.frame.pad) / layer.scale];
			fresh.surface.toothOX = layer.surface.toothOX + (o[0] - origin[0]) * layer.scale;
			fresh.surface.toothOY = layer.surface.toothOY + (o[1] - origin[1]) * layer.scale;
		} else { fresh = _rapierPaintOpenLayer(); o = fresh.origin || [0, 0]; }
		for (const q of carried) { q.x -= o[0]; q.y -= o[1]; }
		fresh.brush = paint.brush; fresh.brushId = layer.brushId; fresh.brushDip = layer.brushDip; fresh.brushRadius = layer.brushRadius;
		// One stroke is one Undo step: the sheet's first commit joins the step the flip wrote, while that
		// step is still the head of history.
		fresh.joinsStroke = state.undoStack.at(-1) || null;
		paint.brush?.rebase?.((origin[0] + (grown?.dx || 0) - o[0]) * RAPIER_PAINT_GRAIN, (origin[1] + (grown?.dy || 0) - o[1]) * RAPIER_PAINT_GRAIN);
		paint.scale = fresh.scale;
		if (frame) _rapierPaintGrowToHold(fresh, paint, p);
		_rapierPaintShowLive(true);
		state.paintFlips = (state.paintFlips || 0) + 1;
		if (settled) void _rapierPaintEncodeShapeLater(settled.id, settled.raster);
		showToast('This painting reached what memory holds, so it was set as a picture. You are on a clean sheet over it -- keep going.', 'info');
		return fresh;
	} catch (error) {
		console.warn('[rapier] paint flip at cap', error);
		return _rapierPaintLayer() || layer;
	} finally { state.paintFlipping = false; }
}
// The picture a flip set is the working PNG at first, so the flip costs the hand nothing; its JPEG
// XL is written the moment the encoder is done, in place and without a history step (exactly as
// Done would write it), unless the shape has changed or gone meanwhile -- an Undo across the flip
// puts the earlier picture back, and that one is not touched.
async function _rapierPaintEncodeShapeLater(shapeId, was) {
	const state = _rapierDrawState, session = state.session;
	try {
		if (typeof _rapierDefaultImageProfile === 'function' && _rapierDefaultImageProfile() !== 'jxl') return;
		const pixels = await _rapierPaintPNG.decode(was), surface = pixels ? _rapierPaintPixelsSurface(pixels) : null;
		const canvas = surface ? null : await _rapierPaintRasterCanvas(was), source = surface || canvas;
		const pieces = await _rapierPaintLosslessPieces(b => surface ? _rapierPaintEncodeJXL(surface, b, {lossless: true}).then(async out => ({ ...out, shown: await _rapierPaintShownFor(surface, b) })) : _rapierPaintEncodeCanvasBox(canvas, b, {lossless: true}), {x0: 0, y0: 0, x1: source.width - 1, y1: source.height - 1}, _rapierPaintRasterBudget());
		if (!pieces || !state.open || state.session !== session) return;
		_rapierPaintKeepShown(pieces);
		const shape = _rapierDrawShapeById(shapeId);
		if (!shape || shape.raster !== was) return;
		if (pieces.length === 1) { shape.raster = pieces[0].url; _rapierDrawRenderShapes([shape.id]); return; }
		const made = await _rapierPaintSplitShape(state.recipe.shapes, shape, pieces);
		if (made) _rapierDrawRenderAll();
	} catch (error) { console.warn('[rapier] paint flip encode', error); }
}
// Resizing a <canvas> CLEARS it, and the live blit only paints the dirty box -- so after a grow the
// next frame showed the new dab on a blank sheet and every earlier stroke vanished until the commit
// redrew the <image>. The founder: "all the existing lines start to glitch out and disappear. They
// would flash and then disappear. But then when I finish my stroke, they would all come back."
// So the whole surface is dirty by definition after a resize, and it is repainted in the SAME turn:
// a scheduled blit would still leave one blank frame on screen.
// The overlay follows the surface it grew. Resizing a canvas clears it, and the old answer was to
// mark the WHOLE surface dirty and convert every float pixel back to bytes -- relief and all --
// synchronously, at the exact moment the hand crossed the edge. Measured in Node on a phone-sized
// stage, that conversion is 27.5 ms for a 927x356 painting and scales with the painting, so the
// jank got worse the more there was to lose.
//
// The overlay already HOLDS those bytes: growth moves the paint to a new address, it does not
// change it. So the pixels are carried to their new place with one canvas copy (premultiplied to
// premultiplied, exact -- nothing is unpremultiplied and re-rounded on the way), and only the work
// the surface still owes -- the dabs painted since the last blit, whose box `grow` has already
// translated -- is converted. The new margins are transparent on both sides, so they need nothing.
function _rapierPaintResizeLive(layer, dx = 0, dy = 0) {
	const surface = layer.surface, canvas = layer.canvas, was = { w: canvas.width, h: canvas.height };
	let carried = null;
	if (was.w > 0 && was.h > 0 && !_rapierPaintOverlayLost(layer)) {
		try {
			carried = document.createElement('canvas');
			carried.width = was.w; carried.height = was.h;
			carried.getContext('2d').drawImage(canvas, 0, 0);
		} catch (_) { carried = null; }
	}
	canvas.width = surface.width; canvas.height = surface.height;
	if (carried) layer.ctx.drawImage(carried, dx, dy);
	// Without the carry there is nothing on the overlay: everything must be converted again.
	else surface.dirty = { x0: 0, y0: 0, x1: surface.width - 1, y1: surface.height - 1 };
	_rapierPaintPlaceLive();
	_rapierPaintBlit();
}
function _rapierPaintSample(paint, layer, s, lift) {
	// The live layer, not the one the caller captured: a flip at the cap may have replaced it.
	layer = _rapierPaintLayer() || layer;
	layer = _rapierPaintGrowToHold(layer, paint, s.p) || layer;
	const land = RAPIER_PAINT_TOUCH_FLOOR + (1 - RAPIER_PAINT_TOUCH_FLOOR) * _rapierPaintSmooth(_rapierDrawClamp(s.at / paint.land, 0, 1));
	paint.brush.strokeTo(layer.surface, s.p.x * RAPIER_PAINT_GRAIN, s.p.y * RAPIER_PAINT_GRAIN, s.press * land * lift, s.p.tiltX, s.p.tiltY, s.dt, 1, 0, s.p.twist);
	// Where the MARK now ends, which is behind the hand by the lift lag. The held tick paints here,
	// never at the live finger: one monotonic stream reaches the brush, and a dwell cannot jump the
	// applicator forward past samples still queued behind it (Codex R81: the observed x sequence
	// 12, 4, 8, 12, 16 -- the tick drew the hand, then the queue drew the past).
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
		const pressure = paint.pressure = _rapierPaintPressure(sample, paint, p);
		paint.travel += Math.hypot(p.x - paint.x, p.y - paint.y);
		paint.last = p.t; paint.x = p.x; paint.y = p.y; paint.tiltX = p.tiltX; paint.tiltY = p.tiltY; paint.twist = p.twist; paint.points++;
		paint.reached = paint.reached || p.reach;
		paint.tail.push({ p, dt, press: pressure, at: paint.travel });
		// Drained by DISTANCE (the lift lag) and by COUNT. The count bound is what a still hand needs:
		// travel stops advancing, so the distance rule never fires, and a 240 Hz panel held for a
		// minute would otherwise retain every sample of it (Codex R81 measured 24,000). Paint held
		// back is paint not yet laid; past the bound it is laid, at full weight, in order.
		while (paint.tail.length && (paint.travel - paint.tail[0].at > paint.lift || paint.tail.length > RAPIER_PAINT_TAIL_MAX)) {
			_rapierPaintSample(paint, layer, paint.tail.shift(), 1); paint.drained = true;
		}
	}
	_rapierPaintScheduleBlit();
	if (paint.holdNeeded) _rapierPaintScheduleHold(gesture);
}
function _rapierPaintEnd(evt, gesture) {
	if (typeof _rapierDrawBackupTouch === 'function') _rapierDrawBackupTouch();
	const layer = _rapierPaintLayer(), paint = gesture.paint;
	if (!paint || paint.discarded) return;
	if (paint.pending) { paint.ended = true; paint.endEvt = evt; return; }
	if (!layer) return;
	if (layer.holdRaf) { cancelAnimationFrame(layer.holdRaf); layer.holdRaf = 0; }
	const p = _rapierPaintEventPoint(evt, paint.geom, layer);
	paint.reached = paint.reached || p.reach;
	paint.travel += Math.hypot(p.x - paint.x, p.y - paint.y);
	paint.tail.push({ p, dt: _rapierDrawClamp((p.t - paint.last) / 1000, 0.0005, 0.5), press: 0, at: paint.travel });
	const end = paint.travel;
	// The taper is the tail's OWN span, not a fixed lift distance: a flick shorter than one lift used
	// to arrive with every sample below full weight, so the whole mark was a lift and the stroke had
	// no body at all (Codex R81). And a stroke so short that the lag never released anything keeps
	// its first held sample at full weight -- that sample IS the body.
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
	// Wet media: the stroke is not finished when the finger is. It dries in view and commits itself; Undo
	// takes it back meanwhile, so the head's undo has something to do from now (_rapierDrawRenderHistory).
	if (ended.surface.wetState && !_rapierDrawState.paintSetting?.auto) { _rapierPaintScheduleBlit(); _rapierPaintScheduleDry(ended); _rapierDrawRenderHistory(); return; }
	_rapierPaintCommit();
}
// The sibling of `_rapierPaintDiscardOverflow`'s law for the opposite failure: not too many pixels
// to keep, but no pixel ever reachable at all (Astra-R75 P06, "every admitted mark survives or is
// explicitly refused") -- a stroke beyond a transformed target whose growth could not run.
// The same toast shape, never a new dialog, never a hint.
function _rapierPaintRefuseUnreached() {
	showToast('That stroke landed off the painting -- nothing to paint on there', 'info');
}
// The one settlement law for a live layer still holding pixels the budget refused (Astra-R74 P03,
// Astra-R75 P02): an over-budget stroke can never be committed (that is the refusal itself), so the
// only honest outcomes left are staying open (nothing here calls this while the person might still
// shrink it under budget and try again -- see _rapierPaintCommit) or this deliberate discard, named
// by the very toast that first warned about it. Every path that would otherwise destroy or replace
// the live layer without ever having committed it -- Undo (draw.js `_rapierDrawUndo`), a tool
// change (`_rapierDrawSetTool`), Done/Back (`_rapierDrawFinish`), the canvas following a stage
// resize before anything is committed (`_rapierDrawFollowStage`) and closing Draw outright
// (`_rapierDrawClose`) -- calls this first, so an overflowed stroke is never silently dropped: it is
// either still there next time, or it was named as discarded. Closing the layer and re-syncing lets
// the ambient rehydrate pick the last-good committed picture (if any) back up for the next stroke.
// The closing settlement for a live layer holding pixels the working PNG budget refused: KEEP them.
// Every path that ends the layer's life without the person having asked for it gone -- Done and Back
// (draw.js `_rapierDrawFinish`), a tool change (`_rapierDrawSetTool`), closing Draw
// (`_rapierDrawClose`) -- calls this, so the work reaches the recipe and then the file as JPEG XL
// (`_rapierPaintKeepAsJXL`). Only a deliberate Undo still discards, and it names itself.
function _rapierPaintSettleOverflow() {
	const layer = _rapierDrawState.paintLayer;
	// A stroke still drying belongs to the picture too.
	_rapierPaintFlushWet();
	if (!layer?.pendingOverflow) return false;
	// `keep` is the closing path and the budget may not refuse it (the law above _rapierPaintCommit's
	// own refusal): the pixels land in the recipe as the working PNG here, and Done rewrites every
	// painting as JPEG XL before the file is built.
	_rapierPaintCommit(true);
	return true;
}
function _rapierPaintDiscardOverflow() {
	const state = _rapierDrawState, layer = state.paintLayer;
	// Called first by Undo, a tool change, Done/Back, the canvas following the stage and closing
	// Draw: a stroke still drying is committed here rather than silently lost. Undo then pops it
	// from history the way it pops any other stroke.
	_rapierPaintFlushWet();
	if (!layer?.pendingOverflow) return false;
	// While the automatic Set is settling this very painting (docs/open-work.md, section 3 item 3), Undo
	// discards nothing: the settle lands the strokes as one history step in a moment, and Undo then takes
	// that step back the way it takes any other, with Redo able to return it. Discarding here closed the
	// layer under the encoder: every stroke since the one that crossed the budget gone, Redo empty.
	if (state.paintSetting) { showToast('Keeping the painting first. Undo is back in a moment.', 'info'); return true; }
	// A person asked for this, so the closing guard must NOT quietly commit it back. That guard
	// exists for view events; this is a choice.
	const was = _rapierDrawState.paintClosing;
	_rapierDrawState.paintClosing = true;
	try { _rapierPaintCloseLayer(); } finally { _rapierDrawState.paintClosing = was; }
	_rapierPaintSyncPaper();
	showToast('Discarded the painting that was too large to keep', 'info');
	return true;
}
// Writes the layer into the recipe: crop to painted pixels, one PNG, one `paint` shape (new, or the
// layer's own replaced in place), one history step. A transformed target's geometry is written back
// as its own new four corners (`layer.frame`), computed from the SAME affine map the stroke was
// painted through, so its position, rotation and scale survive exactly; a simple (untransformed)
// layer keeps the plain cx/cy/w/h form.
// A picture of the live layer as the shape it would become, for the backup (R86g law 11): the same
// geometry _rapierPaintCommit computes, the pixels as the working PNG; nothing of the layer or the
// recipe is touched, and a layer with nothing on it is nothing.
function _rapierPaintLayerSnapshot() {
	const layer = _rapierPaintLayer(); if (!layer || !layer.surface) return null;
	const box = layer.surface.bounds();
	if (!box) return null;
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
	// A settled stroke already owns this exact encode. A live wash is read without settling it;
	// its checkpoint preserves the visible straight RGBA without altering the material's physics.
	const raster = layer.checkpoint?.revision === layer.surface.revision ? layer.checkpoint.raster : _rapierPaintSurfaceToDataURL(layer.surface, box);
	return { id: layer.id != null ? layer.id : null, geom, raster, paint: { brush: layer.brushId, px: [pw, ph], scale: s }, retire: layer.retire?.slice() };
}
function _rapierPaintCommit(keep = false, kept = null, custody = false) {
	// An ordinary lift queues its revision and returns to the finger. Undo, Close, Done and a
	// commit that already holds its raster still finish whatever is queued, in order, from the
	// bytes taken at the lift.
	if (keep || custody) _rapierPaintFlushRevision();
	const state = _rapierDrawState, layer = _rapierPaintLayer();
	if (!layer) return;
	// Every commit attempt, refused or not, is a new version of the layer's pixels: the automatic
	// settle below encodes against one version and re-encodes if the hand moved on meanwhile.
	layer.paintVersion = (layer.paintVersion || 0) + 1;
	// Whatever is still wet dries exactly here, so the pixels written are the settled ones.
	if (layer.dryRaf) { cancelAnimationFrame(layer.dryRaf); layer.dryRaf = 0; }
	if (layer.surface.wetState) layer.surface.settleWet();
	// R81 impasto: the kept mark is lit -- but the lighting has lived in `shadeInto`, at read-out,
	// since R82 (baking it into the stored pixels made every later stroke re-light every earlier one).
	// What stood here was a call to `lightVolume`, whose body could not light anything (`any` is a
	// constant false), handed a full-surface alpha scan as its argument: a whole-layer scan, at every
	// commit, for a no-op. Both are gone; the relief the eye sees is unchanged.
	if (layer.raf) cancelAnimationFrame(layer.raf);
	layer.raf = 0;
	if (layer.holdRaf) { cancelAnimationFrame(layer.holdRaf); layer.holdRaf = 0; }
	_rapierPaintBlit();
	const box = layer.surface.bounds();
	const existing = layer.id != null ? _rapierDrawShapeById(layer.id) : null;
	if (!box) {
		// Everything erased: the layer's shape goes with it.
		if (existing || layer.retire?.length) { const gone = new Set(layer.retire || []); _rapierDrawSnapshot(); state.recipe.shapes = state.recipe.shapes.filter(shape => shape !== existing && !gone.has(shape.id)); _rapierDrawRenderAll(); _rapierDrawSealHistory(); }
		_rapierPaintCloseLayer(); _rapierPaintSyncPaper();
		return;
	}
	if (!kept && !keep) {
		const px = typeof layer.surface.readCommitted === 'function' ? layer.surface.readCommitted(box) : layer.surface.toRGBA8(box);
		const frozen = _rapierPaintGeomOf(layer, box);
		if (_rapierPaintEncodeRevision(layer, px, keep, frozen)) return;
	}
	const budget0 = _rapierPaintRasterBudget();
	// `kept`: a raster already encoded from this very version of the surface (the automatic settle's
	// JPEG XL), written in place of the working PNG so the stroke and its finished picture are ONE
	// history step.
	const pieces = Array.isArray(kept) ? kept : null;
	let raster;
	try { raster = pieces ? pieces[0].url : (kept || _rapierPaintSurfaceToDataURL(layer.surface, box)); }
	catch (error) { layer.pendingOverflow = true; throw error; }
	// A window flag a witness can set to force this path deterministically; unset, it is the real
	// fidelity budget every other raster in the drawing answers to.
	const budget = budget0;
	// R84. `keep` is the closing path, and the budget may not refuse it. A picture over the size
	// budget is a SIZE problem -- recoverable by Set, by erasing, by Save's own reporting. A painting
	// deleted because the layer went away is DATA LOSS, and nothing recovers it. The founder, on the
	// build where these two were the same branch: "I kept drawing and then I zoomed a little and then
	// all of a sudden the whole canvas cleared."
	if (raster.length > budget && !keep) {
		// The budget starts codec custody, never a gap in stroke history. Keep this exact revision
		// immediately, as on a closing path; subsequent strokes get independent deltas while Set
		// encodes. Its final codec change amends only the latest delta. Done still enforces the
		// picture admission law before any oversized working raster can reach the document.
		_rapierPaintCommit(true, raster);
		if (state.paintLayer === layer && !state.paintSetting) void _rapierPaintSetLayer({ auto: true, kib: Math.round(raster.length / 1024) });
		return;
	}
	// docs/open-work.md item 28b (ZA3's U1, ruled): the 24 MiB aggregate is enforced HERE, at the
	// door, never at Done/Download/recovery's exit -- so nothing unkeepable is ever admitted into the
	// live state. This picture is under its OWN per-picture budget (the check above already passed),
	// but together with every OTHER already-committed painting it would cross what the document's own
	// admission allows. An ORDINARY commit (`!keep`) refuses here, live and uncommitted, exactly like
	// the per-picture refusal above -- but never auto-Sets: Set's own commit is a closing commit
	// (`keep`) that this same law may not refuse, so auto-Setting would only rush past the very cap
	// being enforced. A deliberate closing commit (manual Set, Done, Clear, Undo, a tool change,
	// closing Draw) is never refused (R85b: "a closing commit that the size budget CANNOT refuse")
	// and may legitimately finish over the cap; Done then refuses to Add by name and Download, which
	// never measures the aggregate, stays open (28b parts 2 and 3).
	if (!keep) {
		const others = state.recipe.shapes.reduce((total, shape) => total + (shape !== existing && shape.recognized === 'paint' && typeof shape.raster === 'string' && !_rapierPaintPNG.isStored(shape.raster) ? shape.raster.length : 0), 0);
		if (others + raster.length > globalThis.RapierDrawCore?.RAPIER_DRAW_RASTER_TOTAL) {
			const already = layer.pendingOverflow;
			layer.pendingOverflow = true; layer.joinsStroke = null;
			if (!already) showToast('This drawing’s paintings together are at what one document picture can hold. Set this painting to keep it, or download the drawing and start another.', 'info');
			return;
		}
	}
	layer.pendingOverflow = false;
	const built = _rapierPaintGeomOf(layer, box), pw = built.pw, ph = built.ph, s = built.s, geom = built.geom;
	const joins = !!layer.joinsStroke && layer.joinsStroke === state.undoStack.at(-1);
	layer.joinsStroke = null;
	_rapierDrawSnapshot(undefined, custody || joins);
	// The paper grows under the hand (R78): ink committed beyond the canvas widens it, shifting every
	// shape when it grows leftward or upward; one history step with the stroke itself.
	const grown = !layer.frame && _rapierDrawGrowCanvas(geom.cx - geom.w / 2, geom.cy - geom.h / 2, geom.cx + geom.w / 2, geom.cy + geom.h / 2);
	state.paintLastGrown = grown || null;
	if (grown) { geom.cx += grown.dx; geom.cy += grown.dy; }
	let shape = existing;
	if (shape) { shape.geom = geom; shape.raster = raster; shape.paint = { brush: layer.brushId, px: [pw, ph], scale: s }; }
	else {
		shape = { id: _rapierDrawNextId(), stroke: null, recognized: 'paint', asDrawn: false, brush: 'ink', style: null, geom, raster, paint: { brush: layer.brushId, px: [pw, ph], scale: s } };
		state.recipe.shapes.push(shape);
	}
	layer.id = shape.id; layer.raster = raster; layer.geom = JSON.stringify(geom);
	layer.checkpoint = {revision: layer.surface.revision, raster};
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
	_rapierDrawSealHistory();
	// The committed <image> now shows the same pixels the overlay does; hand the picture back to the SVG.
	_rapierPaintShowLive(false);
	// The paper grew: the live layer follows it (`_rapierPaintFollowGrowth`).
	if (grown) _rapierPaintFollowGrowth(layer, grown);
	_rapierPaintSyncPaper();
}

// ---- Paper ------------------------------------------------------------------------------------------
function _rapierPaintWanted() {
	const state = _rapierDrawState;
	return !!state.open && (_rapierDrawTool() === 'paint' || !!state.recipe?.shapes.some(shape => shape.recognized === 'paint'));
}
// Light paper while painting or while a painting is on the canvas.
function _rapierPaintSyncPaper() {
	const state = _rapierDrawState, surface = state.surface;
	if (!surface) return;
	if (!Object.getOwnPropertyDescriptor(surface, 'rapierPaintFacts')) Object.defineProperty(surface, 'rapierPaintFacts', { enumerable: false, get: _rapierPaintFacts });
	// R86g (docs/intent.md "R86g laws" 5): a canvas colour the person chose is the drawing's own
	// (`recipe.paper`, kept with it), and beats the automatic white a painting brings.
	const choice = state.recipe?.paper;
	const paper = choice === 'white' ? true : choice === 'black' ? false : _rapierPaintWanted();
	// The paper owner projects the stage too: ink uses the same paper choice and body theme in
	// _rapierDrawDarkPaper. Keep Canvas on a live theme token so an OS theme change cannot latch
	// yesterday's ground; an opaque stage also gives the Paint dip its actual background to sample.
	// Black is black in either theme: the light theme's own background is white, so a chosen black canvas
	// that fell back to it never changed (the founder: "never changes when you're on raster painting").
	const black = !paper && choice === 'black';
	surface.querySelector('.rapier-draw-stage').style.backgroundColor = 'color-mix(in srgb,var(--draw-paper) 86%,var(--draw-paper-ink))';
	const dark = !paper && (black || !document.body.classList.contains('light'));
	surface.style.setProperty('--draw-paper', paper ? '#fff' : black ? '#000' : 'var(--color-bg)');
	surface.style.setProperty('--draw-paper-ink', paper ? '#000' : black ? '#fff' : 'var(--color-text)');
	const toggle = surface.querySelector('[data-draw-act="canvas"]');
	if (toggle) {
		toggle.setAttribute('aria-label', 'Canvas: ' + (dark ? 'black; change to white' : 'white; change to black'));
		toggle.setAttribute('aria-pressed', String(dark));
	}
	_rapierPaintWarmTarget();
	if (paper === !!state.paper && black === !!state.paperBlack) return;
	state.paper = paper; state.paperBlack = black;
	surface.classList.toggle('rapier-draw-surface--paper', paper);
	surface.classList.toggle('rapier-draw-surface--black', black);
	_rapierDrawGlyphCache.clear();
	_rapierDrawUpdateInkBtn(); _rapierDrawUpdateShapeRow(); _rapierPaintUpdateStrip();
	_rapierDrawRenderAll();
}

// ---- Picking a layer up again ---------------------------------------------------------------------
// Ambient warm-up: called on every render while Paint is up, so the decode has usually finished
// before the person's next stroke lands (the fast, synchronous path in `_rapierPaintBegin`); when it
// has not, that same stroke queues instead of opening an empty layer under it (P02).
// Every input the fresh layer's geometry is computed from, as one string: a warmed layer is refused
// the moment any of them moves (`_rapierPaintLayerValid`), so a convenience can never decide a
// stroke's raster scale or origin.
function _rapierPaintWarmView(geom = _rapierDrawPointerGeometry()) {
	const { rect, vb } = geom, canvas = _rapierDrawState.recipe.canvas;
	return [canvas.w, canvas.h, rect.left, rect.top, rect.width, rect.height, vb.x, vb.y, vb.width, vb.height, innerWidth, innerHeight, globalThis.devicePixelRatio || 1].join(',');
}
function _rapierPaintWarmTarget() {
	const state = _rapierDrawState;
	if (!state.open || _rapierDrawTool() !== 'paint' || state.gesture || _rapierPaintLayerValid()) return;
	const target = _rapierPaintTarget();
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
