// REJECT: a function declaration nested inside a switch case is scoped to the switch statement's
// own single block (spec: one lexical scope shared by every case) -- it must not leak out to a
// module-level call either.
switch (1) {
  case 1:
    function fetch() { return 'never runs'; }
    break;
}
export function callRealFetch() {
  return fetch('https://example.invalid/'); // no fetch bound here -- the real global, must be flagged
}
