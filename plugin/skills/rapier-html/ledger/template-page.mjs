// SPDX-License-Identifier: MIT
import {readDocumentSettings} from "./document-settings.mjs";
export const isTemplatePage = source => readDocumentSettings(source).template === 'page';
export const isPageBorderLayout = layout => layout?.wrap === 'behind' && layout.lock === 'on';
