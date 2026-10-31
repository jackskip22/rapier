// SPDX-License-Identifier: MIT
import {markdownSourcePositions} from './md-source.mjs';

export function fontDataUrl(url) {
	if (typeof url !== 'string') return null;
	const match = /^data:font\/(woff2|woff|ttf|otf);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(url);
	if (!match || match[2].length % 4) return null;
	const padding = match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0;
	const byteLength = match[2].length / 4 * 3 - padding;
	return byteLength >= 12 ? {format: match[1].toLowerCase(), byteLength, data: match[2]} : null;
}

const inkReader = () => {
	// SPDX-License-Identifier: MIT
	const TEXT_COLOR_NAMES = Object.freeze({ green: '#1c7547', red: '#b32034', blue: '#175dc4', gold: '#865818', purple: '#7924d7' });

	const COLOR_NAME_ALT = Object.keys(TEXT_COLOR_NAMES).join('|');
	const COLOR_VALUE = '(?:#[0-9a-f]{6}|' + COLOR_NAME_ALT + ')';

	const INK_KINDS = Object.freeze(['under', 'strike', 'ring', 'bracket', 'free', 'arrow', 'end']);

	const INK_PATH_MAX = 160;
	const INK_INT_MAX = 999999;
	const INK_INT = '-?\\d{1,6}';
	const INK_OPEN_BODY = '(' + INK_KINDS.join('|') + ')(?: ([1-9]\\d{0,5}))?(?: (' + COLOR_VALUE + '))?(?: w=([1-9]\\d?))?(?: box=(\\d{1,6}),(\\d{1,6}))?(?: at=(' + INK_INT + '),(' + INK_INT + '))?'
		+ '(?: (' + INK_INT + ',' + INK_INT + '(?: ' + INK_INT + ',' + INK_INT + ')*))?';
	const INK_OPEN_PATTERN = '<!--ink ' + INK_OPEN_BODY + '-->';

	function readInkMatch(match) {
		const linked = match[1] === 'arrow' || match[1] === 'end';
		if (linked !== (match[2] != null) || (!linked && match[1] !== 'under' && match[1] !== 'strike' && match[9] == null)) return null;
		if (match[1] === 'end' && match.slice(3, 10).some(value => value != null)) return null;
		const width = match[4] == null ? null : Number(match[4]);
		if (width != null && (width < 2 || width > 24 || width === 9)) return null;
		const moves = match[9] == null ? [] : match[9].split(' ').map(pair => pair.split(',').map(Number));
		if (moves.length > INK_PATH_MAX) return null;
		const path = moves.length ? [moves[0]] : [];
		for (let i = 1; i < moves.length; i++) {
			const point = [path[i - 1][0] + moves[i][0], path[i - 1][1] + moves[i][1]];
			if (Math.abs(point[0]) > INK_INT_MAX || Math.abs(point[1]) > INK_INT_MAX) return null;
			path.push(point);
		}
		const colour = match[3] || null;
		return Object.freeze({
			kind: match[1],
			...(linked ? { id: Number(match[2]) } : {}),
			hex: colour == null ? null : (colour.charCodeAt(0) === 0x23 ? colour : TEXT_COLOR_NAMES[colour]),
			...(width == null ? {} : { width }),
			box: match[5] == null ? null : [Number(match[5]), Number(match[6])],
			at: match[7] == null ? null : [Number(match[7]), Number(match[8])],
			path,
		});
	}

	function parseInkOpen(comment) {
		if (typeof comment !== 'string') return null;
		const match = new RegExp('^' + INK_OPEN_PATTERN + '$').exec(comment);
		return match && readInkMatch(match);
	}

	function parseInkBody(body) {
		return typeof body === 'string' ? parseInkOpen('<!--ink ' + body + '-->') : null;
	}
	return { TEXT_COLOR_NAMES, COLOR_NAME_ALT, COLOR_VALUE, INK_KINDS, INK_PATH_MAX, INK_INT_MAX, INK_OPEN_PATTERN, readInkMatch, parseInkOpen, parseInkBody };
};
const { TEXT_COLOR_NAMES, COLOR_VALUE, INK_KINDS, INK_PATH_MAX, INK_INT_MAX, INK_OPEN_PATTERN, readInkMatch, parseInkOpen, parseInkBody } = inkReader();
export { readInkMatch, parseInkOpen, parseInkBody };

const TEXT_COLOR_HEX_TO_NAME = Object.freeze(
	Object.fromEntries(Object.entries(TEXT_COLOR_NAMES).map(([name, hex]) => [hex, name]))
);
const PAGE_BREAK_MARKER = '<!--md-break:v1 page-->';

export { TEXT_COLOR_NAMES, PAGE_BREAK_MARKER };

export function formatColorRun(hex, content) {
	return typography.wrap({color: hex}, content);
}

