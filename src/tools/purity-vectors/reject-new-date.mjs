// REJECT: new Date() with no arguments is a clock read spelled as a constructor call.
export function readClock() {
  return new Date();
}
