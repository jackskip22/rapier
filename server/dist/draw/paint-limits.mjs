// SPDX-License-Identifier: AGPL-3.0-only
export const AGENT_PAINT_LIMITS = Object.freeze({strokes: 32, points: 1024, total: 4096, side: 2048});
export const PAINT_REPLAY_MAX_BYTES = 8 * 1024 * 1024;
export const WATER_GPU_MAX_BYTES = 384 * 1024 * 1024;

export function storedPaintPointCount(points) {
	const [first, next] = points;
	return points.length - Number(Array.isArray(first) && Array.isArray(next) && first.length === next.length &&
		first.every((value, index) => value === next[index]));
}

export function paintReplayFits(history) {
	try {
		const json = JSON.stringify(history);
		if (typeof json === 'string' && json.length > PAINT_REPLAY_MAX_BYTES) return false;
		if (typeof json === 'string' && json.length * 3 <= PAINT_REPLAY_MAX_BYTES) return true;
		return new TextEncoder().encode(json).byteLength <= PAINT_REPLAY_MAX_BYTES;
	}
	catch (_) { return false; }
}
