// REJECT: the planted defect this gate exists to catch ("Purity is about bindings, not words"). A
// local `Date` shadow in one function must never mask a real Date.now() read in a sibling function
// -- a flat "declared anywhere in the file" set would do exactly that; real lexical scoping must
// not.
function a() {
  const Date = { now() { return 0; } };
  return Date.now(); // bound to the local shadow -- not a violation
}
function b() {
  return Date.now(); // no local Date here -- the real global, must be flagged
}
export const results = [a(), b()];
