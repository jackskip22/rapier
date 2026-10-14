// Every module in the decision graph is checked, including a dependency with a clock.
// A vendor label grants no exemption from injected inputs.
export function vendoredOperation() {
  return Date.now();
}
