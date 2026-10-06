// REJECT: a true Date.now() read, no shadow anywhere in the file.
export function readClock() {
  return Date.now();
}
