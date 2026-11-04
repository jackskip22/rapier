// SPDX-License-Identifier: AGPL-3.0-only
export const LIVE_FRAME_BUDGET = Object.freeze({
  frameBytes: 32 * 1024 * 1024,
  queuedChars: 2 * 1024 * 1024,
  pendingPerDocument: 16,
  pendingPerSocket: 4,
  framesPerSocketPerSecond: 64,
});
export function admittedUtf8Frame(frame, limit = LIVE_FRAME_BUDGET.frameBytes) {
  if (typeof frame !== 'string' || frame.length > limit) return false;
  if (frame.length * 3 <= limit) return true;
  let bytes = 0;
  for (let i = 0; i < frame.length; i++) {
    const code = frame.charCodeAt(i);
    if (code < 0x80) bytes++;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff &&
             i + 1 < frame.length && (frame.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      bytes += 4; i++;
    } else bytes += 3;
    if (bytes > limit) return false;
  }
  return true;
}
export class LiveFrameAdmission {
  constructor() {
    this.pending = 0;
    this.chars = 0;
    this.peers = new WeakMap();
  }
  take(socket, frame, now = Date.now()) {
    if (!socket || typeof socket !== 'object' || typeof frame !== 'string' ||
        frame.length > LIVE_FRAME_BUDGET.frameBytes) return null;
    let peer = this.peers.get(socket);
    const inWindow = peer && now >= peer.since && now - peer.since < 1000;
    if ((inWindow && peer.count >= LIVE_FRAME_BUDGET.framesPerSocketPerSecond) ||
        (peer && peer.pending >= LIVE_FRAME_BUDGET.pendingPerSocket) ||
        this.pending >= LIVE_FRAME_BUDGET.pendingPerDocument ||
        (this.pending > 0 && this.chars + frame.length > LIVE_FRAME_BUDGET.queuedChars))
      return null;
    if (!admittedUtf8Frame(frame)) return null;
    if (!peer) { peer = {since: now, count: 0, pending: 0}; this.peers.set(socket, peer); }
    if (!inWindow) { peer.since = now; peer.count = 0; }
    peer.count++;
    peer.pending++;
    this.pending++;
    this.chars += frame.length;
    let returned = false;
    return () => {
      if (returned) return;
      returned = true;
      peer.pending--;
      this.pending--;
      this.chars -= frame.length;
    };
  }
}
export function admitLiveMessage(gate, socket, frame, handle) {
  const release = gate.take(socket, frame);
  if (!release) {
    try { socket.close(1013, 'session_busy'); } catch {}
    return Promise.resolve();
  }
  return Promise.resolve().then(handle).finally(release);
}
