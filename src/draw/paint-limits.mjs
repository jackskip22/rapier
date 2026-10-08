// SPDX-License-Identifier: AGPL-3.0-only
// All retained material source uses one serialized UTF-8 budget.
export const AGENT_PAINT_LIMITS = Object.freeze({strokes: 32, points: 1024, total: 4096, side: 2048});
export const PAINT_REPLAY_MAX_BYTES = 8 * 1024 * 1024;

// Stored strokes include the painter's repeated starting sample. It does not consume
// the caller's point allowance; every remaining sample still counts toward admission.
export function storedPaintPointCount(points) {
	const [first, next] = points;
	return points.length - Number(Array.isArray(first) && Array.isArray(next) && first.length === next.length &&
		first.every((value, index) => value === next[index]));
}

export function paintReplayFits(history) {
	try { return new TextEncoder().encode(JSON.stringify(history)).byteLength <= PAINT_REPLAY_MAX_BYTES; }
	catch (_) { return false; }
}
