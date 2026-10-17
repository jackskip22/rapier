// SPDX-License-Identifier: MIT
import {frontMatterFrame, frontMatterLine} from './frontmatter.mjs';
import {normalizeFontFamily, fontFamilyCss, FONT_STACKS} from './md-marks.mjs';

const NUMBER = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
export const DOCUMENT_LEADING = 1.75 / 1.1;

export const SPACING_TYPES = Object.freeze(['paragraph', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
	'list', 'item', 'table', 'picture', 'drawing', 'quote', 'code', 'rule', 'footnote', 'toc']);
export const SPACING_PRESETS = Object.freeze({compact: .7, standard: 1, roomy: 1.5});
const SPACING_SELECTORS = Object.freeze({paragraph: 'p', h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h5', h6: 'h6',
	list: ':is(ul,ol)', item: 'li', table: ':is(table,.table-scroll-wrap)', picture: 'p[data-md-picture]',
	drawing: ':is(.diagram-block,p[data-md-picture]:has(img[data-md-svg],img[src^="data:image/svg+xml"]))', quote: 'blockquote',
	code: 'pre', rule: 'hr:not(.footnotes-sep):not([data-md-break])', footnote: '.footnotes', toc: '.rapier-jump-list'});
const HEADING_LINE = [1.75 / 2.2, 1.5 / 1.75, 1.2 / 1.5, 1 / 1.25, .9 / 1.1, .82];

