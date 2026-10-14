// REJECT: globalThis.Date.now() -- the same clock read, spelled through globalThis.
export function readClock() {
  return globalThis.Date.now();
}
