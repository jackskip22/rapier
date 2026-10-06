// REJECT: same defect, spelled with Date.now instead of fetch -- a block-scoped `function Date`
// must not mask a real Date.now() read once the block that declared it has ended.
if (false) {
  function Date() { return { now() { return 0; } }; }
}
export function readClock() {
  return Date.now(); // no Date bound here -- the real global, must be flagged
}
