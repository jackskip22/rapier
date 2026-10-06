// One reader of the document-wide keys Pandoc and Quarto already name.
// Framing stays in spec/frontmatter.mjs. This module never rewrites source.
// The live view reads fontsize, mainfont and linestretch. It ignores papersize,
// geometry and pagestyle: a scroll has no page. Word and the PDF read all of them.
import {frontMatterFrame, frontMatterLine} from './frontmatter.mjs';

// A point is a twelfth of the reference scale's unit (docs/markdown-standard.md, "The reference scale"): 12pt is one
// unit, 16 px at M, and a step multiplies it. `unit` is that multiple; `css` the body size in it.
const FONT_STEPS = Object.freeze({
	'10pt': Object.freeze({step: '10pt', unit: 10 / 12, css: 'calc(10 / 12 * var(--md-unit))', halfPoints: 20}),
	'11pt': Object.freeze({step: '11pt', unit: 11 / 12, css: 'calc(11 / 12 * var(--md-unit))', halfPoints: 22}),
	'12pt': Object.freeze({step: '12pt', unit: 1, css: 'calc(12 / 12 * var(--md-unit))', halfPoints: 24}),
});
// Four stacks. `sans` is the page's own face, metric-matched when the written page
// cannot carry the type. The other three are named faces, not an arbitrary family.
const FONT_STACKS = Object.freeze({
	sans: Object.freeze({stack: 'sans', css: '', word: ''}),
	serif: Object.freeze({stack: 'serif', css: "Georgia,'Palatino Linotype',Palatino,'Times New Roman',Times,serif", word: 'Georgia'}),
	mono: Object.freeze({stack: 'mono', css: "ui-monospace,'Courier New',Courier,monospace", word: 'Courier New'}),
	system: Object.freeze({stack: 'system', css: 'system-ui,sans-serif', word: 'Calibri'}),
});
const LEADING = Object.freeze({
	// A length, not a bare number: --md-line is also a margin. Single, one and a half and
	// double are the body's size times Word's three steps.
	single: Object.freeze({step: 'single', factor: 1, css: 'calc(var(--md-text-body) * 1)', line: 240}),
	'one and a half': Object.freeze({step: 'one and a half', factor: 1.5, css: 'calc(var(--md-text-body) * 1.5)', line: 360}),
	double: Object.freeze({step: 'double', factor: 2, css: 'calc(var(--md-text-body) * 2)', line: 480}),
});
const LEADING_ALIASES = Object.freeze({
	'1': 'single', '1.0': 'single',
	'1.5': 'one and a half',
	'2': 'double', '2.0': 'double',
});
const PAPERS = Object.freeze({
	letter: Object.freeze({name: 'letter', width: 12240, height: 15840, css: 'letter'}),
	a4: Object.freeze({name: 'a4', width: 11906, height: 16838, css: 'A4'}),
	a5: Object.freeze({name: 'a5', width: 8391, height: 11906, css: 'A5'}),
	legal: Object.freeze({name: 'legal', width: 12240, height: 20160, css: 'legal'}),
});
const EMPTY = Object.freeze({
	title: null, subtitle: null, fontsize: null, mainfont: null, linestretch: null,
	papersize: null, geometry: null, pagestyle: null,
});

