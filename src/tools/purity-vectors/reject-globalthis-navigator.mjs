// REJECT: globalThis.navigator -- the same DOM binding as the bare `navigator` identifier,
// spelled through globalThis. The explicit globalThis.<x> member set must cover this the same as
// it covers globalThis.fetch/.document/.window.
export function readAgent() {
  return globalThis.navigator;
}
