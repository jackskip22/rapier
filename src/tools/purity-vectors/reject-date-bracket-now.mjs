// REJECT: Date['now']() -- a computed member with a string-literal key is the same binding as
// Date.now(), just spelled differently.
export function readClock() {
  return Date['now']();
}
