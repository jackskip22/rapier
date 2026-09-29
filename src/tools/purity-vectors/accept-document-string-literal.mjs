// ACCEPT: 'document.find' is an operation *name*, a string literal, never an identifier
// reference. Purity is about bindings, not words (docs/kernel.md, "The gates").
export const operationName = 'document.find';
export function describe() {
  return `Operation: ${operationName}`;
}
