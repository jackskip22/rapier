// SPDX-License-Identifier: AGPL-3.0-only
// Centre lines use an em of 100, a baseline of 100 and separate paths for each pen lift.
const GLYPHS = {
	A: [76, ['M5 100 L34 3 Q36 -2 39 5 L69 100', 'M17 66 Q38 63 57 65']],
	B: [73, ['M12 100 L12 2', 'M12 3 Q62 -5 62 25 Q62 46 14 49 Q70 44 67 76 Q64 105 12 100']],
	C: [76, ['M67 13 Q52 -4 31 4 Q9 13 8 49 Q6 84 27 96 Q49 109 69 89']],
	D: [78, ['M12 100 L12 2 Q65 -4 68 44 Q76 99 12 100']],
	E: [66, ['M59 3 L12 3 L12 100 L62 100', 'M13 48 L51 48']],
	F: [65, ['M12 100 L12 3 L60 3', 'M13 47 L51 47']],
	G: [82, ['M72 16 Q52 -5 29 6 Q6 20 9 61 Q11 100 43 100 Q61 101 72 90 L72 57 L47 57']],
	H: [81, ['M12 2 L12 100', 'M69 2 L69 100', 'M12 49 L68 49']],
	I: [37, ['M8 3 L29 3', 'M19 3 L19 100', 'M6 100 L31 100']],
	J: [59, ['M47 3 L47 76 Q49 102 25 101 Q9 101 6 85', 'M27 3 L56 3']],
	K: [73, ['M12 2 L12 100', 'M65 3 L12 56 L69 100']],
	L: [64, ['M12 2 L12 100 L58 100']],
	M: [95, ['M10 100 L12 3 L47 65 L82 3 L85 100']],
	N: [81, ['M12 100 L12 3 L69 100 L69 3']],
	O: [83, ['M44 2 Q76 1 75 51 Q74 102 41 101 Q7 100 8 49 Q9 0 44 2']],
	P: [71, ['M12 100 L12 3 Q66 -3 63 31 Q61 58 12 54']],
	Q: [84, ['M44 2 Q76 1 75 51 Q74 102 41 101 Q7 100 8 49 Q9 0 44 2', 'M47 79 L79 114']],
	R: [75, ['M12 100 L12 3 Q66 -3 63 29 Q62 54 12 52', 'M35 52 L69 101']],
	S: [70, ['M61 13 Q47 -5 25 4 Q3 15 16 37 Q22 46 42 53 Q71 64 61 87 Q51 111 11 92']],
	T: [72, ['M4 3 L68 3', 'M36 3 L36 100']],
	U: [81, ['M12 3 L12 73 Q12 101 40 101 Q68 101 68 73 L68 3']],
	V: [76, ['M5 3 L36 101 L70 3']],
	W: [105, ['M5 3 L26 101 L53 27 L79 101 L99 3']],
	X: [74, ['M7 3 L67 100', 'M66 3 L7 100']],
	Y: [74, ['M5 3 L37 51 L68 3', 'M37 51 L37 100']],
	Z: [72, ['M8 3 L65 3 L7 100 L67 100']],
	a: [60, ['M49 47 Q35 33 19 47 Q4 62 10 85 Q15 108 35 95 Q49 85 49 44 L48 88 Q48 101 56 96']],
	b: [61, ['M12 2 L12 98', 'M12 60 Q25 34 44 43 Q58 51 54 74 Q51 100 30 100 Q19 100 12 91']],
	c: [55, ['M48 47 Q35 34 20 45 Q5 56 9 80 Q12 110 49 93']],
	d: [62, ['M49 50 Q34 33 19 47 Q4 63 11 86 Q19 110 38 94 Q50 82 50 3 L49 88 Q49 100 58 96']],
	e: [56, ['M10 68 Q49 72 48 53 Q47 36 27 41 Q7 46 9 77 Q12 108 50 93']],
	f: [41, ['M12 126 L17 30 Q18 0 37 3 Q46 5 39 17', 'M4 48 L35 48']],
	g: [61, ['M49 47 Q30 32 15 52 Q3 70 14 91 Q26 111 47 84', 'M49 44 L48 112 Q46 137 21 129 Q10 125 16 115']],
	h: [63, ['M12 3 L12 99', 'M12 62 Q25 35 43 43 Q52 46 51 69 L51 91 Q51 102 59 96']],
	i: [27, ['M12 44 L12 87 Q12 101 22 96', 'M13 20 L14 21']],
	j: [30, ['M19 44 L19 110 Q19 134 1 128', 'M20 20 L21 21']],
	k: [58, ['M12 3 L12 100', 'M49 44 L12 75', 'M28 63 Q40 98 54 97']],
	l: [28, ['M12 3 L12 86 Q12 102 23 97']],
	m: [89, ['M11 44 L11 99', 'M11 60 Q23 36 37 43 Q44 47 43 68 L43 99', 'M43 60 Q57 35 70 44 Q78 50 77 72 L77 91 Q77 102 85 96']],
	n: [63, ['M11 44 L11 99', 'M11 61 Q25 35 43 43 Q52 49 51 71 L51 91 Q51 102 59 96']],
	o: [61, ['M32 40 Q57 39 53 73 Q51 101 30 101 Q7 101 8 72 Q8 42 32 40']],
	p: [63, ['M12 44 L12 129', 'M12 59 Q25 35 43 44 Q58 53 53 77 Q48 101 29 100 Q19 100 12 90']],
	q: [61, ['M49 47 Q32 33 17 50 Q3 68 14 90 Q23 106 41 94 Q50 84 49 44 L49 130']],
	r: [44, ['M11 44 L11 99', 'M11 61 Q25 36 39 45']],
	s: [52, ['M44 48 Q30 35 16 45 Q3 56 24 66 Q49 76 43 90 Q37 109 9 94']],
	t: [41, ['M17 18 L17 84 Q16 107 36 96', 'M3 47 L35 47']],
	u: [63, ['M11 44 L11 79 Q9 102 28 100 Q43 98 50 79', 'M50 44 L50 86 Q49 102 59 96']],
	v: [56, ['M7 44 Q14 86 29 100 Q47 80 50 44']],
	w: [81, ['M7 44 Q12 87 23 100 Q34 85 40 60 Q43 91 55 100 Q72 83 74 44']],
	x: [55, ['M7 44 L47 100', 'M47 44 L7 100']],
	y: [60, ['M8 44 Q15 83 29 100', 'M51 44 Q40 97 23 122 Q12 138 4 126']],
	z: [52, ['M7 44 L46 44 L8 100 L47 100']],
	0: [65, ['M34 2 Q58 2 56 53 Q55 101 32 101 Q9 100 10 51 Q10 3 34 2']],
	1: [46, ['M8 23 L27 3 L27 100', 'M11 100 L42 100']],
	2: [65, ['M9 23 Q13 -2 35 3 Q63 8 51 36 Q43 50 10 98 L59 98']],
	3: [65, ['M10 14 Q28 -5 46 7 Q70 27 31 47 Q65 48 57 79 Q47 113 8 92']],
	4: [67, ['M49 101 L49 3 L5 69 L61 69']],
	5: [63, ['M55 3 L16 3 L12 47 Q56 35 55 72 Q57 110 9 95']],
	6: [64, ['M52 8 Q29 -4 16 23 Q-1 65 16 91 Q33 112 51 92 Q66 74 52 58 Q33 36 12 62']],
	7: [62, ['M5 3 L57 3 Q28 56 19 100']],
	8: [65, ['M34 3 Q9 3 12 24 Q14 41 42 54 Q72 70 52 93 Q33 110 15 94 Q-5 74 24 52 Q59 29 54 16 Q51 3 34 3']],
	9: [64, ['M53 43 Q34 64 17 47 Q4 31 17 12 Q31 -6 48 9 Q65 27 53 71 Q43 106 16 97']],
	'.': [25, ['M12 98 L13 100']], ',': [26, ['M15 97 Q17 108 8 115']],
	':': [25, ['M12 55 L13 57', 'M12 98 L13 100']], ';': [26, ['M12 55 L13 57', 'M15 97 Q17 108 8 115']],
	'!': [29, ['M15 3 L14 75', 'M14 98 L15 100']],
	'?': [55, ['M7 17 Q17 -1 34 4 Q60 16 38 39 Q24 51 26 75', 'M26 98 L27 100']],
	"'": [22, ['M13 3 L9 24']], '"': [36, ['M12 3 L8 24', 'M29 3 L25 24']],
	'-': [42, ['M5 66 L36 66']], '_': [61, ['M4 111 L58 111']],
	'/': [49, ['M43 1 L6 108']], '\\': [49, ['M6 1 L43 108']],
	'(': [35, ['M27 -6 Q-3 48 27 110']], ')': [35, ['M8 -6 Q38 48 8 110']],
	'[': [35, ['M29 -2 L12 -2 L12 105 L29 105']], ']': [35, ['M6 -2 L23 -2 L23 105 L6 105']],
	'{': [40, ['M32 -4 Q15 -4 17 24 Q19 43 6 51 Q19 57 17 82 Q15 109 32 109']],
	'}': [40, ['M8 -4 Q25 -4 23 24 Q21 43 34 51 Q21 57 23 82 Q25 109 8 109']],
	'+': [62, ['M7 63 L55 63', 'M31 38 L31 89']], '=': [62, ['M7 52 L55 52', 'M7 76 L55 76']],
	'<': [55, ['M45 35 L8 64 L45 93']], '>': [55, ['M10 35 L47 64 L10 93']],
	'&': [79, ['M66 98 Q44 78 24 48 Q7 22 23 7 Q43 -9 52 14 Q58 32 31 51 Q0 75 16 94 Q44 115 71 55']],
	'@': [96, ['M65 48 Q46 35 36 53 Q27 75 39 85 Q54 94 64 68 L68 44 L64 80 Q69 94 82 76 Q102 34 72 13 Q36 -9 15 26 Q-3 59 14 87 Q34 118 73 100']],
	'#': [74, ['M28 19 L17 106', 'M55 19 L44 106', 'M9 49 L67 49', 'M5 78 L63 78']],
	'$': [65, ['M56 18 Q33 -1 17 17 Q0 35 33 52 Q70 69 50 91 Q31 111 8 90', 'M34 -8 L31 112']],
	'%': [84, ['M69 3 L13 100', 'M24 4 Q40 4 35 26 Q31 45 15 40 Q0 37 7 18 Q11 3 24 4', 'M66 60 Q82 61 77 82 Q73 103 58 99 Q43 95 50 77 Q54 60 66 60']],
	'*': [52, ['M26 17 L26 62', 'M7 28 L45 51', 'M7 51 L45 28']],
	'^': [55, ['M7 43 L27 16 L48 43']], '|': [25, ['M13 -5 L13 115']],
	'~': [63, ['M6 66 Q18 47 32 63 Q47 78 57 59']],
	'`': [26, ['M7 3 L19 21']],
	'°': [38, ['M21 2 Q36 3 29 19 Q22 32 11 23 Q0 10 11 4 Q15 1 21 2']],
	'€': [70, ['M63 15 Q37 -6 20 16 Q2 41 16 81 Q32 113 61 90', 'M3 43 L46 43', 'M3 63 L40 63']],
	'£': [65, ['M55 15 Q38 -6 23 14 Q16 28 22 57 Q28 79 12 99 L57 99', 'M9 58 L43 58']],
};

