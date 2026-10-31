// SPDX-License-Identifier: MIT
// Unicode mathematical alphabets shared by SVG and MathML. No font lookup.
const MATH_STYLED_RANGES = {
  italic: [0x1d434, 0x1d44e, null], bold: [0x1d400, 0x1d41a, 0x1d7ce],
  'bold-italic': [0x1d468, 0x1d482, 0x1d7ce], script: [0x1d49c, 0x1d4b6, null],
  'bold-script': [0x1d4d0, 0x1d4ea, null], fraktur: [0x1d504, 0x1d51e, null],
  'bold-fraktur': [0x1d56c, 0x1d586, null], 'double-struck': [0x1d538, 0x1d552, 0x1d7d8],
  'sans-serif': [0x1d5a0, 0x1d5ba, 0x1d7e2], 'sans-serif-bold': [0x1d5d4, 0x1d5ee, 0x1d7ec],
  'sans-serif-italic': [0x1d608, 0x1d622, null], 'sans-serif-bold-italic': [0x1d63c, 0x1d656, 0x1d7ec],
  monospace: [0x1d670, 0x1d68a, 0x1d7f6],
};
const MATH_STYLED_LEGACY = {
  italic: {104: 0x210e},
  script: {66:0x212c,69:0x2130,70:0x2131,72:0x210b,73:0x2110,76:0x2112,77:0x2133,82:0x211b,101:0x212f,103:0x210a,111:0x2134},
  fraktur: {67:0x212d,72:0x210c,73:0x2111,82:0x211c,90:0x2128},
  'double-struck': {67:0x2102,72:0x210d,78:0x2115,80:0x2119,81:0x211a,82:0x211d,90:0x2124},
};
const MATH_STYLED_GREEK = {bold:0x1d6a8, italic:0x1d6e2, 'bold-italic':0x1d71c, 'sans-serif-bold':0x1d756, 'sans-serif-bold-italic':0x1d790};
const MATH_STYLED_GREEK_SPECIAL = [0x2207,0x2202,0x3f5,0x3d1,0x3f0,0x3d5,0x3f1,0x3d6];
function mathStyledCodePoint(cp, variant) {
  if (variant === 'normal') variant = 'italic';
  if (MATH_STYLED_LEGACY[variant]?.[cp] !== undefined) return MATH_STYLED_LEGACY[variant][cp];
  const r = MATH_STYLED_RANGES[variant];
  if (r) {
    if (cp >= 65 && cp <= 90) return r[0] + cp - 65;
    if (cp >= 97 && cp <= 122) return r[1] + cp - 97;
    if (r[2] && cp >= 48 && cp <= 57) return r[2] + cp - 48;
  }
  const greek = MATH_STYLED_GREEK[variant];
  if (greek !== undefined) {
    if (cp >= 0x391 && cp <= 0x3a9 && cp !== 0x3a2) return greek + cp - 0x391;
    if (cp >= 0x3b1 && cp <= 0x3c9) return greek + 26 + cp - 0x3b1;
    const special = MATH_STYLED_GREEK_SPECIAL.indexOf(cp);
    if (special === 0) return greek + 25;
    if (special > 0) return greek + 50 + special;
  }
  return cp;
}


export {mathStyledCodePoint};
