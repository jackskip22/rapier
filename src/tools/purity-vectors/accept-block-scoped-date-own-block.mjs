// ACCEPT: a function declaration block-scoped to its own if-block, used only inside that same
// block, is a real local binding shadowing the global for its entire (and only) extent -- never a
// violation, the same as accept-local-date-shadow.mjs's `const Date` shadow one scope down.
export function usesBlockScopedDate() {
  if (true) {
    function Date() { return { now() { return 42; } }; }
    return Date.now();
  }
  return null;
}
