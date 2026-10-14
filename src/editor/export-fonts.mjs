// SPDX-License-Identifier: AGPL-3.0-only
// Application font capabilities stay outside the portable MIT renderer.
import {exportFontCss, requireDocumentFonts, fontRequests, waitForFonts, waitForFontRequests} from '../kit/export-fonts.mjs';
import {materializeDocumentFonts, materializeComparisonFonts} from '../kit/document-fonts.mjs';
import {importFonts} from '../draw/font.mjs';

export {exportFontCss, requireDocumentFonts, fontRequests, waitForFonts, waitForFontRequests, materializeDocumentFonts, materializeComparisonFonts};

export async function validateFont(bytes, {family = 'document-font', format = 'font'} = {}) {
  const result = await importFonts([{name: family + '.' + format, bytes}]);
  return result.refused.length === 0 && result.fonts.length === 1;
}