export const FONT_STACKS = Object.freeze({
	sans: Object.freeze({stack: 'sans', css: '', word: ''}),
	serif: Object.freeze({stack: 'serif', css: "Georgia,'Palatino Linotype',Palatino,'Times New Roman',Times,serif", word: 'Georgia'}),
	mono: Object.freeze({stack: 'mono', css: "ui-monospace,'Courier New',Courier,monospace", word: 'Courier New'}),
	system: Object.freeze({stack: 'system', css: 'system-ui,sans-serif', word: 'Calibri'}),
	hand: Object.freeze({stack: 'hand', css: 'cursive', word: 'Segoe Print'}),
});

export function normalizeFontFamily(value) {
	if (typeof value !== 'string') return null;
	const family = value.trim();
	return family && family.length <= 256 && family.isWellFormed() && !/[\u0000-\u001f\u007f<>\u2028\u2029]/.test(family) && !family.includes('--') ? family : null;
}

export function fontFamilyCss(value) {
	const family = normalizeFontFamily(value);
	if (family == null) return '';
	const generic = Object.hasOwn(FONT_STACKS, family.toLowerCase()) ? FONT_STACKS[family.toLowerCase()] : null;
	return generic ? generic.css || "'Geist',system-ui,sans-serif" : '"' + family.replace(/[\\"]/g, '\\$&') + '"';
}

export function formatFontRun(family, content) {
	return typography.wrap({family}, content);
}

export function createTypography({normalizeFontFamily, fontFamilyCss, FONT_STACKS}) {
	const LIMIT = 4096, DEPTH = 64;
	const generics = {serif: 'serif', 'sans-serif': 'sans', monospace: 'mono', cursive: 'hand',
		fantasy: 'fantasy', 'system-ui': 'system', 'ui-serif': 'ui-serif', 'ui-sans-serif': 'ui-sans-serif',
		'ui-monospace': 'ui-monospace', 'ui-rounded': 'ui-rounded', emoji: 'emoji', math: 'math', fangsong: 'fangsong'};
	const escape = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	function size(value) {
		if (typeof value !== 'string' || value.length > 48) return null;
		const match = /^(\d+(?:\.\d{0,12})?|\.\d{1,12})\s*(pt|px)$/i.exec(value.trim());
		if (!match) return null;
		const number = Number(match[1]), unit = match[2].toLowerCase(), points = number * (unit === 'px' ? .75 : 1);
		if (!(points > 0 && points <= 1638)) return null;
		const [integer, fraction = ''] = match[1].split('.'), tail = fraction.replace(/0+$/, '');
		return Object.freeze({css: (integer.replace(/^0+/, '') || '0') + (tail ? '.' + tail : '') + unit,
			unit, value: number, points, halfPoints: points * 2});
	}
	function color(value) {
		if (typeof value !== 'string') return null;
		if (/^#[0-9a-f]{6}$/i.test(value.trim())) return value.trim().toLowerCase();
		const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*1\s*)?\)$/i.exec(value.trim());
		return rgb && rgb.slice(1).every(channel => Number(channel) <= 255)
			? '#' + rgb.slice(1).map(channel => Number(channel).toString(16).padStart(2, '0')).join('') : null;
	}
	function familyCss(value) {
		if (typeof value !== 'string' || value.length > 2048) return null;
		const css = value.trim();
		const stackKey = text => text.replace(/'/g, '"').replace(/"([\w-]+)"/g, '$1').replace(/\s*,\s*/g, ',');
		for (const [name] of Object.entries(FONT_STACKS)) if ((!/^["']/.test(css) || css.includes(',')) && stackKey(css) === stackKey(fontFamilyCss(name)))
			return Object.freeze({name, css: fontFamilyCss(name), custom: false});
		if (Object.hasOwn(generics, css.toLowerCase())) return Object.freeze({name: generics[css.toLowerCase()], css: css.toLowerCase(), custom: false});
		let name = css;
		if (css[0] === '"' || css[0] === "'") {
			if (css.at(-1) !== css[0]) return null;
			name = '';
			for (let at = 1; at < css.length - 1; at++) {
				if (css[at] === css[0] || /[\r\n\f]/.test(css[at])) return null;
				if (css[at] !== '\\') { name += css[at]; continue; }
				const escaped = /^\\(?:([0-9a-f]{1,6})(?:\r\n|[ \t\r\n\f])?|([^\r\n\f]))/i.exec(css.slice(at));
				if (!escaped || at + escaped[0].length > css.length - 1) return null;
				const code = escaped[1] ? parseInt(escaped[1], 16) : 0;
				name += escaped[1] ? code && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '\ufffd' : escaped[2];
				at += escaped[0].length - 1;
			}
		} else if (!/^[\p{L}_-][\p{L}\p{N}_ -]*$/u.test(css) || /^(?:inherit|initial|unset|revert|revert-layer)$/i.test(css)) return null;
		name = normalizeFontFamily(name);
		if (name && Object.hasOwn(FONT_STACKS, name.toLowerCase())) return null;
		return name ? Object.freeze({name, css: '"' + name.replace(/[\\"]/g, '\\$&') + '"', custom: true}) : null;
	}
	function family(value) {
		if (value && typeof value === 'object') {
			const parsed = familyCss(value.css);
			return parsed && parsed.name === value.name && parsed.custom === value.custom ? parsed : null;
		}
		const name = normalizeFontFamily(value);
		return name ? familyCss(fontFamilyCss(name)) : null;
	}
	function normalize(value, removals = false) {
		if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Typography requires size, color or family.');
		const result = {};
		for (const key of Object.keys(value)) {
			if (!['size', 'color', 'family'].includes(key)) throw new TypeError('Unknown typography property: ' + key);
			if (value[key] === null && removals) { result[key] = null; continue; }
			const parsed = key === 'size' ? size(value[key])?.css : key === 'color' ? color(value[key]) : family(value[key]);
			if (!parsed) throw new TypeError('Invalid typography ' + key + '.');
			result[key] = parsed;
		}
		return Object.freeze(result);
	}
	function parseStyle(value, editable = false) {
		if (typeof value !== 'string' || value.length > LIMIT) return editable ? null : Object.freeze({});
		const parts = []; let quote = '', start = 0;
		for (let at = 0; at <= value.length; at++) {
			const ch = value[at];
			if (quote) { if (ch === '\\') at++; else if (ch === quote) quote = ''; }
			else if (ch === '"' || ch === "'") quote = ch;
			else if (ch === ';' || at === value.length) { parts.push(value.slice(start, at)); start = at + 1; }
		}
		if (quote || parts.length > 32) return editable ? null : Object.freeze({});
		const result = {};
		for (const part of parts) {
			if (!part.trim()) continue;
			const colon = part.indexOf(':'); if (colon < 0) { if (editable) return null; continue; }
			const key = part.slice(0, colon).trim().toLowerCase(), raw = part.slice(colon + 1).trim();
			const parsed = key === 'font-size' ? size(raw)?.css : key === 'color' ? color(raw) : key === 'font-family' ? familyCss(raw) : null;
			if (parsed) result[key === 'font-size' ? 'size' : key === 'font-family' ? 'family' : 'color'] = parsed;
			else if (editable) return null;
		}
		return Object.freeze(result);
	}
	function style(value) {
		const held = normalize(value), parts = [];
		if (held.size) parts.push('font-size:' + held.size);
		if (held.color) parts.push('color:' + held.color);
		if (held.family) parts.push('font-family:' + held.family.css);
		return parts.join(';');
	}
	const open = value => { const css = style(value); return css ? '<span style="' + escape(css) + '">' : ''; };
	const wrap = (value, content) => {
		const start = open(value);
		if (!start || !content) return content;
		const prefix = /^(?:[ \t]*(?:\r\n|\r(?!\n)|\n))+/.exec(content)?.[0] || '';
		let body = content.slice(prefix.length);
		const suffix = /(?:[ \t]*(?:\r\n|\r(?!\n)|\n))+[ \t]*$/.exec(body)?.[0] || '';
		body = body.slice(0, body.length - suffix.length);
		if (!body) return content;
		if (/^\s*\n|\n[ \t]*\n/.test(body.replace(/\r\n?/g, '\n')))
			throw new TypeError('Typography wraps one inline paragraph at a time.');
		return prefix + start + body + '</span>' + suffix;
	};
	function parseOpen(source, decode = value => value, editable = false) {
		if (typeof source !== 'string' || source.length > LIMIT + 1024 || !/^<span(?=[\s>])/i.test(source) || !source.endsWith('>') || /\/\s*>$/.test(source)) return null;
		const attrs = /\s+([^\s=<>/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s=<>`"']+)))?/y;
		let at = 5, css = null;
		while (at < source.length - 1) {
			if (/^\s*>$/.test(source.slice(at))) break;
			attrs.lastIndex = at; const match = attrs.exec(source);
			if (!match) return null;
			at = attrs.lastIndex;
			if (match[1].toLowerCase() !== 'style') { if (editable) return null; continue; }
			if (css !== null) return null;
			css = decode(match[2] ?? match[3] ?? match[4] ?? '');
		}
		const facts = parseStyle(css, editable);
		return facts && Object.keys(facts).length ? facts : null;
	}
	function nodeStyle(node) {
		const result = {...parseStyle(node?.getAttribute?.('style') || '')};
		const authoredSize = size(node?.getAttribute?.('data-md-size'));
		const authoredColor = color(node?.getAttribute?.('data-md-color'));
		const authoredFamily = normalizeFontFamily(node?.getAttribute?.('data-md-font'));
		if (authoredSize) result.size = authoredSize.css;
		if (authoredColor) result.color = authoredColor;
		if (authoredFamily && !result.family) result.family = family(authoredFamily);
		return Object.freeze(result);
	}
	function runs(root) {
		let text = ''; const paint = [], leaves = [];
		const visit = (node, inherited, blocked) => {
			if (node.nodeType === 3) {
				const value = String(node.nodeValue || '').replace(/\u2060/g, '\n'), start = text.length;
				text += value;
				for (let index = 0; index < value.length; index++) paint.push(inherited);
				if (value) leaves.push({start, end: text.length, blocked});
				return;
			}
			if (node.nodeType !== 1 && node !== root) return;
			const own = nodeStyle(node), next = {...inherited, ...own};
			const literal = blocked || /^(?:CODE|PRE|KBD|SAMP|MATH)$/.test(node.tagName) ||
				node.classList?.contains('math-rendered') || node.classList?.contains('math-placeholder');
			for (const child of node.childNodes || []) visit(child, next, !!literal);
		};
		visit(root, {}, false);
		return {text, paint, leaves};
	}
	function install(md) {
		if (md.__rapierTypography) return md;
		md.__rapierTypography = true;
		md.core.ruler.after('linkify', 'rapier-typography', state => {
			for (let at = 0; at < state.tokens.length; at++) {
				const block = state.tokens[at];
				if (block.type !== 'inline' || !block.children || block.content.indexOf('<') < 0) continue;
				const stack = []; let depth = 0, overflow = 0;
				for (const token of block.children) {
					if (token.type !== 'html_inline') { depth += token.nesting || 0; continue; }
					const source = token.content, close = /^<\/span\s*>$/i.test(source);
					if (!close && !/^<span(?=[\s>])/i.test(source)) continue;
					if (overflow) { overflow += close ? -1 : 1; continue; }
					if (!close) {
						if (stack.length === DEPTH) { overflow = 1; continue; }
						const facts = parseOpen(source, value => md.utils.unescapeAll(value.replace(/\\/g, '\\\\')));
						stack.push({token, facts, depth, source}); continue;
					}
					const held = stack.pop();
					if (!held || !held.facts || depth !== held.depth) continue;
					const type = 'typography', opener = held.token;
					opener.type = 'rapier_' + type + '_open'; opener.tag = 'span'; opener.nesting = 1; opener.content = '';
					(opener.meta ||= {}).typography = Object.freeze({style: held.facts, open: held.source, close: source});
					opener.attrSet('style', style(held.facts));
					if (held.facts.color) opener.attrSet('data-md-color', held.facts.color);
					if (held.facts.size) opener.attrSet('data-md-size', held.facts.size);
					if (held.facts.family) opener.attrSet('data-md-font', held.facts.family.name);
					token.type = 'rapier_' + type + '_close'; token.tag = 'span'; token.nesting = -1; token.content = '';
					(token.meta ||= {}).typography = opener.meta.typography;
				}
			}
		});
		return md;
	}
	return Object.freeze({size, color, family, familyCss, normalize, parseStyle, style, open, wrap, parseOpen, nodeStyle, runs, install});
}

export const typography = createTypography({normalizeFontFamily, fontFamilyCss, FONT_STACKS});
export function typographySourceRanges(source, parser) { return markdownSourcePositions(source, parser).typography; }

const INK_CLOSE = '<!--/ink-->';
export { INK_KINDS, INK_CLOSE, INK_PATH_MAX, INK_INT_MAX, INK_OPEN_PATTERN };

const inkInt = (value, name) => {
	if (!Number.isInteger(value) || Math.abs(value) > INK_INT_MAX) throw new TypeError('ink: ' + name + ' must be an integer within ' + INK_INT_MAX);
	return value;
};
const inkPair = (value, name, nonNegative = false) => {
	if (!Array.isArray(value) || value.length !== 2) throw new TypeError('ink: ' + name + ' must be a pair of integers');
	const pair = [inkInt(value[0], name), inkInt(value[1], name)];
	if (nonNegative && (pair[0] < 0 || pair[1] < 0)) throw new TypeError('ink: ' + name + ' must not be negative');
	return pair;
};

export function formatInkOpen(mark) {
	if (!mark || typeof mark !== 'object') throw new TypeError('ink: a mark is an object');
	if (!INK_KINDS.includes(mark.kind)) throw new TypeError('ink: the kind is one of ' + INK_KINDS.join(', '));
	const linked = mark.kind === 'arrow' || mark.kind === 'end';
	if (linked ? !Number.isInteger(mark.id) || mark.id <= 0 || mark.id > INK_INT_MAX : mark.id != null) throw new TypeError('ink: only an arrow or its end has a positive pairing number');
	const id = linked ? ' ' + mark.id : '';
	if (mark.kind === 'end') {
		if (mark.hex != null || mark.width != null || mark.box != null || mark.at != null || (mark.path != null && (!Array.isArray(mark.path) || mark.path.length))) throw new TypeError('ink: an arrow end holds only its pairing number');
		return '<!--ink end' + id + '-->';
	}
	let colour = '';
	if (mark.hex != null) {
		const value = TEXT_COLOR_HEX_TO_NAME[mark.hex] || mark.hex;
		if (!new RegExp('^' + COLOR_VALUE + '$').test(value)) throw new TypeError('ink: the color is the color span\'s value');
		colour = ' ' + value;
	}
	if (mark.width != null && (!Number.isInteger(mark.width) || mark.width < 2 || mark.width > 24)) throw new TypeError('ink: the width is an integer from 2 to 24, and 9 is spelled by leaving it out');
	const width = mark.width == null || mark.width === 9 ? '' : ' w=' + mark.width;
	const box = mark.box == null ? '' : ' box=' + inkPair(mark.box, 'box', true).join(',');
	const at = mark.at == null ? '' : ' at=' + inkPair(mark.at, 'at').join(',');
	const optionalPath = linked || mark.kind === 'under' || mark.kind === 'strike';
	const path = mark.path == null && optionalPath ? [] : mark.path;
	if (!Array.isArray(path) || (!path.length && !optionalPath) || path.length > INK_PATH_MAX) throw new TypeError('ink: the path holds 1 to ' + INK_PATH_MAX + ' points, or is absent on an arrow, underline or strike');
	const points = path.map(point => inkPair(point, 'path'));
	const moves = points.length ? [points[0].join(',')] : [];
	for (let i = 1; i < points.length; i++) moves.push([inkInt(points[i][0] - points[i - 1][0], 'path move'), inkInt(points[i][1] - points[i - 1][1], 'path move')].join(','));
	return '<!--ink ' + mark.kind + id + colour + width + box + at + (moves.length ? ' ' + moves.join(' ') : '') + '-->';
}

export function formatInkRun(mark, content) {
	return formatInkOpen(mark) + content + INK_CLOSE;
}

export function matchInkOpen(text) {
	if (typeof text !== 'string') return null;
	const match = new RegExp('^' + INK_OPEN_PATTERN).exec(text);
	if (!match) return null;
	const mark = readInkMatch(match);
	return mark && { mark, length: match[0].length };
}

export function inkOpenBody(opener) {
	if (typeof opener !== 'string') return null;
	const match = new RegExp('^' + INK_OPEN_PATTERN + '$').exec(opener);
	return match && readInkMatch(match) ? opener.slice(8, -3) : null;
}
export function formatInkOpenFromBody(body) {
	return parseInkBody(body) ? '<!--ink ' + body + '-->' : null;
}

export function isInkClose(comment) {
	return comment === INK_CLOSE;
}

export function mayRetireInk(source, rows) {
  if (source.contains('<!--ink arrow ') || source.contains('<!--ink end ') || source.contains('--><!--')) return true;
  let pieces = [{from: 0, length: source.length}], length = source.length;
  const slice = (start, end) => {
    const selected = [];
    let at = 0;
    for (const piece of pieces) {
      const low = Math.max(start, at), high = Math.min(end, at + piece.length);
      if (high > low) selected.push(piece.text === undefined
        ? {from: piece.from + low - at, length: high - low}
        : {text: piece.text.slice(low - at, high - at), length: high - low});
      at += piece.length;
      if (at >= end) break;
    }
    return selected;
  };
  const read = (start, end) => slice(start, end).map(piece => piece.text === undefined
    ? source.readSlice(piece.from, piece.from + piece.length) : piece.text).join('');
  for (const row of rows) {
    const end = row.pos + row.removed.length;
    if (row.pos < 0 || end > length) return true;
    const local = read(Math.max(0, row.pos - 6), row.pos) + row.inserted + read(end, Math.min(length, end + 6));
    if (local.includes('--><!--')) return true;
    pieces = [...slice(0, row.pos), {text: row.inserted, length: row.inserted.length}, ...slice(end, length)];
    length += row.inserted.length - row.removed.length;
  }
  return false;
}

export function scanInkMarkers(source) {
	const text = String(source == null ? '' : source);
	const scan = new RegExp(INK_OPEN_PATTERN + '|' + INK_CLOSE.replace(/[-]/g, '\\-'), 'g');
	const markers = [];
	let match;
	while ((match = scan.exec(text))) {
		if (match[0] === INK_CLOSE) { markers.push({ start: match.index, end: match.index + match[0].length, mark: null, close: true }); continue; }
		const mark = readInkMatch(match);
		if (mark) markers.push({ start: match.index, end: match.index + match[0].length, mark, close: false });
	}
	return markers;
}

export function pairInkMarkers(source, markers = null) {
	return pairMarkers(source, 'ink', markers);
}

export function pairInkSpans(source, markers = null) {
	return pairSpanMarkers(source, 'ink', markers);
}

export function pairMarkers(source, kind, markers = null) {
	const paired = pairSpanMarkers(source, kind, markers);
	if (kind !== 'ink') return paired;
	const groups = new Map();
	const groupFor = id => {
		if (!groups.has(id)) groups.set(id, { id, tail: null, head: null, count: 0 });
		return groups.get(id);
	};
	for (const run of paired.runs) if (run.mark.id != null) {
		const group = groupFor(run.mark.id);
		group.count++;
		group[run.mark.kind === 'arrow' ? 'tail' : 'head'] = run;
	}
	for (const marker of paired.strays) if (marker.mark?.id != null) groupFor(marker.mark.id).count++;
	const arrows = [...groups.values()].filter(group => group.count === 2 && group.tail && group.head)
		.map(({id, tail, head}) => ({id, tail, head}));
	const complete = new Set(arrows.map(arrow => arrow.id)), runs = [], strays = paired.strays.slice();
	for (const run of paired.runs) {
		if (run.mark.id == null || complete.has(run.mark.id)) { runs.push(run); continue; }
		strays.push({ start: run.start, end: run.innerStart, mark: run.mark, close: false },
			{ start: run.innerEnd, end: run.end, mark: null, close: true, arrowId: run.mark.id });
	}
	strays.sort((a, b) => a.start - b.start);
	return { runs, strays, arrows };
}

// as spec/frontmatter.mjs, copied here so this grammar stays inside the MIT kit's closure.
const WILL_BLOCK_TAGS = new Set('address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead title tr track ul'.split(' '));
const WILL_VOID_TAGS = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));

function willLineAt(text, start) {
	let end = start;
	while (end < text.length && text.charCodeAt(end) !== 13 && text.charCodeAt(end) !== 10) end++;
	const eol = text.charCodeAt(end) === 13 && text.charCodeAt(end + 1) === 10 ? 2 : end < text.length ? 1 : 0;
	return {start, end, next: end + eol, text: text.slice(start, end)};
}

function willOpeningFrame(text) {
	const bom = text.charCodeAt(0) === 0xfeff ? 1 : 0;
	const opening = willLineAt(text, bom);
	if (!/^--- *$/.test(opening.text) || opening.next === opening.end) return null;
	for (let at = opening.next; at < text.length;) {
		const line = willLineAt(text, at);
		if (/^(?:---|\.\.\.) *$/.test(line.text)) return {contentStart: opening.next, contentEnd: line.start, bodyStart: line.next};
		if (line.next <= at) break;
		at = line.next;
	}
	return null;
}

function willColumns(line) {
	let col = 0;
	for (let i = 0; i < line.length; i++) {
		const code = line.charCodeAt(i);
		if (code === 32) col++;
		else if (code === 9) col += 4 - (col % 4);
		else return {col, index: i};
	}
	return {col, index: line.length};
}

function willQuoteInner(line) {
	let i = 0, depth = 0;
	while (i < line.length) {
		let col = 0, j = i;
		while (j < line.length && col < 3) {
			const code = line.charCodeAt(j);
			if (code === 32) { col++; j++; }
			else if (code === 9) {
				const adv = 4 - (col % 4);
				if (col + adv > 3) break;
				col += adv; j++;
			} else break;
		}
		if (line.charCodeAt(j) !== 62) break;
		depth++;
		j++;
		if (line.charCodeAt(j) === 32 || line.charCodeAt(j) === 9) j++;
		i = j;
	}
	return depth ? line.slice(i) : null;
}

function willListItem(line) {
	const {col, index} = willColumns(line);
	if (col >= 4) return null;
	const rest = line.slice(index);
	const marked = /^([-*+]|\d{1,9}[.)])([ \t]*)/.exec(rest);
	if (!marked || (marked[2].length === 0 && index + marked[1].length < line.length)) return null;
	let content = col + marked[1].length, padding = 0;
	for (const ch of marked[2]) {
		if (padding >= 4) break;
		if (ch === ' ') { content++; padding++; }
		else { const adv = 4 - (content % 4); content += adv; padding += adv; }
	}
	if (marked[2].length === 0) content++;
	return {content};
}

function willFenceOpen(line) {
	const {col, index} = willColumns(line);
	if (col >= 4) return null;
	const match = /^(`{3,}|~{3,})(.*)$/.exec(line.slice(index));
	if (!match || (match[1].charCodeAt(0) === 96 && match[2].includes('`'))) return null;
	return {ch: match[1][0], len: match[1].length};
}

function willFenceCloses(line, fence) {
	const raw = fence.inQuote ? willQuoteInner(line) : line;
	if (raw == null) return false;
	const {col, index} = willColumns(raw);
	if (col >= 4) return false;
	const rest = raw.slice(index);
	let i = 0;
	while (i < rest.length && rest[i] === fence.ch) i++;
	if (i < fence.len) return false;
	for (let k = i; k < rest.length; k++) if (rest.charCodeAt(k) !== 32 && rest.charCodeAt(k) !== 9) return false;
	return true;
}

function willUpdateTags(item, line) {
	const re = /<!--[\s\S]*?-->|<\/?([A-Za-z][A-Za-z0-9]*)\b[^>]*?>/g;
	let match;
	while ((match = re.exec(line))) {
		if (match[0].charCodeAt(1) === 33) continue;
		const name = match[1].toLowerCase();
		const close = match[0].charCodeAt(1) === 47;
		if (WILL_VOID_TAGS.has(name) || /\/\s*>$/.test(match[0])) continue;
		if (close) {
			const at = item.tags.lastIndexOf(name);
			if (at >= 0) item.tags.splice(at, 1);
		} else item.tags.push(name);
	}
}

function willHtmlOpen(line) {
	const {col, index} = willColumns(line);
	if (col >= 4) return null;
	const rest = line.slice(index);
	const leaf = /^<(pre|script|style|textarea)(?:[ \t]|\/?>|$)/i.exec(rest);
	if (leaf) return {kind: leaf[1].toLowerCase() === 'pre' ? 'pre' : 'raw', tag: leaf[1].toLowerCase()};
	const block = /^<\/?([A-Za-z][A-Za-z0-9]*)(?:[ \t]|\/?>|$)/.exec(rest);
	if (!block || !WILL_BLOCK_TAGS.has(block[1].toLowerCase())) return null;
	const item = {kind: 'html', tags: []};
	willUpdateTags(item, rest);
	return item;
}

function willRawCloses(item, line) {
	const close = new RegExp('</' + item.tag + '(?:[\\t\\n\\f />]|$)', 'i');
	return close.test(line);
}

function willQuotedWhere(stack) {
	for (let i = stack.length - 1; i >= 0; i--) {
		const item = stack[i];
		if (item.kind === 'fence') return 'fence';
		if (item.kind === 'pre') return 'raw-pre';
		if (item.kind === 'html') {
			if (item.tags.includes('pre')) return 'raw-pre';
			if (item.tags.includes('td') || item.tags.includes('th')) return 'raw-table';
			if (item.tags.includes('div')) return 'raw-div';
			return 'raw-html';
		}
	}
	return null;
}

function willLeaf(stack) {
	const kind = stack[stack.length - 1]?.kind;
	return kind === 'fence' || kind === 'pre' || kind === 'html' || kind === 'raw';
}

export function quotedWillSpan(source, spans) {
	const text = String(source ?? '');
	const marks = Array.isArray(spans) ? spans : [];
	if (!marks.length) return null;
	const places = new Map();
	const frame = willOpeningFrame(text);
	if (frame) {
		for (const span of marks) {
			const start = span[0];
			if (start >= frame.contentStart && start < frame.contentEnd) places.set(start, 'frontmatter');
		}
	}
	const stack = [];
	for (let pos = frame ? frame.bodyStart : text.charCodeAt(0) === 0xfeff ? 1 : 0; pos < text.length;) {
		const line = willLineAt(text, pos);
		const blank = /^[ \t]*$/.test(line.text);
		let closedHere = false;
		while (stack.length) {
			const top = stack[stack.length - 1];
			if (top.kind === 'html' && blank) { stack.pop(); continue; }
			if (top.kind === 'fence' && willFenceCloses(line.text, top)) { stack.pop(); closedHere = true; continue; }
			break;
		}
		let cut = -1;
		for (let i = 0; i < stack.length; i++) {
			const item = stack[i];
			if (item.kind === 'list' && !blank && willColumns(line.text).col < item.content && !willListItem(line.text)) { cut = i; break; }
			if (item.kind === 'quote' && !blank && willQuoteInner(line.text) == null) { cut = i; break; }
		}
		if (cut >= 0) stack.length = cut;
		if (!places.has(line.start)) {
			const where = willQuotedWhere(stack);
			if (where) places.set(line.start, where);
		}
		const top = stack[stack.length - 1];
		if (top?.kind === 'pre' && willRawCloses({tag: 'pre'}, line.text)) stack.pop();
		else if (top?.kind === 'raw' && willRawCloses(top, line.text)) stack.pop();
		else if (top?.kind === 'html' && !blank) willUpdateTags(top, line.text);
		else if (!closedHere && !willLeaf(stack) && !blank) {
			const inner = willQuoteInner(line.text);
			const body = inner == null ? line.text : inner;
			const inQuote = inner != null;
			if (inQuote && stack[stack.length - 1]?.kind !== 'quote') stack.push({kind: 'quote'});
			const fence = willFenceOpen(body);
			if (fence) stack.push({kind: 'fence', ...fence, inQuote});
			else {
				const html = willHtmlOpen(body);
				if (html) stack.push({...html, inQuote});
				else if (!inQuote) {
					const item = willListItem(line.text);
					if (item && stack[stack.length - 1]?.kind !== 'list') stack.push({kind: 'list', content: item.content});
					else if (item && stack[stack.length - 1]?.kind === 'list' && item.content > stack[stack.length - 1].content) stack.push({kind: 'list', content: item.content});
				}
			}
		}
		if (line.next <= pos) break;
		pos = line.next;
	}
	for (const span of marks) {
		const where = places.get(span[0]);
		if (where) return {start: span[0], end: span[1], where};
	}
	return null;
}

function pairSpanMarkers(source, kind, markers = null) {
	if (kind !== 'ink') throw new TypeError('Unknown paired marker kind');
	const runs = [], strays = [], stack = [];
	for (const marker of markers || scanInkMarkers(source)) {
		if (!marker.close) { stack.push(marker); continue; }
		const open = stack.pop();
		if (!open) { strays.push(marker); continue; }
		runs.push({ start: open.start, end: marker.end, innerStart: open.end, innerEnd: marker.start, mark: open.mark });
	}
	strays.push(...stack);
	runs.sort((a, b) => a.start - b.start);
	strays.sort((a, b) => a.start - b.start);
	return { runs, strays };
}

export function sliceInkArrows(source, start = 0, end = String(source ?? '').length, markers = null) {
	const text = String(source ?? '');
	if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > text.length) throw new RangeError('ink: invalid source slice');
	const kept = new Set();
	for (const arrow of pairInkMarkers(text, markers).arrows) {
		if (![arrow.tail, arrow.head].every(run => run.innerStart >= start && run.innerEnd <= end && run.innerStart < run.innerEnd)) continue;
		kept.add(arrow.id);
		start = Math.min(start, arrow.tail.start, arrow.head.start);
		end = Math.max(end, arrow.tail.end, arrow.head.end);
	}
	const spans = pairInkSpans(text, markers), cuts = [];
	for (const run of spans.runs) if (run.mark.id != null && !kept.has(run.mark.id)) cuts.push(
		{ start: run.start, end: run.innerStart }, { start: run.innerEnd, end: run.end });
	for (const marker of spans.strays) if (marker.mark?.id != null) cuts.push(marker);
	let result = '', at = start;
	for (const cut of cuts.sort((a, b) => a.start - b.start)) {
		if (cut.end <= at || cut.start >= end) continue;
		result += text.slice(at, Math.max(at, cut.start));
		at = Math.min(end, cut.end);
	}
	return result + text.slice(at, end);
}

export function prepareInkPaste(source, existing = '', markers = null) {
	const text = String(source ?? ''), paired = pairInkMarkers(text, markers), edits = [];
	for (const marker of paired.strays) if (marker.mark?.id != null || marker.arrowId != null) edits.push({ start: marker.start, end: marker.end, text: '' });
	const occupied = new Set(scanInkMarkers(existing).filter(marker => marker.mark?.id != null).map(marker => marker.mark.id));
	const reserved = new Set([...occupied, ...paired.arrows.map(arrow => arrow.id)]);
	let next = 1;
	for (const arrow of paired.arrows) {
		const runs = [arrow.tail, arrow.head];
		if (runs.some(run => run.innerStart === run.innerEnd)) {
			for (const run of runs) edits.push({ start: run.start, end: run.innerStart, text: '' }, { start: run.innerEnd, end: run.end, text: '' });
			continue;
		}
		if (!occupied.has(arrow.id)) continue;
		while (reserved.has(next) && next <= INK_INT_MAX) next++;
		if (next > INK_INT_MAX) throw new RangeError('ink: no unused arrow pairing number');
		reserved.add(next);
		for (const run of runs) {
			const prefix = '<!--ink ' + run.mark.kind + ' ';
			edits.push({ start: run.start + prefix.length, end: run.start + prefix.length + String(arrow.id).length, text: String(next) });
		}
	}
	let result = text;
	for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
	return result;
}

export function stripInkMarkers(text) {
	const source = String(text == null ? '' : text);
	let result = '', at = 0;
	for (const marker of scanInkMarkers(source)) { result += source.slice(at, marker.start); at = marker.end; }
	return result + source.slice(at);
}

export function hasInkMarker(text) {
	return scanInkMarkers(text).length > 0;
}

export function formatPageBreak() {
	return PAGE_BREAK_MARKER;
}

export function isPageBreakLine(text) {
	return typeof text === 'string' && /^<!--md-break:v1 page-->\r?$/.test(text);
}

export function isPageBreakBlock(text) {
	return typeof text === 'string' && /^<!--md-break:v1 page-->\r?\n?$/.test(text);
}