const finite = Number.isFinite;
function flattenCentreline(source) {
	const tokens = source.match(/[MLQC]|-?\d+(?:\.\d+)?/g), out = [];
	let i = 0, point;
	while (i < tokens.length) {
		const command = tokens[i++], pair = () => [+tokens[i++], +tokens[i++]];
		if (command === 'M' || command === 'L') { point = pair(); out.push(point); continue; }
		const a = point, b = pair(), c = pair(), d = command === 'C' ? pair() : null;
		const length = Math.hypot(a[0] - b[0], a[1] - b[1]) + Math.hypot(b[0] - c[0], b[1] - c[1]) + (d ? Math.hypot(c[0] - d[0], c[1] - d[1]) : 0);
		const count = Math.max(2, Math.ceil(length / 5));
		for (let step = 1; step <= count; step++) {
			const t = step / count, u = 1 - t;
			out.push(d ? [u ** 3 * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t ** 3 * d[0], u ** 3 * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t ** 3 * d[1]]
				: [u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]]);
		}
		point = d || c;
	}
	return out;
}

const ACCENTS = {
	'\u0300': ['M7 -20 L-7 -5'], '\u0301': ['M-7 -5 L7 -20'],
	'\u0302': ['M-13 -5 L0 -18 L13 -5'], '\u0303': ['M-16 -8 Q-8 -20 0 -10 Q8 0 16 -12'],
	'\u0304': ['M-14 -10 L14 -10'], '\u0306': ['M-14 -18 Q0 5 14 -18'],
	'\u0307': ['M0 -11 L1 -10'], '\u0308': ['M-10 -11 L-9 -10', 'M10 -11 L11 -10'],
	'\u0309': ['M-6 -18 Q10 -27 9 -14 Q9 -9 0 -4'], '\u030a': ['M0 -21 Q12 -20 9 -10 Q4 -2 -5 -7 Q-15 -18 0 -21'],
	'\u030c': ['M-13 -18 L0 -5 L13 -18'], '\u0323': ['M0 12 L1 13'],
	'\u0327': ['M2 2 L-5 10 Q10 7 6 18 Q1 23 -7 20'],
	'\u031b': ['M-2 9 Q14 7 12 -11'],
};
const freezePaths = paths => Object.freeze(paths.map(path => Object.freeze(path.map(point => Object.freeze(point)))));
const glyphs = Object.fromEntries(Object.entries(GLYPHS).map(([character, [advance, lines]]) => [character, Object.freeze({advance, paths: freezePaths(lines.map(flattenCentreline))})]));
const withBar = (base, line) => Object.freeze({advance: base.advance, paths: freezePaths([...base.paths, flattenCentreline(line)])});
glyphs['Đ'] = withBar(glyphs.D, 'M3 49 L34 49');
glyphs['đ'] = withBar(glyphs.d, 'M34 24 L61 24');
glyphs['ı'] = Object.freeze({advance: glyphs.i.advance, paths: freezePaths(glyphs.i.paths.slice(0, 1))});
glyphs['–'] = Object.freeze({advance: 69, paths: freezePaths([[[5, 66], [64, 66]]])});
glyphs['—'] = Object.freeze({advance: 100, paths: freezePaths([[[5, 66], [95, 66]]])});
glyphs['…'] = Object.freeze({advance: 69, paths: freezePaths([[[8, 98], [9, 100]], [[32, 98], [33, 100]], [[56, 98], [57, 100]]])});
for (const character of ['‘', '’']) glyphs[character] = glyphs["'"];
for (const character of ['“', '”']) glyphs[character] = glyphs['"'];
Object.freeze(glyphs);

