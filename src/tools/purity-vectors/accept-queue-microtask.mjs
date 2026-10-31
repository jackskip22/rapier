// ACCEPT: queueMicrotask schedules without reading a clock or randomness -- deliberately not a
// banned global.
export function scheduleFollowUp(task) {
  queueMicrotask(task);
}