function unquote(value) {
	const text = String(value == null ? '' : value).trim();
	if (text.length >= 2 && text[0] === '"' && text.at(-1) === '"') {
		return text.slice(1, -1).replace(/\\([\\"])/g, '$1');
	}
	if (text.length >= 2 && text[0] === "'" && text.at(-1) === "'") {
		return text.slice(1, -1).replace(/''/g, "'");
	}
	return text;
}

function marginOf(value) {
	const match = /^margin\s*=\s*(\d+(?:\.\d+)?)(cm|mm|in|pt)$/i.exec(unquote(value));
	if (!match) return null;
	const number = Number(match[1]);
	if (!Number.isFinite(number) || number < 0 || number > 6) return null;
	const unit = match[2].toLowerCase();
	const twips = Math.round(unit === 'in' ? number * 1440 : unit === 'pt' ? number * 20 : unit === 'cm' ? number * 1440 / 2.54 : number * 1440 / 25.4);
	if (!Number.isSafeInteger(twips) || twips < 0 || twips > 1440 * 6) return null;
	return Object.freeze({margin: match[1] + unit, twips});
}

function fieldsOf(markdown) {
	const source = String(markdown == null ? '' : markdown);
	const frame = frontMatterFrame(source);
	if (!frame.closing) return null;
	const fields = new Map();
	for (let at = frame.opening.next; at < frame.closing.start;) {
		const line = frontMatterLine(source, at);
		at = line.next;
		if (!line.text.trim() || /^\s*#/.test(line.text)) continue;
		const match = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line.text);
		if (!match) continue;
		const raw = match[2].trim();
		if (raw === '|' || raw === '>' || raw === '|-' || raw === '>-') continue;
		fields.set(match[1].toLowerCase(), unquote(raw));
	}
	return fields;
}

// Unknown keys and values that are not one of the named steps are ignored.
// The source is left as it was typed.
export function readDocumentSettings(markdown) {
	const fields = fieldsOf(markdown);
	if (!fields) return EMPTY;
	const take = name => fields.has(name) ? fields.get(name) : null;
	const fontsize = FONT_STEPS[String(take('fontsize') || '').toLowerCase()] || null;
	const mainfont = FONT_STACKS[String(take('mainfont') || '').toLowerCase()] || null;
	const leadingName = LEADING_ALIASES[String(take('linestretch') || '').toLowerCase()] || String(take('linestretch') || '').toLowerCase();
	const linestretch = LEADING[leadingName] || null;
	const papersize = PAPERS[String(take('papersize') || '').toLowerCase()] || null;
	const geometry = take('geometry') != null ? marginOf(take('geometry')) : null;
	const page = String(take('pagestyle') || '').toLowerCase();
	const pagestyle = page === 'plain' || page === 'empty' ? page : null;
	const title = take('title');
	const subtitle = take('subtitle');
	return Object.freeze({
		title: title ? title : null,
		subtitle: subtitle ? subtitle : null,
		fontsize, mainfont, linestretch, papersize, geometry, pagestyle,
	});
}

// The page's <title>, the PDF's document title. Subtitle follows the title.
// An absent title returns '' so the caller keeps the filename.
export function documentTitle(settings) {
	if (!settings || !settings.title) return '';
	return settings.subtitle ? settings.title + ' \u2014 ' + settings.subtitle : settings.title;
}

// Variables the style pack already uses, so a named size, face and spacing
// change the body and the headings together. `sans` leaves the metric-matched
// face in place. Empty when the view's three keys are absent.
export function documentSettingsStyle(settings) {
	if (!settings) return '';
	const decls = [];
	if (settings.fontsize) decls.push('--md-text-body:' + settings.fontsize.css);
	if (settings.linestretch) decls.push('--md-line:' + settings.linestretch.css);
	if (settings.mainfont && settings.mainfont.css) decls.push('--md-font-sans:' + settings.mainfont.css);
	return decls.length ? '.md-render{' + decls.join(';') + '}' : '';
}

// Null when the page keys do not change the print sheet. The view never asks.
// The default rule stays the writer's own: size:auto; margin:12mm 14mm 14mm.
export function documentSettingsPageRule(settings) {
	if (!settings || (!settings.papersize && !settings.geometry && settings.pagestyle !== 'plain')) return null;
	const size = settings.papersize ? settings.papersize.css : 'auto';
	const margin = settings.geometry ? settings.geometry.margin : '12mm 14mm 14mm';
	const numbers = settings.pagestyle === 'plain' ? '@bottom-center{content:counter(page)}' : '';
	return '@page{size:' + size + ';margin:' + margin + (numbers ? ';' + numbers : '') + '}';
}