export const WATER_STROKE_SET_ID = 'water-hand';
export const WATER_LETTER_SETS = Object.freeze([Object.freeze({id: WATER_STROKE_SET_ID, name: 'Hand', em: 100, baseline: 100, space: 36})]);

// A null glyph refuses unsupported text before any paths enter the painting.
export function strokeLetterGlyph(character, set = WATER_STROKE_SET_ID) {
	if (set !== WATER_STROKE_SET_ID || typeof character !== 'string') return null;
	const chars = [...character.normalize('NFD')], base = chars.shift(), glyph = glyphs[base];
	if (!glyph || chars.length > 3 || chars.some(mark => !Object.hasOwn(ACCENTS, mark)) || chars.length && !/^[A-Za-zıĐđ]$/.test(base)) return null;
	if (!chars.length) return glyph;
	const upper = base === base.toUpperCase(), top = upper ? 0 : 40;
	const removeDot = (base === 'i' || base === 'j') && chars.some(mark => !['\u0323', '\u0327'].includes(mark));
	const paths = (removeDot ? glyph.paths.slice(0, 1) : glyph.paths).map(path => path.map(point => point.slice()));
	let above = top;
	for (const mark of chars) {
		const below = mark === '\u0323' || mark === '\u0327', horn = mark === '\u031b';
		const x = horn ? glyph.advance - 12 : glyph.advance / 2, y = below ? 100 : horn ? top : above;
		for (const source of ACCENTS[mark]) paths.push(flattenCentreline(source).map(point => [point[0] + x, point[1] + y]));
		if (!below && !horn) above -= 23;
	}
	if (paths.some(path => path.some(point => !point.every(finite)))) return null;
	return Object.freeze({advance: glyph.advance, paths: freezePaths(paths)});
}
