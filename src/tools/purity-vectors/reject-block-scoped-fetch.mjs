// REJECT: a function declaration nested inside an if-block is block-scoped in strict-mode code --
// it must never leak upward and license a real module-level fetch() call. This is the planted
// defect the block-scope fix exists to catch: hoisting that walks through block boundaries the
// same way it walks through them for `var` treats this as module-scoped and misses the real call.
if (false) {
  function fetch() { return 'never runs'; }
}
export function callRealFetch() {
  return fetch('https://example.invalid/'); // no fetch bound here -- the real global, must be flagged
}
