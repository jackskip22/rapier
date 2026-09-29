// One owner of both profiles' size budgets, read by tools/build.mjs and tools/release-truth.mjs.
export const SIZE_BUDGETS = Object.freeze({
	full: Object.freeze({warn: 2_980_000, refuse: 3_000_000}),
	document: Object.freeze({warn: 2_079_000, refuse: 2_100_000}),
});

// Paint at grain:
// `RAPIER_PAINT_GRAIN = 3`, a 200-unit stroke on a 390 × 692
// stage. Each ceiling is 2× the median / worst of five runs; `paint-stroke-cost` refuses a crossing. Re-measure, never guess.
export const PAINT_STROKE_BUDGETS = Object.freeze({
	'dieterle/8b-pencil-1':        Object.freeze({medianMs: 364, worstMs: 554}),
	'dieterle/flat2-1':            Object.freeze({medianMs: 430, worstMs: 442}),
	'dieterle/halftonecmy-1':      Object.freeze({medianMs: 102, worstMs: 117}),
	'dieterle/round-1':            Object.freeze({medianMs: 260, worstMs: 291}),
	'dieterle/arrow-1':            Object.freeze({medianMs: 28,  worstMs: 43}),
	'dieterle/fan-1':              Object.freeze({medianMs: 437, worstMs: 460}),
	'dieterle/fountain-sf-1':      Object.freeze({medianMs: 91,  worstMs: 97}),
	'dieterle/fount-offset-1':     Object.freeze({medianMs: 70,  worstMs: 79}),
	'dieterle/halftone-1':         Object.freeze({medianMs: 80,  worstMs: 87}),
	'dieterle/pencil-left-handed': Object.freeze({medianMs: 30,  worstMs: 35}),
	'dieterle/blender':            Object.freeze({medianMs: 49,  worstMs: 59}),
	'dieterle/dissolver':          Object.freeze({medianMs: 35,  worstMs: 41}),
	'dieterle/eraser':             Object.freeze({medianMs: 66,  worstMs: 201}),
	'dieterle/splash':             Object.freeze({medianMs: 50,  worstMs: 68}),
	'dieterle/flight-feathers':    Object.freeze({medianMs: 227, worstMs: 236}),
	'dieterle/tail-feathers2':     Object.freeze({medianMs: 513, worstMs: 520}),
	'dieterle/tail-feathers':      Object.freeze({medianMs: 728, worstMs: 748}),
	'dieterle/posterizer':         Object.freeze({medianMs: 41,  worstMs: 52}),
	'dieterle/wateryflatbrush':    Object.freeze({medianMs: 436, worstMs: 437}),
	// Measured on this container and doubled: a tripwire, not a cross-machine comparison.
	'rapier/oil':                  Object.freeze({medianMs: 451, worstMs: 593}),
	'rapier/bristle':              Object.freeze({medianMs: 260, worstMs: 389}),
	'rapier/scumble':              Object.freeze({medianMs: 300, worstMs: 450}),
	// The seven Tools as operators (docs/paint-tools.md): ~3x the median for tiny strokes, 2x otherwise. This witness paints on BLANK paper;
	// the cost on paint is in docs/paint-architecture.md. Water and Wet flat are wet operators now (_opWet); hairs pool one settle per dab (opFlush).
	'rapier/water':                Object.freeze({medianMs: 991, worstMs: 1044}),
	'rapier/watercolour':          Object.freeze({medianMs: 462, worstMs: 653}),
	'rapier/pencil':               Object.freeze({medianMs: 329, worstMs: 348}),
	'rapier/pen':                  Object.freeze({medianMs: 405, worstMs: 442}),
	'rapier/marker':               Object.freeze({medianMs: 492, worstMs: 569}),
	'rapier/smudge':               Object.freeze({medianMs: 168, worstMs: 188}),
	'rapier/blend':                Object.freeze({medianMs: 92,  worstMs: 128}),
	'rapier/dissolve':             Object.freeze({medianMs: 30,  worstMs: 50}),
	'rapier/erode':                Object.freeze({medianMs: 30,  worstMs: 55}),
	'rapier/wetflat':              Object.freeze({medianMs: 4062, worstMs: 4066}),
	// The Erase tool's own preset (R82), now the `erase` operator: measured median 9.0 ms, worst 9.9.
	'rapier/eraser':               Object.freeze({medianMs: 30,  worstMs: 55}),
});

// `paint-sheet-by-hand` family wall times: 2× the first pinned-Chromium run. A missing id fails.
export const PAINT_SHEET_FAMILY_BUDGET_MS = Object.freeze({
	pencil: 21_364,
	oil: 44_824,
	water: 28_642,
	halftone: 9_954,
	smear: 37_134,
	'water-erode': 26_404,
	splash: 26_324,
	feathers: 12_310,
	posterize: 45_946,
});

// First blit and per-move under 4x CPU throttle: ~1.5× first blit, 2× per-move. interaction-budgets refuses a crossing.
export const PAINT_GRAIN_BUDGETS = Object.freeze({
	cpuThrottle: 4,
	brushes: Object.freeze({
		'dieterle/round-1': Object.freeze({firstBlitMs: 180, perMoveMedianMs: 95, perMoveWorstMs: 260}),
		// wateryflatbrush's first blit measures 184-190 ms everywhere; 200 is its own ~1.5x.
		'dieterle/wateryflatbrush': Object.freeze({firstBlitMs: 200, perMoveMedianMs: 136, perMoveWorstMs: 170}),
	}),
});

// Notes latency (docs/notes-budgets.md): notes-capture-budget.mjs and notes-typing-budget.mjs under 4x CPU throttle; container-first ceilings, not phone promises.
export const NOTES_BUDGETS = Object.freeze({
	cpuThrottle: 4,
	capture: Object.freeze({
		small: Object.freeze({ms: 850}),   // LAW6, a 5-note folder
		large: Object.freeze({ms: 850}),   // LAW6, a 500-note folder -- capture stays flat with size
	}),
	open: Object.freeze({ms: 5500}),        // settings -> cards on screen, 500 notes
	typing: Object.freeze({
		idle:   Object.freeze({medianMs: 40, worstMs: 110}),
		search: Object.freeze({medianMs: 45, worstMs: 130}), // the search index built + a query run mid-burst (synthesized worst case; docs/notes-budgets.md)
		thumbs: Object.freeze({medianMs: 45, worstMs: 130}), // a 20-picture thumbnail queue draining in the background
		import: Object.freeze({medianMs: 45, worstMs: 110}), // a real 200-note import landing in the background
	}),
});
