// SPDX-License-Identifier: MIT
export const WORD_SIDECAR_OPEN = '<!-- rapier-word:v1\n';
export function isWordSidecarBlock(raw) {
  return typeof raw === 'string' && /^<!-- rapier-word:v1\r?\n[^\r\n]*\r?\n-->[ \t\r\n]*$/.test(raw);
}
