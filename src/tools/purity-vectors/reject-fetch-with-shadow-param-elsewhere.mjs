// REJECT: a true fetch() call beside a parameter named `fetch` in a different, unrelated
// function -- the parameter must not leak scope and license the real call.
function withLocalFetch(fetch) {
  return fetch('local-handle'); // bound to the parameter -- not a violation
}
function callsRealFetch() {
  return fetch('https://example.invalid/'); // no local fetch here -- the real global, must be flagged
}
export const results = [withLocalFetch, callsRealFetch];