export function normalizeDocumentSpacing(value) {
	if (typeof value === 'string') {
		if (Object.hasOwn(SPACING_PRESETS, value)) value = {preset: value};
		else { try { value = JSON.parse(value); } catch (_) { return null; } }
	}
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const result = {};
	for (const [key, entry] of Object.entries(value)) {
		if (key === 'preset') {
			if (!Object.hasOwn(SPACING_PRESETS, entry)) return null;
			result.preset = entry; continue;
		}
		if (!SPACING_TYPES.includes(key) || !entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
		const row = {};
		for (const [field, number] of Object.entries(entry)) {
			if (!['before', 'after', 'line'].includes(field) || typeof number !== 'number' || !Number.isFinite(number) ||
				number < (field === 'line' ? .5 : 0) || number > (field === 'line' ? 4 : 720)) return null;
			row[field] = number;
		}
		result[key] = Object.freeze(row);
	}
	return Object.freeze(result);
}

export function documentSpacing(settings, kind = 'paragraph') {
	const type = SPACING_TYPES.includes(kind) ? kind : 'paragraph', spacing = settings?.spacing;
	const preset = spacing?.preset || 'standard', scale = SPACING_PRESETS[preset];
	const size = (settings?.fontsize?.unit || 1.1) / 1.1;
	const heading = /^h([1-6])$/.exec(type), leading = settings?.linestretch?.factor ??
		(preset === 'compact' ? 1.3 : preset === 'roomy' ? 1.85 : DOCUMENT_LEADING);
	const before = heading ? 15 : type === 'footnote' ? 9 : 0;
	const after = heading ? 3 : type === 'paragraph' ? 6 : type === 'item' ? 3 : type === 'footnote' ? 0 : 9;
	const line = heading ? leading * HEADING_LINE[Number(heading[1]) - 1] : type === 'code' ? leading * .75 / .7386 : leading;
	if (settings?.word) return {before: (heading ? 12 : type === 'footnote' ? 9 : 0) * scale,
		after: (heading ? 6 : type === 'paragraph' ? 8 : type === 'item' || type === 'footnote' ? 0 : 9) * scale,
		line: leading, ...spacing?.[type]};
	return {before: before * scale * size, after: after * scale * size, line, ...spacing?.[type]};
}

export function wordDocumentSettings(settings) {
	return {...settings, word: true, fontsize: settings?.fontsize || fontSize('11pt'),
		mainfont: settings?.mainfont || documentFont('Calibri'), sansfont: settings?.sansfont || documentFont('Calibri'),
		linestretch: settings?.linestretch || leading('1.08')};
}
export function documentHeadingSize(settings, level) {
	const body = (settings?.fontsize?.unit || 1.1) * 12;
	return body * (settings?.word ? [16/11,13/11,12/11,1,1,1] : [2.2,1.75,1.5,1.25,1.1,1])[level - 1];
}

export function documentSpacingCss(settings, scope = '.md-render', defaults = false) {
	if (!defaults && !settings?.spacing && !settings?.linestretch && !settings?.fontsize) return '';
	const length = points => 'calc(' + Number((points / 12).toFixed(8)) + ' * var(--md-unit))';
	let css = '';
	for (const type of SPACING_TYPES) {
		const row = documentSpacing(settings, type), selector = scope + ' ' + SPACING_SELECTORS[type];
		css += selector + '{margin-block:' + length(row.before) + ' ' + length(row.after) + ';line-height:' + row.line + '}';
		if (settings?.word && /^h[1-6]$/.test(type)) css += selector + '{font-size:' + length(documentHeadingSize(settings, Number(type[1]))) + '}';
	}
	css += scope + ' :is(li,td,th,blockquote)>:last-child{margin-bottom:0}' +
		scope + ' li:last-child{margin-bottom:0}' + scope + ' li>:is(ul,ol){margin-bottom:0}' +
		scope + ' .table-scroll-wrap>table{margin-block:0}' +
		scope + ' pre{font-size:calc(var(--md-text-body) * .7386)}' +
		scope + ' pre code{line-height:inherit}' + scope + ' .footnotes{padding-top:0}' +
		scope + ' .footnotes-list{margin-block:0}' + scope + ' blockquote:not(.callout){padding-block:0}';
	const item = documentSpacing(settings, 'item');
	css += scope + ' ul.rapier-jump-list>li{padding-block:0;margin-block:' + length(item.before) + ' ' + length(item.after) + '}' +
		scope + ' ul.rapier-jump-list>li:last-child{margin-bottom:0}';
	for (const [type, selector] of [['item','li>p'], ['table',':is(td,th)>p'], ['quote','blockquote>p'], ['footnote','.footnotes p'], ['toc','.rapier-jump-list li']])
		css += scope + ' ' + selector + '{line-height:' + documentSpacing(settings, type).line + '}';
	return css;
}

function measure(value, positive = false) {
	const text = unquote(value);
	const number = NUMBER.test(text) ? Number(text) : NaN;
	return Number.isFinite(number) && number >= 0 && (!positive || number > 0) ? number : null;
}

function fontSize(value) {
	const match = /^(\d+(?:\.\d*)?|\.\d+)\s*(pt|px)$/i.exec(unquote(value));
	if (!match) return null;
	const number = measure(match[1], true), unit = match[2].toLowerCase();
	if (number === null) return null;
	const points = unit === 'pt' ? number : number * .75;
	return Object.freeze({step: number + unit, unit: points / 12,
		css: 'calc(' + number + ' / ' + (unit === 'pt' ? 12 : 16) + ' * var(--md-unit))', halfPoints: points * 2});
}

function leading(value) {
	const factor = measure(value, true);
	return factor === null ? null : Object.freeze({step: String(factor), factor,
		css: 'calc(var(--md-text-body) * ' + factor + ')', line: Math.round(factor * 240)});
}

const PAPERS = Object.freeze({
	letter: Object.freeze({name: 'letter', width: 12240, height: 15840, css: 'letter'}),
	a4: Object.freeze({name: 'a4', width: 11906, height: 16838, css: 'A4'}),
	a5: Object.freeze({name: 'a5', width: 8391, height: 11906, css: 'A5'}),
	legal: Object.freeze({name: 'legal', width: 12240, height: 20160, css: 'legal'}),
});
const EMPTY = Object.freeze({
	title: null, subtitle: null, lang: null, fontsize: null, mainfont: null, sansfont: null, monofont: null, defaultfont: null, linestretch: null,
	papersize: null, geometry: null, pagestyle: null, spacing: null,
});

function unquote(value) {
	const text = String(value == null ? '' : value).trim();
	return text[0] === '"' || text[0] === "'" ? quotedValue(text) ?? text : text;
}

function marginOf(value) {
	const match = /^margin\s*=\s*(\d+(?:\.\d+)?)(cm|mm|in|pt)$/i.exec(unquote(value));
	if (!match) return null;
	const number = Number(match[1]);
	if (!Number.isFinite(number) || number < 0) return null;
	const unit = match[2].toLowerCase();
	const twips = Math.round(unit === 'in' ? number * 1440 : unit === 'pt' ? number * 20 : unit === 'cm' ? number * 1440 / 2.54 : number * 1440 / 25.4);
	if (!Number.isSafeInteger(twips) || twips < 0 || twips > 1440 * 6) return null;
	return Object.freeze({margin: match[1] + unit, twips});
}

function quotedEnd(text, start = 0, limit = text.length) {
	const quote = text[start];
	for (let at = start + 1; at < limit; at++) {
		if (text[at] === '\\' && quote === '"') at++;
		else if (text[at] === quote) {
			if (quote === "'" && text[at + 1] === "'") at++;
			else return at + 1;
		}
	}
	return null;
}

function quotedValue(text) {
	if (quotedEnd(text) !== text.length) return null;
	if (text[0] === "'") return text.slice(1, -1).replace(/''/g, "'");
	const escapes = {'0': '\0', a: '\x07', b: '\b', t: '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1b', ' ': ' ', '"': '"', '/': '/', '\\': '\\', N: '\x85', _: '\xa0', L: '\u2028', P: '\u2029'};
	let value = '';
	for (let at = 1; at < text.length - 1; at++) {
		if (text[at] !== '\\') { value += text[at]; continue; }
		const code = text[++at], width = code === 'x' ? 2 : code === 'u' ? 4 : code === 'U' ? 8 : 0;
		if (width) {
			const digits = text.slice(at + 1, at + width + 1), point = Number.parseInt(digits, 16);
			if (digits.length !== width || !/^[\da-f]+$/i.test(digits) || point > 0x10ffff || point >= 0xd800 && point <= 0xdfff) return null;
			value += String.fromCodePoint(point); at += width;
		} else if (Object.hasOwn(escapes, code)) value += escapes[code];
		else return null;
	}
	return value;
}

function keyOf(text) {
	return (text[0] === '"' || text[0] === "'" ? quotedValue(text) : text)?.toLowerCase() ?? null;
}

function flowEnd(text, start, limit = text.length) {
	const stack = [text[start] === '{' ? '}' : ']'];
	for (let at = start + 1; at < limit; at++) {
		const char = text[at];
		if ((char === '"' || char === "'") && /[\s:[{,]/.test(text[at - 1])) {
			const end = quotedEnd(text, at, limit);
			if (end === null) return null;
			at = end - 1;
		} else if (char === '#' && /\s/.test(text[at - 1])) {
			while (at < limit && text[at] !== '\r' && text[at] !== '\n') at++;
		} else if (char === '[' || char === '{') stack.push(char === '{' ? '}' : ']');
		else if (char === ']' || char === '}') {
			if (stack.pop() !== char) return null;
			if (!stack.length) return at + 1;
		}
	}
	return null;
}

function fieldLine(line, indented = false) {
	const indent = /^ */.exec(line.text)[0].length;
	if (indented ? !indent : !!indent) return null;
	let end = indent, key;
	if (line.text[end] === '"' || line.text[end] === "'") {
		end = quotedEnd(line.text, end);
		if (end === null) return null;
		key = keyOf(line.text.slice(indent, end));
		while (/[ \t]/.test(line.text[end] || 'x')) end++;
		if (line.text[end] !== ':') return null;
	} else {
		end = line.text.indexOf(':', indent);
		if (end < 0 || end + 1 < line.text.length && !/[\s\[\]{},]/.test(line.text[end + 1])) return null;
		const raw = line.text.slice(indent, end).trimEnd();
		if (!raw || /^[?\[\]{},&*!|>]/.test(raw) || /\s#/.test(raw)) return null;
		key = keyOf(raw);
	}
	let start = line.start + end + 1;
	while (start < line.end && /[ \t]/.test(line.text[start - line.start])) start++;
	return {key, start, end: start, line, indent, children: [], opaque: key === null, invalid: false};
}

function valueSpan(source, field, limit) {
	let at = field.start;
	const first = source[at];
	if (first === '&' || first === '*' || first === '!') {
		field.opaque = true;
		while (at < field.line.end && /[&*!]/.test(source[at])) {
			while (at < field.line.end && !/\s/.test(source[at])) at++;
			while (at < field.line.end && /[ \t]/.test(source[at])) at++;
		}
	}
	const quoted = source[at] === '"' || source[at] === "'", flow = source[at] === '[' || source[at] === '{';
	let end;
	if (quoted || flow) {
		end = quoted ? quotedEnd(source, at, limit) : flowEnd(source, at, limit);
		if (end === null) { field.invalid = true; field.end = field.line.end; return field; }
		const tailLine = frontMatterLine(source, end);
		if (!/^[ \t]*(?:#.*)?$/.test(source.slice(end, Math.min(limit, tailLine.end)))) field.invalid = true;
		field.multiline = end > field.line.end;
	} else {
		end = field.line.end;
		for (let i = at; i < end; i++) if (source[i] === '#' && (i === at || /\s/.test(source[i - 1]))) { end = i; break; }
		while (end > at && /[ \t]/.test(source[end - 1])) end--;
	}
	field.end = end;
	field.block = /^[|>][+\-1-9]*$/.test(source.slice(at, field.end));
	return field;
}

function mapFields(source, lines, indent) {
	const fields = [];
	let invalid = false, current = null;
	const limit = lines.at(-1)?.end ?? 0;
	for (const line of lines) {
		if (current?.multiline && line.start < current.end) continue;
		if (!line.text.trim() || /^\s*#/.test(line.text)) continue;
		const ownIndent = /^ */.exec(line.text)[0].length;
		if (ownIndent > indent && current) { current.children.push(line); continue; }
		if (ownIndent !== indent) { invalid = true; continue; }
		const field = fieldLine(line, indent > 0);
		if (!field) { invalid = true; continue; }
		current = valueSpan(source, field, limit);
		if (field.invalid || field.key === null) invalid = true;
		fields.push(field);
	}
	return {fields, invalid};
}

function structureIsClosed(source, lines) {
	let blockIndent = null, through = 0;
	const limit = lines.at(-1)?.end ?? 0;
	for (const line of lines) {
		if (line.start < through || !line.text.trim() || /^\s*#/.test(line.text)) continue;
		const indent = /^ */.exec(line.text)[0].length;
		if (blockIndent !== null && indent > blockIndent) continue;
		blockIndent = null;
		let offset = indent;
		while (/^-\s/.test(line.text.slice(offset))) offset += /^-[ \t]*/.exec(line.text.slice(offset))[0].length;
		const content = {...line, start: line.start + offset, text: line.text.slice(offset)};
		const field = fieldLine(content) || {start: content.start, line: content, children: []};
		const span = valueSpan(source, field, limit);
		if (span.invalid || field.key === null) return false;
		if (span.block) blockIndent = indent;
		if (span.multiline) through = span.end;
	}
	return true;
}

function fieldsOf(source) {
	const frame = frontMatterFrame(source), lines = [];
	if (frame.closing) for (let at = frame.opening.next; at < frame.closing.start;) {
		const line = frontMatterLine(source, at); lines.push(line); at = line.next;
	}
	const parsed = mapFields(source, lines, 0);
	return {frame, fields: parsed.fields, invalid: parsed.invalid || !structureIsClosed(source, lines)};
}

export function documentFont(value) {
	const family = normalizeFontFamily(value);
	if (!family) return null;
	const named = Object.hasOwn(FONT_STACKS, family.toLowerCase()) ? FONT_STACKS[family.toLowerCase()] : null;
	return Object.freeze(named ? {...named, family} : {family, stack: 'named', css: fontFamilyCss(family), word: family});
}

export function writeDocumentFontSetting(markdown, key, value) {
	if (!['mainfont', 'sansfont', 'monofont', 'defaultfont'].includes(key)) throw new TypeError('font: unknown document key');
	const family = value == null ? null : normalizeFontFamily(value);
	if (value != null && !family) throw new TypeError('font: use one family name');
	return updateDocumentSettings(markdown, {[key]: family});
}

export function languageTag(value) {
	if (typeof value !== 'string' || value.length > 128 || !/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/i.test(value)) return null;
	try { return Intl.getCanonicalLocales(value)[0] || null; }
	catch (_) { return null; }
}

export function documentLanguage(settings, device = globalThis.navigator?.language) {
	return languageTag(settings?.lang) || languageTag(device) || 'en';
}

export function readDocumentSettings(markdown) {
	const source = String(markdown ?? ''), {frame, fields} = fieldsOf(source);
	if (!frame.closing) return EMPTY;
	const field = name => { const matches = fields.filter(item => item.key === name); return matches.length === 1 ? matches[0] : null; };
	const take = name => { const item = field(name); return item && !item.children.length && !item.opaque && !item.invalid && !item.multiline && !item.block ? unquote(source.slice(item.start, item.end)) : null; };
	const fontsize = fontSize(take('fontsize'));
	const mainfont = documentFont(take('mainfont'));
	const sansfont = documentFont(take('sansfont'));
	const monofont = documentFont(take('monofont'));
	const defaultfont = documentFont(take('defaultfont'));
	const linestretch = leading(take('linestretch'));
	const papersize = PAPERS[String(take('papersize') || '').toLowerCase()] || null;
	const geometry = take('geometry') != null ? marginOf(take('geometry')) : null;
	const page = String(take('pagestyle') || '').toLowerCase();
	return Object.freeze({
		title: take('title') || null, subtitle: take('subtitle') || null, lang: languageTag(take('lang')),
		fontsize, mainfont, sansfont, monofont, defaultfont, linestretch, papersize, geometry,
		spacing: normalizeDocumentSpacing(take('spacing')),
		pagestyle: page === 'plain' || page === 'empty' ? page : null,
	});
}

export function updateDocumentSettings(markdown, patch) {
	const source = String(markdown ?? ''), parsed = fieldsOf(source), {frame, fields} = parsed, before = readDocumentSettings(source);
	const changes = [], append = [];
	const eol = frame.closing ? frame.opening.eol : (source.match(/\r\n|\r|\n/) || ['\n'])[0];
	const same = (left, right) => Math.abs(left - right) <= Number.EPSILON * Math.max(Math.abs(left), Math.abs(right)) * 4;
	const refuse = key => { throw new RangeError('Edit this setting in source: ' + key); };
	const removeLine = (line, end) => {
		const suffix = source.slice(end, line.end);
		changes.push({start: line.start, end: line.next, text: suffix.trimStart().startsWith('#') ? suffix + line.eol : ''});
	};
	const replaceValue = (field, text) => changes.push({start: field.start, end: field.end,
		text: (source[field.start - 1] === ':' ? ' ' : '') + text + (source[field.end] === '#' ? ' ' : '')});
	for (const [key, supplied] of Object.entries(patch || {})) {
		const font = ['mainfont', 'sansfont', 'monofont', 'defaultfont'].includes(key);
		if (!font && !['fontsize', 'linestretch', 'spacing'].includes(key)) throw new TypeError('Unknown document setting: ' + key);
		const matches = fields.filter(item => item.key === key);
		if (matches.length > 1) throw new RangeError('Duplicate document setting: ' + key);
		const field = matches[0];
		const value = supplied === null ? null : font ? documentFont(supplied) : key === 'fontsize' ? fontSize(supplied) : key === 'spacing' ? normalizeDocumentSpacing(supplied) : leading(supplied);
		if (supplied !== null && !value) throw new TypeError('Invalid document setting: ' + key);
		const encoded = value === null ? '' : font ? JSON.stringify(value.family) : key === 'fontsize' ? value.step : key === 'spacing' ? JSON.stringify(value) : String(value.factor);
		if (value !== null && before[key] && (font ? before[key].family === value.family : key === 'fontsize' ? same(before.fontsize.unit, value.unit) : key === 'spacing' ? JSON.stringify(before.spacing) === encoded : before.linestretch.factor === value.factor)) continue;
		if (key === 'fontsize' && value !== null && fontSize(encoded)?.unit !== value.unit) refuse(key);
		if (!field) { if (value !== null) append.push(key + ': ' + encoded + eol); continue; }
		if (field.opaque || field.invalid || field.multiline || field.block) refuse(key);
		if (field.children.length) refuse(key);
		if (value === null) removeLine(field.line, field.end);
		else replaceValue(field, encoded);
	}
	if (!changes.length && !append.length) return source;
	if (parsed.invalid) throw new RangeError('Edit this front matter in source before changing settings');
	if (!frame.closing) {
		if (/^--- *$/.test(frame.opening.text) && frame.opening.eol) throw new RangeError('Close the front matter before changing settings');
		return frame.bom + '---' + eol + append.join('') + '---' + eol + source.slice(frame.bom.length);
	}
	if (append.length) changes.push({start: frame.closing.start, end: frame.closing.start, text: append.join('')});
	let next = source;
	for (const change of changes.sort((a, b) => b.start - a.start || b.end - a.end)) next = next.slice(0, change.start) + change.text + next.slice(change.end);
	return next;
}

export function documentTitle(settings) {
	if (!settings || !settings.title) return '';
	return settings.subtitle ? settings.title + ' \u2014 ' + settings.subtitle : settings.title;
}

export function documentSettingsFonts(settings, defaultFont) {
	const inherited = defaultFont === undefined ? settings?.defaultfont : documentFont(defaultFont);
	const main = settings?.mainfont || inherited;
	return {main, sans: settings?.sansfont || main, mono: settings?.monofont};
}

export function documentSettingsStyle(settings, defaultFont) {
	if (!settings) return '';
	const decls = [];
	if (settings.fontsize) decls.push('--md-text-body:' + settings.fontsize.css);
	if (settings.linestretch || settings.fontsize) decls.push('--md-line:calc(var(--md-text-body) * ' + (settings.linestretch?.factor ?? DOCUMENT_LEADING) + ')');
	const {main, sans, mono} = documentSettingsFonts(settings, defaultFont);
	if (sans) decls.push('--md-font-sans:' + (sans.css || fontFamilyCss(sans.family)));
	if (main) decls.push('font-family:' + (main.css || fontFamilyCss(main.family)));
	if (mono) decls.push('--md-font-mono:' + (mono.css || fontFamilyCss(mono.family)));
	return (decls.length ? '.md-render{' + decls.join(';') + '}' : '') + documentSpacingCss(settings);
}

export function documentSettingsPageRule(settings) {
	if (!settings || (!settings.papersize && !settings.geometry && settings.pagestyle !== 'plain')) return null;
	const size = settings.papersize ? settings.papersize.css : 'auto';
	const margin = settings.geometry ? settings.geometry.margin : '12mm 14mm 14mm';
	const numbers = settings.pagestyle === 'plain' ? '@bottom-center{content:counter(page)}' : '';
	return '@page{size:' + size + ';margin:' + margin + (numbers ? ';' + numbers : '') + '}';
}
