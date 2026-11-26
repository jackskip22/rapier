// SPDX-License-Identifier: MIT
export default function jxlLoader({src, width}) {
  const clean = String(src ?? '').split(/[?#]/)[0];
  if (!/^\/(?!\/)[^\\]*\.(?:jpe?g|png)$/i.test(clean) || clean.split('/').some(s => s === '.' || s === '..') || !Number.isInteger(width) || width < 1)
    return src;
  return `/_jxl/w${width}${clean}.jxl`;
}
