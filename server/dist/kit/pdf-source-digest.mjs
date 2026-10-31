// SPDX-License-Identifier: MIT
export const PDF_SOURCE_DIGEST = '/RapierSourceDigest <' + '0'.repeat(64) + '>';

export async function pdfSourceDigest(bytes, start, end) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start + 64 > end || end > bytes.length)
    throw new Error('Invalid PDF source digest range.');
  const bound = bytes.slice(0, end);
  bound.fill(48, start, start + 64);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bound)), byte => byte.toString(16).padStart(2, '0')).join('');
}
