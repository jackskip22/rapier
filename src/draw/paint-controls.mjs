// SPDX-License-Identifier: AGPL-3.0-only
// Brush controls are interpreted once for the paint tool, its previews and agent strokes.
export const PAINT_BRUSH_CONTROLS = Object.freeze({
	size: Object.freeze({min: 0, max: 100, default: 50}),
	load: Object.freeze({min: 0, max: 1, default: 1}),
	water: Object.freeze({min: 0, max: 1, default: 0}),
	angle: Object.freeze({min: 0, max: 179, default: 45}),
	follow: Object.freeze({type: 'boolean', default: false}),
	erase: Object.freeze({type: 'boolean', default: false})
});
// Each brush's first-use size: the width the Paint tool opens the brush at, and the width an agent stroke takes when it names
// none, so the person's first stroke and the agent's are the same brush. Smudge is a fingertip, not a thumb: 30, the width at
// which a pull on the phone reads as a fingertip's.
export const PAINT_SIZE_DEFAULTS = Object.freeze({'rapier/flat': 66, 'rapier/scumble': 89, 'rapier/smudge': 30});
export const paintSizeDefault = id => Object.hasOwn(PAINT_SIZE_DEFAULTS, id) ? PAINT_SIZE_DEFAULTS[id] : PAINT_BRUSH_CONTROLS.size.default;
export const PAINT_DIP_MIN = 14, PAINT_DIP_MAX = 260, PAINT_DIP_FULL = .97;
export const paintBrushRadiusOffset = (size = 50) => (size - 50) / 50 * Math.log(8) + Math.log(2);
export function paintBrushHead({angle = 45, follow = false, erase = false} = {}, isTool = false) {
	return {held: follow ? null : angle, clear: erase && !isTool};
}
export function paintBrushDip(def, load = 1, water = 0) {
	if (load >= PAINT_DIP_FULL && water <= .005) return def;
	def.rapier = {...(def.rapier || {})};
	if (load < PAINT_DIP_FULL) def.rapier.rapier_load = Math.round(PAINT_DIP_MIN + (PAINT_DIP_MAX - PAINT_DIP_MIN) * load * load);
	if (water > .005) {
		def.rapier.rapier_thinners = water;
		if (def.wet) {
			def.wet = {...def.wet};
			if (def.wet.rapier_water > 0) def.wet.rapier_water = Math.min(4, def.wet.rapier_water * (1 + 1.1 * water));
			if (def.wet.rapier_pigment_load > 0) def.wet.rapier_pigment_load *= 1 - .62 * water;
		}
	}
	return def;
}
