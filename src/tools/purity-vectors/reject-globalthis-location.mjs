// REJECT: globalThis.location -- the same DOM/navigation binding as the bare `location`
// identifier, spelled through globalThis.
export function readAddress() {
  return globalThis.location;
}
