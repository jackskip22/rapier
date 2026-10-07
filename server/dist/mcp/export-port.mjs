// SPDX-License-Identifier: AGPL-3.0-only
// The worker writes the txt and page files through a document realm its platform supplies: the Cloudflare entry installs the
// inert one (render-export.mjs, with its parser and sanitizer packages) and a host that carries no packages leaves the port
// empty, so the worker answers those two formats by name instead of loading what it does not have.
let renderer = null;
export function configureExportRenderer(next) {
  if (next !== null && !(typeof next?.renderText === 'function' && typeof next?.renderPage === 'function')) throw new TypeError('An export renderer writes txt and page');
  renderer = next;
}
export const exportRenderer = () => renderer;
