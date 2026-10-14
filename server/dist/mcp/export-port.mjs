// SPDX-License-Identifier: AGPL-3.0-only
let renderer = null;
export function configureExportRenderer(next) {
  if (next !== null && typeof next?.renderText !== 'function') throw new TypeError('An export renderer writes plain text');
  renderer = next;
}
export const exportRenderer = () => renderer;
