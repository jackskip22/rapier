export const SIZE_BUDGETS = Object.freeze({
	full: Object.freeze({warn: 1_800_000, refuse: 1_900_000}),
	reader: Object.freeze({warn: 1_200_000, refuse: 1_250_000}),
});

// development pack (`RAPIER_PACK=fast`, zlib, refused by every release) is larger by design, so it only warns.
export function checkProfileSize(profile, bytes, warn = console.warn, {release = true} = {}) {
	const budget = SIZE_BUDGETS[profile];
	if (!budget || !Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid page size measurement');
	if (bytes >= budget.warn) warn(`[build] ${profile} page is ${bytes} bytes: warning at ${budget.warn}; ceiling ${budget.refuse}`);
	if (bytes > budget.refuse) {
		const message = `[build] ${profile} page is ${bytes} bytes, above its ${budget.refuse}-byte ceiling`;
		if (release) throw new Error(message);
		warn(message + ' (a development pack; release packing is smaller and is the one measured)');
	}
}

// `RAPIER_PAINT_GRAIN = 3`, a 200-unit stroke on a 390 × 692
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
	'rapier/oil':                  Object.freeze({medianMs: 451, worstMs: 593}),
	'rapier/bristle':              Object.freeze({medianMs: 260, worstMs: 389}),
	'rapier/scumble':              Object.freeze({medianMs: 300, worstMs: 450}),
	'rapier/pencil':               Object.freeze({medianMs: 329, worstMs: 348}),
	'rapier/pen':                  Object.freeze({medianMs: 405, worstMs: 442}),
	'rapier/smudge':               Object.freeze({medianMs: 168, worstMs: 188}),
	'rapier/blend':                Object.freeze({medianMs: 92,  worstMs: 128}),
	'rapier/dissolve':             Object.freeze({medianMs: 30,  worstMs: 50}),
	'rapier/erode':                Object.freeze({medianMs: 30,  worstMs: 55}),
	'rapier/eraser':               Object.freeze({medianMs: 30,  worstMs: 55}),
});

export const PAINT_GPU_BUDGETS = Object.freeze({
	card: 'Tesla T4',
	brushes: Object.freeze({
		'dieterle/arrow-1':            Object.freeze({medianMs: 1, p95Ms: 2}),
		'dieterle/8b-pencil-1':        Object.freeze({medianMs: 8, p95Ms: 22}),
		'dieterle/round-1':            Object.freeze({medianMs: 10, p95Ms: 20}),
		'dieterle/flat2-1':            Object.freeze({medianMs: 12, p95Ms: 19}),
		'dieterle/splash':             Object.freeze({medianMs: 10, p95Ms: 32}),
		'dieterle/halftone-1':         Object.freeze({medianMs: 1, p95Ms: 2}),
		'dieterle/blender':            Object.freeze({medianMs: 5, p95Ms: 9}),
		'dieterle/tail-feathers':      Object.freeze({medianMs: 15, p95Ms: 31}),
		'dieterle/wateryflatbrush':    Object.freeze({medianMs: 12, p95Ms: 20}),
		'rapier/pen':                  Object.freeze({medianMs: 1, p95Ms: 2}),
		'rapier/pencil':               Object.freeze({medianMs: 1, p95Ms: 2}),
		'rapier/scumble':              Object.freeze({medianMs: 14, p95Ms: 32}),
		'rapier/bristle':              Object.freeze({medianMs: 8, p95Ms: 21}),
		'rapier/smudge':               Object.freeze({medianMs: 2, p95Ms: 4}),
		'rapier/smear':                Object.freeze({medianMs: 2, p95Ms: 3}),
		'rapier/blend':                Object.freeze({medianMs: 9, p95Ms: 41}),
		'rapier/eraser':               Object.freeze({medianMs: 1, p95Ms: 2}),
		'rapier/dissolve':             Object.freeze({medianMs: 1, p95Ms: 2}),
		'rapier/erode':                Object.freeze({medianMs: 1, p95Ms: 2}),
		'rapier/posterize':            Object.freeze({medianMs: 1, p95Ms: 2}),
	}),
});

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

export const PAINT_GRAIN_BUDGETS = Object.freeze({
	cpuThrottle: 4,
	brushes: Object.freeze({
		'dieterle/round-1': Object.freeze({firstBlitMs: 180, perMoveMedianMs: 95, perMoveWorstMs: 260}),
		'dieterle/wateryflatbrush': Object.freeze({firstBlitMs: 200, perMoveMedianMs: 136, perMoveWorstMs: 170}),
	}),
});

export const NOTES_BUDGETS = Object.freeze({
	cpuThrottle: 4,
	capture: Object.freeze({
		small: Object.freeze({ms: 850}),
		large: Object.freeze({ms: 850}),
	}),
	open: Object.freeze({ms: 5500}),
	typing: Object.freeze({
		idle:   Object.freeze({medianMs: 40, worstMs: 110}),
		search: Object.freeze({medianMs: 45, worstMs: 130}),
		thumbs: Object.freeze({medianMs: 45, worstMs: 130}),
		import: Object.freeze({medianMs: 45, worstMs: 110}),
	}),
});
