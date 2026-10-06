// ACCEPT: a parameter named fetch, used only inside its own function, is a real local binding.
export function withLocalFetch(fetch) {
  return fetch('local-handle');
}
