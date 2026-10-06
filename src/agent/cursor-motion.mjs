// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A pure cursor path in client coordinates. Motion is "direct" or "arc".
 * at(elapsedMs) returns fresh {position: {x, y}, trail: [{x, y, opacity}]} values.
 * Time is milliseconds since the caller started the trace, clamped to the path;
 * infinities clamp too, while NaN and non-numbers are rejected.
 * Reduced motion and coincident points have zero duration and always return the end.
 * The caller owns frames, interruption and presentation; this path never schedules work.
 */
export function createCursorMotion(start, end, motion = 'direct', {reducedMotion = false, trail = false} = {}) {
  const {x: x0, y: y0} = start ?? {}, {x: x1, y: y1} = end ?? {};
  if (![x0, y0, x1, y1].every(Number.isFinite)) throw new TypeError('Cursor points must have finite x and y coordinates');
  if (motion !== 'direct' && motion !== 'arc') throw new RangeError('Unknown cursor motion');

  const dx = x1 - x0, dy = y1 - y0, distance = Math.hypot(dx, dy);
  if (!reducedMotion && !Number.isFinite(distance)) throw new RangeError('Cursor span must be finite');
  const durationMs = reducedMotion || distance === 0 ? 0 : Math.min(280, 90 + 45 * Math.log2(1 + distance / 80));
  const bow = durationMs && motion === 'arc' ? Math.min(12, distance * 0.02) : 0;
  const nx = bow ? -dy / distance : 0, ny = bow ? dx / distance : 0;

  const pointAt = time => {
    // Return the supplied coordinates themselves at the boundaries: interpolation can round them.
    if (durationMs === 0 || time >= durationMs) return {x: x1, y: y1};
    if (time <= 0) return {x: x0, y: y0};
    const u = time / durationMs;
    const s = Math.max(0, Math.min(1, u * u * u * (10 + u * (-15 + 6 * u))));
    const offset = bow * 4 * s * (1 - s);
    return {x: x0 + dx * s + nx * offset, y: y0 + dy * s + ny * offset};
  };

  return Object.freeze({
    durationMs,
    at(elapsedMs) {
      if (typeof elapsedMs !== 'number' || Number.isNaN(elapsedMs)) throw new TypeError('Cursor time must be a number');
      const time = Math.max(0, Math.min(durationMs, elapsedMs));
      const result = {position: pointAt(time), trail: []};
      if (trail && time > 0 && time < durationMs) {
        const fade = Math.min(1, (durationMs - time) / 48);
        for (let age = 48; age > 0; age -= 16) {
          if (time >= age) result.trail.push({...pointAt(time - age), opacity: (1 - age / 64) * fade});
        }
      }
      return result;
    },
  });
}
