// SPDX-License-Identifier: AGPL-3.0-only
// All retained material source uses one serialized UTF-8 budget.
export const PAINT_REPLAY_MAX_BYTES = 8 * 1024 * 1024;
export function paintReplayFits(history) {
	try { return new TextEncoder().encode(JSON.stringify(history)).byteLength <= PAINT_REPLAY_MAX_BYTES; }
	catch (_) { return false; }
}
