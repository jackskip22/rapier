// ACCEPT: a local Date shadow used only in its own scope is a real binding, not the global clock.
export function usesLocalDate() {
  const Date = { now() { return 42; } };
  return Date.now();
}
