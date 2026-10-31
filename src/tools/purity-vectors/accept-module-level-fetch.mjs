// ACCEPT: a real module-level function declaration named `fetch` is a genuine binding -- calling
// it is calling the local function, not the banned global, exactly like any other user-defined
// name that happens to collide with one on the banned list.
function fetch(handle) {
  return { handle, delivered: true };
}
export function callLocalFetch() {
  return fetch('local-handle');
}
