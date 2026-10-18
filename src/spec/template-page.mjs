// SPDX-License-Identifier: MIT
export function isTemplatePage(source) {
  const match = /^(?:﻿)?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(String(source).slice(0, 65536));
  return !!match && /^template:[ \t]*page[ \t]*(?:#.*)?$/m.test(match[1]);
}
export const isPageBorderLayout = layout => layout?.wrap === 'behind' && layout.lock === 'on';
