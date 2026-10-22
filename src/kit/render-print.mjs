// SPDX-License-Identifier: MIT
import {collectPdfVectors} from './pdf-vectors.mjs';
import {collectPdfGlyphs} from './pdf-glyphs.mjs';
import {pdfFontSources, waitForFonts} from './export-fonts.mjs';
import {apply as applyTypography} from '../layout/typography.mjs';
import {documentLanguage, pageSizeOf} from '../spec/document-settings.mjs';
import {applyPrintCapitals} from './print-capitals.mjs';
import {stripOneTerminator as _rapierWillStripOneTerminator} from '../agent/will.mjs';
import {quotedWillSpan} from '../spec/md-marks.mjs';
const RAPIER_WILL_SENTINEL_MARK = '⁣';
// SPDX-License-Identifier: MIT
function createPrintRenderer(runtime) {
  const {Node, _rapierWillParse, crypto, document, globalThis} = runtime;
function _rapierWillSentinelPlan(canonical, kind) {
	if (kind !== 'markdown') return null;
	const source = String(canonical == null ? '' : canonical);
	const will = _rapierWillParse(source);
	if (!will.present) return null;
	const sentinel = RAPIER_WILL_SENTINEL_MARK + 'WILL#' + crypto.randomUUID() + ':';
	const markers = [];
	let out = '', cursor = 0;
	for (const block of will.blocks) {
		out += source.slice(cursor, block.start);
		markers.push(_rapierWillStripOneTerminator(source.slice(block.start, block.end)));
		out += '\n\n' + sentinel + (markers.length - 1) + RAPIER_WILL_SENTINEL_MARK + '\n\n';
		cursor = block.end;
	}
	return { canonical: out + source.slice(cursor), markers, sentinel };
}




function _rapierPrintWillAdmit(canonical, plan) {
	const quoted = quotedWillSpan(canonical, _rapierWillParse(canonical).blocks.map(block => [block.start, block.end]));
	if (quoted && quoted.where === 'frontmatter') throw _rapierPrintWillLost('a marker stands in the front matter, which is not on the printed page', 'Take it out of the front matter');
	if (quoted) throw _rapierPrintWillLost('a marker stands inside other content, where a reader of the PDF\'s text could not tell it from a carried marker', 'Take the quoted marker out');
	for (const marker of plan.markers) {
		const bad = /[\u0000\u0009\u000a\u000c\u000d\u1df8\u202b]/.exec(marker);
		if (bad) throw _rapierPrintWillLost('U+' + bad[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0') + ' in a marker cannot be read back from a PDF', 'Take it out of the marker');
	}
	if (new Set(plan.markers.flatMap(marker => Array.from(marker))).size > 65000) throw _rapierPrintWillLost('the markers use more distinct characters than a font can hold', 'Shorten them');
}

function _rapierPrintWillFont(markers, advanceOverride) {
	const metrics = _rapierPrintWillMetrics(markers);
	const size = metrics.size;
	const advance = advanceOverride ?? metrics.advance;
	const scalars = Array.from(new Set(markers.flatMap(marker => Array.from(marker, ch => ch.codePointAt(0)))));
	const order = scalars.filter(code => code < 0x10000).sort((a, b) => a - b)
		.concat(scalars.filter(code => code >= 0x10000).sort((a, b) => b - a));
	const count = order.length + 1;
	const u16 = v => [(v >> 8) & 255, v & 255];
	const u32 = v => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
	const cat = (...parts) => parts.flat(Infinity);
	const groups = pairs => pairs.reduce((out, [code, glyph]) => {
		const last = out[out.length - 1];
		if (last && code === last.end + 1 && glyph === last.glyph + code - last.start) last.end = code;
		else out.push({ start: code, end: code, glyph });
		return out;
	}, []);
	const pairs = order.map((code, index) => [code, index + 1]).sort((a, b) => a[0] - b[0]);
	const segments = groups(pairs.filter(([code]) => code < 0xffff))
		.map(g => [g.start, g.end, (g.glyph - g.start) & 0xffff]).concat([[0xffff, 0xffff, 1]]);
	const wide = groups(pairs);
	let power = 1, select = 0;
	while (power * 2 <= segments.length) { power *= 2; select++; }
	const narrow = cat(u16(4), u16(16 + segments.length * 8), u16(0), u16(segments.length * 2), u16(power * 2), u16(select),
		u16(segments.length * 2 - power * 2), segments.map(s => u16(s[1])), u16(0), segments.map(s => u16(s[0])),
		segments.map(s => u16(s[2])), segments.map(() => u16(0)));
	const full = cat(u16(12), u16(0), u32(16 + wide.length * 12), u32(0), u32(wide.length), wide.map(g => cat(u32(g.start), u32(g.end), u32(g.glyph))));
	const cmap = narrow.length <= 0xffff
		? cat(u16(0), u16(2), u16(3), u16(1), u32(20), u16(3), u16(10), u32(20 + narrow.length), narrow, full)
		: cat(u16(0), u16(1), u16(3), u16(10), u32(12), full);
	const bounds = [0, -400, 10, 0];
	const outline = cat(u16(1), bounds.map(u16), u16(2), u16(0), [1, 1, 1], u16(0), u16(10), u16(-5), u16(bounds[1]), u16(bounds[3] - bounds[1]), u16((bounds[1] - bounds[3]) / 2), [0]);
	const utf16 = text => Array.from(text, ch => u16(ch.charCodeAt(0)));
	const names = [[1, 'RapierWillCarrier'], [2, 'Regular'], [4, 'RapierWillCarrier Regular'], [6, 'RapierWillCarrier-Regular']];
	let offset = 0;
	const tables = {
		'OS/2': cat(u16(4), u16(advance), u16(400), u16(5), u16(0), u16(650), u16(600), u16(0), u16(75), u16(650), u16(600), u16(0), u16(350),
			u16(50), u16(300), u16(0), new Array(10).fill(0), u32(0), u32(0), u32(0), u32(0), [78, 79, 78, 69], u16(0x40),
			u16(order.find(code => code < 0xffff) || 0x20), u16(order.filter(code => code < 0xffff).pop() || 0x20), u16(500), u16(-500), u16(0),
			u16(500), u16(500), u32(1), u32(0), u16(500), u16(700), u16(0), u16(32), u16(0)),
		cmap,
		glyf: Array.from({ length: count }, () => outline).flat(),
		head: cat(u32(0x00010000), u32(0x00010000), u32(0), u32(0x5f0f3cf5), u16(1), u16(1000), new Array(16).fill(0), bounds.map(u16),
			u16(0), u16(8), u16(2), u16(1), u16(0)),
		hhea: cat(u32(0x00010000), u16(500), u16(-500), u16(0), u16(advance), u16(0), u16(advance - 10), u16(10), u16(1), u16(0), u16(0), new Array(8).fill(0), u16(0), u16(count)),
		hmtx: Array.from({ length: count }, () => cat(u16(advance), u16(0))).flat(),
		loca: Array.from({ length: count + 1 }, (_, index) => u32(index * outline.length)).flat(),
		maxp: cat(u32(0x00010000), u16(count), u16(3), u16(1), u16(0), u16(0), u16(2), new Array(16).fill(0)),
		name: cat(u16(0), u16(names.length), u16(6 + names.length * 12),
			names.map(([id, text]) => { const at = offset; offset += text.length * 2; return cat(u16(3), u16(1), u16(0x409), u16(id), u16(text.length * 2), u16(at)); }),
			names.map(([, text]) => utf16(text))),
		post: cat(u32(0x00030000), u32(0), u16(-100), u16(50), new Array(20).fill(0)),
	};
	const tags = Object.keys(tables).sort();
	const padded = table => table.length % 4 ? table.concat(new Array(4 - table.length % 4).fill(0)) : table;
	const sum = bytes => { let total = 0; for (let at = 0; at < bytes.length; at += 4) total = (total + ((bytes[at] << 24 | bytes[at + 1] << 16 | bytes[at + 2] << 8 | bytes[at + 3]) >>> 0)) >>> 0; return total; };
	let place = 12 + tags.length * 16;
	const directory = tags.map(tag => { const at = place; place += padded(tables[tag]).length; return cat([...tag].map(ch => ch.charCodeAt(0)), u32(sum(padded(tables[tag]))), u32(at), u32(tables[tag].length)); });
	let tableSelect = 0;
	while (2 << tableSelect <= tags.length) tableSelect++;
	const file = cat(u32(0x00010000), u16(tags.length), u16((1 << tableSelect) * 16), u16(tableSelect), u16(tags.length * 16 - (1 << tableSelect) * 16), directory, tags.map(tag => padded(tables[tag])));
	const headAt = 12 + tags.length * 16 + tags.slice(0, tags.indexOf('head')).reduce((total, tag) => total + padded(tables[tag]).length, 0);
	file.splice(headAt + 8, 4, ...u32((0xb1b0afba - sum(file)) >>> 0));
	return { family: 'RapierWillCarrier', bytes: Uint8Array.from(file), size, codes: order, bounds };
}

function _rapierPrintWillMetrics(markers) {
	const size = 2, natural = 200, line = 216;
	const longest = markers.reduce((most, marker) => Math.max(most, Array.from(marker).length), 1);
	return { size, advance: Math.max(1, Math.min(natural, Math.floor(line * 1000 / (longest * size)))) };
}

function _rapierPrintWillPlace(root, plan) {
	const lost = () => { throw _rapierPrintWillLost('a marker stands inside other content, where a reader of the PDF\'s text could not tell it from a carried marker', 'Take the quoted marker out'); };
	const measure = _rapierPrintWillMetrics(plan.markers);
	const tokens = new Map(plan.markers.map((marker, index) => [plan.sentinel + index + RAPIER_WILL_SENTINEL_MARK, index]));
	const rows = [];
	for (const paragraph of root.querySelectorAll('p')) {
		const index = tokens.get(paragraph.textContent);
		if (index !== undefined) rows.push({ paragraph, index });
	}
	if (rows.length !== plan.markers.length || rows.some((row, at) => row.index !== at)) lost();
	const runs = [];
	for (const row of rows) {
		let before = row.paragraph.previousSibling;
		while (before && before.nodeType === Node.TEXT_NODE && !before.nodeValue.trim()) before = before.previousSibling;
		const last = runs[runs.length - 1];
		if (last && before === last[last.length - 1].paragraph) last.push(row);
		else runs.push([row]);
	}
	const line = 'display:block;position:static;float:none;box-sizing:content-box;width:auto;height:0;min-height:0;margin:0;padding:0;border:0;overflow:visible;'
		+ 'white-space:pre;text-align:left;text-indent:0;text-transform:none;text-shadow:none;text-rendering:geometricPrecision;letter-spacing:0;word-spacing:0;hyphens:none;'
		+ 'font:' + measure.size + 'px/0 RapierWillCarrier,sans-serif;font-variant-ligatures:none;font-kerning:none;font-feature-settings:normal;'
		+ 'direction:ltr;unicode-bidi:normal;color:rgba(0,0,0,.0039);break-after:avoid;break-inside:avoid;user-select:none;pointer-events:none;';
	for (const run of runs) {
		const first = run[0].paragraph;
		const next = run[run.length - 1].paragraph.nextElementSibling;
		const carriers = run.map((row, at) => {
			const carrier = document.createElement('div');
			carrier.className = 'rapier-will-carrier';
			carrier.setAttribute('aria-hidden', 'true');
			carrier.style.cssText = line + (at ? 'padding-top:' + at * 3 + 'px;margin-bottom:-' + at * 3 + 'px;' : '');
			carrier.textContent = plan.markers[row.index];
			return carrier;
		});
		if (next && next.tagName === 'HR') {
			if (first.previousElementSibling || first.parentNode !== root) carriers[0].style.marginTop = 'var(--md-line)';
			next.style.marginTop = '0';
		}
		first.before(...carriers);
		for (const row of run) row.paragraph.remove();
	}
	if (String(root.textContent).includes(plan.sentinel)) lost();
}

function _rapierPrintWillLost(why, fix) {
	return new Error('WILL LOST — the PDF could not carry every Will marker: ' + why + '. ' + fix + ', or export HTML, which keeps the source exact.');
}

function _rapierPrintWillPageCss() {
	const last = '.rapier-will-carrier:not(:has(~:not(.rapier-will-carrier)))';
	return '@media print{\n'
		+ '.md-render>:not(.rapier-will-carrier,h1,h2,h3,h4,h5,h6)+' + last + '{margin-top:calc(-1 * var(--md-line) - 4px)!important}\n'
		+ '.md-render>:is(h1,h2,h3,h4,h5,h6)+' + last + '{margin-top:calc(-1 * var(--md-line) / 2 - 4px)!important}\n'
		+ '}';
}

const CAPTURE_EDGE = 4096, CAPTURE_PIXELS = 4 * 1024 * 1024;

function wrapMasks(main) {
	const doc = main.ownerDocument;
	for (const float of main.querySelectorAll('.rapier-wrap-picture')) {
		const image = float.querySelector('img'), layout = decodeURIComponent(image?.getAttribute('data-rapier-image-layout') || '');
		if (!image || !/\bwrap=around\b/.test(layout) || /\b(rotate|y)=/.test(layout) || image.dataset.rapierContour?.endsWith('-box')) continue;
		if (/^(inset|polygon)\(/.test(float.style.getPropertyValue('shape-outside'))) continue;
		const bounds = image.getBoundingClientRect(), width = Math.ceil(bounds.width), height = Math.ceil(bounds.height);
		float.style.removeProperty('shape-outside');
		if (!(width > 0 && height > 0) || width * height > 4e6) continue;
		const canvas = doc.createElement('canvas');
		canvas.width = width; canvas.height = height;
		try {
			const context = canvas.getContext('2d', {willReadFrequently: true});
			context.drawImage(image, 0, 0, width, height);
			const alpha = context.getImageData(0, 0, width, height).data;
			let clear = false;
			for (let index = 3; index < alpha.length && !clear; index += 4) clear = alpha[index] < 250;
			if (!clear) continue;
			float.style.setProperty('shape-outside', 'url("' + canvas.toDataURL('image/png') + '")');
			float.style.setProperty('shape-image-threshold', '0.1');
			float.style.setProperty('shape-margin', '1rem');
		} catch (_) {  }
	}
}

const REFUSALS = {
	visual_too_large: 'This document is too large for a PDF. Use Word or HTML, or split it.',
	visual_resources_unavailable: 'A picture or font could not be read for the PDF.',
	visual_capture_expired: 'The PDF took too long to draw. Try again, or split the document.',
	pdf_render_timeout: 'The PDF took too long to draw. Try again, or split the document.',
	pdf_render_unavailable: 'This browser could not draw the PDF.',
	pdf_page_geometry_invalid: 'The page size is not one a PDF can use.',
	pdf_text_glyph_limit: 'The PDF cannot hold this many different letters. Use Word or HTML.',
	pdf_template_border_unavailable: 'The page border could not be drawn.',
	document_changed: 'The document changed while the PDF was drawn. Try again.',
	export_too_large: 'The file is larger than the limit. Split the document.',
};

async function _rapierWritePrintPdf({root, css, fontCss = '', canonical, bom = false, filename, title, settings, templatePage = null}, {capture, signal, current, maxBytes = 8 * 1024 * 1024, film, ink} = {}) {
	const refuse = code => { throw Object.assign(new Error(code), {code}); };
	const spoken = error => {
		const code = error?.code || error?.message, words = REFUSALS[code];
		return words && error.message !== words ? Object.assign(new Error(words), {code}) : error;
	};
	const check = () => {
		if (signal?.aborted) refuse('cancelled');
		if (current?.() === false) refuse('document_changed');
	};
	if (!root?.ownerDocument || typeof capture !== 'function') refuse('pdf_render_unavailable');
	const paper = settings?.papersize || (templatePage ? pageSizeOf(settings) : {width: 11906, height: 16838});
	const width = paper.width / 20, height = paper.height / 20;
	const margins = Object.fromEntries(['top', 'right', 'bottom', 'left'].map(side =>
		[side, settings?.geometry ? settings.geometry[side] / 20 : (side === 'top' ? 12 : 14) * 72 / 25.4]));
	const bodyWidth = Math.floor((width - margins.left - margins.right) * 4 / 3);
	const bodyHeight = Math.floor((height - margins.top - margins.bottom) * 4 / 3);
	if (bodyWidth < 1 || bodyHeight < 1) refuse('pdf_page_geometry_invalid');
	const tiled = bodyWidth > CAPTURE_EDGE || bodyHeight > CAPTURE_EDGE || bodyWidth * bodyHeight > CAPTURE_PIXELS;
	const frame = document.createElement('iframe');
	let vectors, backdrop = null, nativeGlyphs, filmSession;
	let rejectAbort;
	const aborted = new Promise((_, reject) => { rejectAbort = reject; });
	aborted.catch(() => {});
	const abort = () => rejectAbort(Object.assign(new Error('cancelled'), {code: 'cancelled'}));
	signal?.addEventListener('abort', abort, {once: true});
	const step = async work => {
		check();
		let timer;
		try {
			const timeout = new Promise((_, reject) => {
				timer = setTimeout(() => reject(Object.assign(new Error('pdf_render_timeout'), {code: 'pdf_render_timeout'})), 15000);
			});
			const value = await Promise.race([work, aborted, timeout]); check(); return value;
		} finally { clearTimeout(timer); }
	};
	frame.setAttribute('aria-hidden', 'true');
	frame.style.cssText = `position:fixed;left:-100000px;top:0;width:${bodyWidth}px;height:${bodyHeight}px;border:0;pointer-events:none`;
	document.body.append(frame);
	try {
		check();
		const into = frame.contentDocument;
		if (!into?.body) refuse('pdf_render_unavailable');
		into.open(); into.write('<!doctype html><html><head></head><body></body></html>'); into.close();
		into.documentElement.setAttribute('data-rapier-theme', 'light');
		into.documentElement.setAttribute('lang', documentLanguage(settings, document.defaultView?.navigator?.language));
		into.documentElement.setAttribute('data-highlights', document.documentElement.getAttribute('data-highlights') || 'standard');
		into.body.className = 'light';
		const sheet = into.createElement('style'); sheet.textContent = String(css || ''); into.head.append(sheet);
		const printRules = [];
		const collect = rules => {
			for (const rule of rules) {
				if (rule.media?.mediaText === 'print') printRules.push(...Array.from(rule.cssRules, item => item.cssText));
				else if (rule.cssRules && !rule.media) collect(rule.cssRules);
			}
		};
		collect(sheet.sheet.cssRules);
		const printed = into.createElement('style');
		printed.textContent = printRules.join('\n') + `\nhtml,body{width:${bodyWidth}px!important;height:${bodyHeight}px!important;margin:0!important;padding:0!important;overflow:visible!important}`;
		into.head.append(printed);
		const surface = into.createElement('div'), strip = into.createElement('div');
		surface.style.cssText = `width:${bodyWidth}px;height:${bodyHeight}px;overflow:hidden;position:relative;background:#fff`;
		strip.style.cssText = `width:${bodyWidth}px;height:${bodyHeight}px;position:relative`;
		strip.append(root); surface.append(strip); into.body.append(surface);
		const main = root.querySelector('main');
		if (!main) refuse('pdf_render_unavailable');
		if (templatePage) for (const image of main.querySelectorAll('img')) if (image.getAttribute('src') === templatePage.url) (image.closest('p,figure') || image).remove();
		main.setAttribute('data-md-theme', 'light');
		for (const details of main.querySelectorAll('details')) details.open = true;
		main.getBoundingClientRect();
		if (fontCss) await step(waitForFonts(main, {fontCss, css, settings}));
		await step(into.fonts.ready);
		for (const image of main.querySelectorAll('img')) { image.loading = 'eager'; await step(image.decode()); }
		wrapMasks(main);
		check();
		for (const node of [main, ...main.querySelectorAll('*')]) {
			const style = into.defaultView.getComputedStyle(node);
			if (!node.closest('.rapier-will-carrier') && ['absolute', 'fixed'].includes(style.position) && /^rect\(/.test(style.clip)) {
				const box = style.clip.slice(5, -1).trim().split(/[,\s]+/).map(Number.parseFloat);
				if (box.length === 4 && box.every(Number.isFinite) && (box[1] <= box[3] || box[2] <= box[0])) {
					node.style.setProperty('display', 'none', 'important'); continue;
				}
			}
			for (const name of ['break-before', 'break-after', 'break-inside']) {
				const value = style.getPropertyValue(name);
				if (value.includes('page')) node.style.setProperty(name, value.replace('page', 'column'), 'important');
			}
		}
		for (const [name, value] of Object.entries({width: bodyWidth + 'px', height: bodyHeight + 'px',
			'max-width': 'none', 'min-height': '0', padding: '0', margin: '0', overflow: 'visible',
			'column-width': bodyWidth + 'px', 'column-gap': '0', 'column-count': 'auto', 'column-fill': 'auto', background: 'none'}))
			main.style.setProperty(name, value, 'important');
		globalThis.RapierMath?.fit(main);
		applyPrintCapitals(main);
		applyTypography(main, {all: true});
		ink?.(main);
		const count = Math.max(1, Math.ceil((main.scrollWidth - 1) / bodyWidth));
		if (!Number.isSafeInteger(count)) refuse('pdf_page_geometry_invalid');
		const customFonts = pdfFontSources(fontCss), customFamilies = new Set(customFonts.map(face => face.family.toLowerCase()));
		const glyphOptions = {width: bodyWidth, check,
			prepareFont: globalThis.RapierExportFonts?.preparePdfFont && ((bytes, text, style, face) =>
				globalThis.RapierExportFonts.preparePdfFont(bytes, text, style, face, {subset: globalThis.RapierFontSubsetPlugin?.subset})),
			systemFonts: globalThis.RapierExportFonts?.systemPdfFonts,
			maskFont: globalThis.RapierExportFonts?.maskPdfFont,
			faces: [...customFonts, ...(globalThis.RapierDocxFonts?.DOCX_FONTS || []).filter(face => !customFamilies.has(face.family.toLowerCase())),
				...pdfFontSources(css).filter(face => !customFamilies.has(face.family.toLowerCase()))]};
		nativeGlyphs = await collectPdfGlyphs(main, glyphOptions);
		const textPages = await _rapierPrintTextPages(main, bodyWidth, count, check, undefined, nativeGlyphs.nodes, nativeGlyphs.markers);
		const linkPages = _rapierPrintLinkPages(main, bodyWidth, bodyHeight, count);
		vectors = await collectPdfVectors(main, {width: bodyWidth, height: bodyHeight, count, capture, signal, current, check, maxBytes, underlay: true,
			sanitizeSvg: globalThis.RapierImageAssets?.sanitizeSvgText,
            collectText: root => collectPdfGlyphs(root, {...glyphOptions, origin: main.getBoundingClientRect()})});
        for (const {root, original, text} of vectors.textRoots) {
            const held = await _rapierPrintTextPages(root, bodyWidth, count, check, main.getBoundingClientRect(), text?.nodes);
            nativeGlyphs.painted.push(...(text?.painted || []));
            for (const [page, runs] of held.entries()) {
                const at = textPages[page].findIndex(run => run.imageRoot === original);
                if (at >= 0) textPages[page].splice(at, 1, ...runs); else textPages[page].push(...runs);
            }
        }
		const text = textPages.flatMap(page => page.map(run => run.text));
		const glyphs = new Set();
		for (const line of text) for (const character of line) {
			glyphs.add(character);
			if (glyphs.size > 65000) refuse('pdf_text_glyph_limit');
		}
		const font = _rapierPrintWillFont(text, 500);
		strip.style.width = count * bodyWidth + 'px';
		strip.style.transform = 'none';
		if (typeof film !== 'function') refuse('pdf_render_unavailable');
		const underlay = vectors.pages.some(items => items.some(drawing => drawing.under));
		if (underlay) surface.style.setProperty('background', 'transparent');
		let pendingFilm = null, abandonFilm = false;
		const trackedFilm = Promise.resolve(film({root: surface, signal, current, frame: {width: count * bodyWidth, height: bodyHeight}})).then(session => {
			if (abandonFilm) session?.close?.();
			else pendingFilm = session;
			return session;
		});
		try {
			filmSession = await step(trackedFilm);
			pendingFilm = null;
		} catch (error) {
			abandonFilm = true;
			pendingFilm?.close?.();
			pendingFilm = null;
			throw error;
		}
		let share = Math.max(1, Math.min(Math.floor(CAPTURE_EDGE / bodyWidth), Math.floor(CAPTURE_PIXELS / (bodyWidth * bodyHeight))));
		const pages = [];
		let imageBytes = 0;
		const deflate = async bytes => {
			const packed = new Uint8Array(await step(new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()));
			imageBytes += packed.byteLength;
			if (imageBytes > maxBytes) refuse('export_too_large');
			return packed;
		};
		const pack = async (rgb, alpha = null) => pages.push({rgb: await deflate(rgb), ...(alpha && {alpha: await deflate(alpha)})});
		const tileWidth = Math.min(bodyWidth, CAPTURE_EDGE), tileHeight = Math.min(bodyHeight, CAPTURE_EDGE, Math.floor(CAPTURE_PIXELS / tileWidth));
		for (let index = 0; tiled && index < count; index++) {
			const tiles = [];
			for (let y = 0; y < bodyHeight; y += tileHeight) for (let x = 0; x < bodyWidth; x += tileWidth) {
				check();
				const width = Math.min(tileWidth, bodyWidth - x), height = Math.min(tileHeight, bodyHeight - y);
				const shot = await step(filmSession.raster({x: index * bodyWidth + x, y, width, height}, {transparent: underlay}));
				if (shot?.width !== width || shot?.height !== height || !(shot.rgb instanceof Uint8Array) || underlay && !(shot.alpha instanceof Uint8Array)) refuse('pdf_render_unavailable');
				await pack(shot.rgb, shot.alpha);
				shot.rgb = shot.alpha = null;
				tiles.push({...pages.pop(), x, y, width, height});
			}
			pages.push({tiles});
		}
		for (let first = 0; !tiled && first < count;) {
			check();
			const span = Math.min(share, count - first);
			try {
				const shot = await step(filmSession.raster({x: first * bodyWidth, y: 0, width: span * bodyWidth, height: bodyHeight}, {transparent: underlay}));
				if (shot?.width !== span * bodyWidth || shot?.height !== bodyHeight || !(shot.rgb instanceof Uint8Array) || underlay && !(shot.alpha instanceof Uint8Array)) refuse('pdf_render_unavailable');
				if (span === 1) await pack(shot.rgb, shot.alpha);
				else {
					const row = bodyWidth * 3;
					for (let offset = 0; offset < span; offset++) {
						const rgb = new Uint8Array(bodyWidth * bodyHeight * 3), alpha = shot.alpha ? new Uint8Array(bodyWidth * bodyHeight) : null;
						for (let y = 0; y < bodyHeight; y++) {
							const from = (y * shot.width + offset * bodyWidth) * 3;
							rgb.set(shot.rgb.subarray(from, from + row), y * row);
							if (alpha) alpha.set(shot.alpha.subarray(y * shot.width + offset * bodyWidth, y * shot.width + (offset + 1) * bodyWidth), y * bodyWidth);
						}
						await pack(rgb, alpha);
					}
				}
				shot.rgb = shot.alpha = null;
			} catch (error) {
				if (error?.code === 'visual_too_large' && span > 1) { share = Math.ceil(span / 2); continue; }
				throw error;
			}
			first += span;
		}
		check();
		if (templatePage) {
			const sheetWidth = Math.round(width * 4 / 3), sheetHeight = Math.round(height * 4 / 3);
			const holder = into.createElement('div'), picture = into.createElement('img');
			holder.style.cssText = `position:fixed;left:0;top:0;width:${sheetWidth}px;height:${sheetHeight}px;pointer-events:none`;
			picture.style.cssText = 'display:block;width:100%;height:100%'; picture.src = templatePage.url;
			holder.append(picture); into.body.append(holder);
			await step(picture.decode());
			backdrop = await collectPdfVectors(holder, {width: sheetWidth, height: sheetHeight, count: 1, capture, signal, current, check, maxBytes,
				sanitizeSvg: globalThis.RapierImageAssets?.sanitizeSvgText, pictures: true});
			if (!backdrop.pages[0].length) refuse('pdf_template_border_unavailable');
		}
		const bytes = await writeRasterPdf({pages, textPages, linkPages, vectorPages: vectors.pages, canonical, bom, filename, title, font, width, height, margins, backdrop: backdrop?.pages[0] || null,
			pixelWidth: bodyWidth, pixelHeight: bodyHeight, pageNumbers: settings?.pagestyle === 'plain', maxBytes, check});
		check();
		return {bytes, pages: count, painted: nativeGlyphs.painted};
	} catch (error) { throw spoken(error); }
	finally { filmSession?.close(); backdrop?.restore(); vectors?.restore(); nativeGlyphs?.restore(); signal?.removeEventListener('abort', abort); frame.remove(); }
}

async function _rapierPrintTextPages(main, pageWidth, count, check, origin = main.getBoundingClientRect(), nativeNodes = null, markerNodes = null) {
	const into = main.ownerDocument;
	const pages = Array.from({length: count}, () => []), walker = into.createTreeWalker(main, 5);
	const markerMetrics = _rapierPrintWillMetrics(Array.from(main.querySelectorAll('.rapier-will-carrier'), node => node.textContent));
	const markerLost = () => { throw _rapierPrintWillLost('a marker has no readable position on the page', 'Try another browser'); };
	const range = into.createRange(), segmenter = new Intl.Segmenter(undefined, {granularity: 'grapheme'});
	let nodes = 0, operations = 0;
	for (let node; (node = walker.nextNode());) {
		if (++nodes % 128 === 0) { await new Promise(resolve => setTimeout(resolve, 0)); check(); }
		const element = node.nodeType === 1 ? node : node.parentElement;
        if (node.nodeType === 1 && node.localName === 'img') {
            const rect = node.getBoundingClientRect(), page = Math.max(0, Math.min(count - 1, Math.floor((rect.left - origin.left + .01) / pageWidth)));
            pages[page].push({imageRoot: node, text: '', parts: []});
        }
		const marker = markerNodes?.get(node);
		if (marker && marker.page < count) pages[marker.page].push({...marker, block: node, carrier: null, marker: true});
		const formula = node.nodeType === 1 && node.matches('.math-rendered[data-math-src]') && node.querySelector('svg');
		if (node.nodeType === 1 && !formula || node.nodeType === 3 && element.closest('.math-rendered[data-math-src]')) continue;
		let value;
		if (formula) {
			value = formula.getAttribute('aria-label') || '';
		} else value = node.data;
		const style = into.defaultView.getComputedStyle(element);
		const carrier = element.closest('.rapier-will-carrier');
		if (style.visibility === 'hidden' || style.visibility === 'collapse') { if (carrier) markerLost(); continue; }
		const preserve = /pre|break-spaces/.test(style.whiteSpace);
		const block = element.closest('p,h1,h2,h3,h4,h5,h6,li,pre,td,th,figcaption,blockquote,.rapier-will-carrier') || element;
		const native = nativeNodes?.get(node);
		let characters = null;
		const pageOf = x => Math.max(0, Math.min(count - 1, Math.floor((x - origin.left + .01) / pageWidth)));
		const visit = (start, end, measured = null) => {
			if (++operations % 128 === 0) check();
			if (!formula) { range.setStart(node, start); range.setEnd(node, end); }
			const rects = measured ? measured.map(part => ({left: origin.left + part.page * pageWidth + part.x, right: origin.left + part.page * pageWidth + part.x + part.width,
				top: origin.top + part.y, bottom: origin.top + part.y + part.height, width: part.width, height: part.height})) :
				Array.from(formula ? [formula.getBoundingClientRect()] : range.getClientRects()).filter(rect => rect.height > 0 && (rect.width > 0 || carrier));
			if (!rects.length) { if (carrier) markerLost(); return; }
			const first = rects[0], page = pageOf(first.left);
			const oneLine = rects.every(rect => pageOf(rect.left) === page && pageOf(rect.width ? rect.right - .02 : rect.left) === page && Math.abs(rect.top - first.top) < .5);
			let middle = formula ? start : Math.floor((start + end) / 2);
			if (middle > start) middle = (characters ||= segmenter.segment(value)).containing(middle).index;
			const cluster = native?.find(item => item.start < middle && item.end > middle);
			if (cluster) middle = cluster.start > start ? cluster.start : cluster.end;
			if (!oneLine && middle > start && middle < end) { visit(start, middle); visit(middle, end); return; }
			let text = value.slice(start, end);
			if (!formula) text = (preserve ? text.replace(/\r\n?|\n/g, '') : text.replace(/[ \t\r\n\f]+/g, ' ')).replace(/\u00ad/g, '');
			if (!text && !native?.some(item => item.start >= start && item.end <= end && item.soft)) return;
			const x = Math.min(...rects.map(rect => rect.left)) - origin.left - page * pageWidth;
			const y = Math.min(...rects.map(rect => rect.top)) - origin.top;
			let right = Math.max(...rects.map(rect => rect.right)) - origin.left - page * pageWidth;
			if (carrier && right === x) right += Array.from(text).length * markerMetrics.advance * markerMetrics.size / 1000;
			const bottom = Math.max(...rects.map(rect => rect.bottom)) - origin.top;
			let parts = native ? native.filter(item => item.start >= start && item.end <= end && item.text).map(item => ({...item, rtl: style.direction === 'rtl'}))
                : [{text, x, y, width: right - x, height: bottom - y, rtl: style.direction === 'rtl'}];
            if (native) {
                const joined = [];
                for (const part of parts) {
                    const last = joined.at(-1);
                    if (last && !last.font && !part.font) {
                        const right = Math.max(last.x + last.width, part.x + part.width);
                        last.x = Math.min(last.x, part.x); last.width = right - last.x;
                        last.text += part.text; last.end = part.end;
                    } else joined.push(part);
                }
                parts = joined;
            }
			const last = pages[page].at(-1);
			if (last && !formula && !last.math && !last.marker && last.block === block && last.carrier === carrier && Math.abs(last.y - y) < Math.max(2, Math.min(last.height, bottom - y) * .2)) {
				if (!preserve && last.text.endsWith(' ') && text.startsWith(' ') && parts.length) {
					const first = parts[0];
					if (first.text === ' ') parts.shift();
					else {const advance = first.width / Array.from(first.text).length; first.text = first.text.slice(1); first.x += advance; first.width -= advance;}
				}
				last.text = preserve ? last.text + text : (last.text + text).replace(/[ \t\r\n\f]+/g, ' ');
				last.parts.push(...parts);
				last.width = Math.max(last.x + last.width, right) - Math.min(last.x, x);
				last.height = Math.max(last.y + last.height, bottom) - Math.min(last.y, y);
				last.x = Math.min(last.x, x); last.y = Math.min(last.y, y);
			} else pages[page].push({text, x, y, width: right - x, height: bottom - y, block, carrier, math: !!formula, parts});
		};
		if (native) {
			const lines = [];
			for (const part of native) {
				const last = lines.at(-1);
				if (last && last[0].page === part.page && Math.abs(last[0].y - part.y) < .5) last.push(part);
				else lines.push([part]);
			}
			for (const line of lines) visit(line[0].start, line.at(-1).end, line);
		} else visit(0, value.length);
	}
	check();
	const pageHeight = origin.height;
	for (const page of pages) {
		let prev = null;
		for (const run of page) {
			if (run.carrier && prev && run.y + 0.25 < prev.y + prev.height * .8) {
				const next = Math.min(pageHeight - 0.5, prev.y + prev.height * .85);
				if (next > run.y) {
					const dy = next - run.y;
					run.y += dy;
					for (const part of run.parts || []) part.y += dy;
				}
			}
			prev = run;
		}
	}
	const ROLES = {TABLE: 'Table', TR: 'TR', TD: 'TD', TH: 'TH', UL: 'L', OL: 'L', LI: 'LI', BLOCKQUOTE: 'BlockQuote', P: 'P', PRE: 'Code', FIGCAPTION: 'Caption',
		H1: 'H1', H2: 'H2', H3: 'H3', H4: 'H4', H5: 'H5', H6: 'H6'};
	const bodies = new WeakMap(), labels = new WeakMap();
	const tags = (block, marker) => {
		const chain = [];
		for (let node = block; node && node !== main; node = node.parentElement)
			if (ROLES[node.tagName] || node === block && node.matches('.rapier-will-carrier')) chain.unshift({node, role: ROLES[node.tagName] || 'P'});
		const out = [];
		chain.forEach((entry, at) => {
			const note = entry.node.localName === 'li' && entry.node.classList.contains('footnote-item');
			out.push(note ? {...entry, role: 'Note'} : entry);
			if (entry.node.localName !== 'li') return;
			const last = !chain.slice(at + 1).some(inner => inner.node.localName === 'li');
			if (marker && last) {
				if (!labels.has(entry.node)) labels.set(entry.node, {});
				out.push({node: labels.get(entry.node), role: 'Lbl'});
			}
			else if (!note) {
				if (!bodies.has(entry.node)) bodies.set(entry.node, {});
				out.push({node: bodies.get(entry.node), role: 'LBody'});
			}
		});
		return out;
	};
	return pages.map(page => page.map(({block, ...run}) => ({...run, tags: tags(block, run.marker)})));
}

function _rapierPrintLinkPages(main, width, height, count) {
	const origin = main.getBoundingClientRect(), pages = Array.from({length: count}, () => []);
	for (const anchor of main.querySelectorAll('a[href]')) {
		const href = anchor.getAttribute('href');
		if (!href || /^(?:javascript|vbscript|data):/i.test(href)) continue;
		let target;
		if (href.startsWith('#')) {
			let id; try { id = decodeURIComponent(href.slice(1)); } catch (_) { continue; }
			const node = main.ownerDocument.getElementById(id);
			if (!node || !main.contains(node)) continue;
			const box = node.getBoundingClientRect(), page = Math.floor((box.left - origin.left + .01) / width);
			if (page < 0 || page >= count) continue;
			target = {page, x: box.left - origin.left - page * width, y: box.top - origin.top};
		} else target = {uri: encodeURI(href).replace(/%25([a-f0-9]{2})/gi, '%$1')};
		for (const box of anchor.getClientRects()) {
			if (!(box.width > 0 && box.height > 0)) continue;
			const first = Math.max(0, Math.floor((box.left - origin.left + .01) / width));
			const last = Math.min(count - 1, Math.floor((box.right - origin.left - .01) / width));
			for (let page = first; page <= last; page++) {
				const x = Math.max(0, box.left - origin.left - page * width), y = Math.max(0, box.top - origin.top);
				const right = Math.min(width, box.right - origin.left - page * width), bottom = Math.min(height, box.bottom - origin.top);
				if (right > x && bottom > y) pages[page].push({x, y, width: right - x, height: bottom - y, target});
			}
		}
	}
	return pages;
}

  return {_rapierWillSentinelPlan, _rapierPrintWillAdmit, _rapierPrintWillFont, _rapierPrintWillMetrics, _rapierPrintWillPlace, _rapierPrintWillLost, _rapierPrintWillPageCss, _rapierWritePrintPdf};
}

function _rapierPrintSlots(text, rtl) {
	const pieces = [];
	let scalars = 0, count = 0;
	for (const {segment} of new Intl.Segmenter(undefined, {granularity: 'grapheme'}).segment(text)) {
		const dir = /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u.test(segment) ? 'r' : /\p{L}/u.test(segment) ? 'l' : '';
		const cluster = {from: scalars, length: Array.from(segment).length}, last = pieces.at(-1);
		scalars += cluster.length; count++;
		if (last && (!dir || !last.dir || last.dir === dir)) { last.clusters.push(cluster); last.dir ||= dir; }
		else pieces.push({dir, clusters: [cluster]});
	}
	const slots = new Array(scalars);
	let slot = 0;
	for (const piece of rtl ? pieces.reverse() : pieces) {
		for (const cluster of (piece.dir || (rtl ? 'r' : 'l')) === 'r' ? piece.clusters.reverse() : piece.clusters) {
			slots.fill(slot++, cluster.from, cluster.from + cluster.length);
		}
	}
	return {slots, count};
}

async function writeRasterPdf({pages, textPages, linkPages = [], vectorPages = [], backdrop = null, canonical, bom = false, filename, title, font, width, height, margins, pixelWidth, pixelHeight, pageNumbers, maxBytes, check}) {
	const encoder = new TextEncoder(), encode = value => encoder.encode(value);
	const fail = code => { throw Object.assign(new Error(code), {code}); };
	const concat = parts => {
		const length = parts.reduce((sum, part) => sum + part.length, 0), bytes = new Uint8Array(length);
		let at = 0; for (const part of parts) {bytes.set(part, at); at += part.length;} return bytes;
	};
	const compressed = async bytes => {
		check();
		const pipe = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
		const result = new Uint8Array(await new Response(pipe).arrayBuffer()); check(); return result;
	};
	const objects = [null, null, null];
	let used = 0;
	const put = (id, bytes) => {
		bytes = typeof bytes === 'string' ? encode(bytes) : bytes;
		used += bytes.length + 32; if (used > maxBytes) fail('export_too_large'); objects[id] = bytes; return id;
	};
	const add = bytes => {objects.push(null); return put(objects.length - 1, bytes);};
	const stream = (dict, bytes) => add(concat([encode('<<' + dict + ' /Length ' + bytes.length + '>>\nstream\n'), bytes, encode('\nendstream')]));
	const hex = value => Array.from({length: value.length}, (_, index) => value.charCodeAt(index).toString(16).padStart(4, '0')).join('');
	const literal = value => '(' + String(value).replace(/[\\()\r\n]/g, character => ({'\\': '\\\\', '(': '\\(', ')': '\\)', '\r': '\\r', '\n': '\\n'}[character])) + ')';
	const source = encoder.encode((bom ? '\uFEFF' : '') + canonical);
	const embedded = stream('/Type /EmbeddedFile /Subtype /text#2Fmarkdown /Params <</Size ' + source.length + '>> /Filter /FlateDecode', await compressed(source));
	const file = add('<< /Type /Filespec /F ' + literal(String(filename).replace(/[^\x20-\x7e]/g, '_')) + ' /UF <feff' + hex(filename) + '> /AFRelationship /Source /EF << /F ' + embedded + ' 0 R /UF ' + embedded + ' 0 R >> >>');
	for (const page of textPages) for (const run of page) {
		let previous = null;
		for (const part of run.parts || []) {
			part.unicode = part.text.normalize('NFC'); part.actual = part.text.replace(/\u00ad/g, '');
			if (part.font && /^ +$/.test(part.text) && previous) {
                if (previous.font && /[\p{Script=Hebrew}]/u.test(previous.text) && previous.font.glyph(32)) {
                    part.font = previous.font; part.glyph = previous.font.glyph(32); previous = part;
                } else {
                    if (previous.font) previous.unicode += part.text; else previous.text += part.text;
                    previous.actual += part.actual;
                    const right = Math.max(previous.x + previous.width, part.x + part.width);
                    if (!previous.font) previous.x = Math.min(previous.x, part.x);
                    previous.width = right - previous.x; part.unicode = '';
                }
            }
			else if (part.text !== '\u00ad') previous = part;
		}
		if (previous && !run.carrier && !run.parts?.at(-1)?.soft && previous === run.parts?.findLast(part => part.text.trim() && part.text !== '\u00ad')) {
			if (previous.font) {
                let ending = previous;
                const tail = [];
                for (let at = run.parts.indexOf(previous); at >= 0; at--) {
                    const part = run.parts[at];
                    if (part.font && !part.unicode) continue;
                    if (part.font !== previous.font) break;
                    tail.push(part);
                }
                if (tail.some(part => /\p{Script=Hebrew}/u.test(part.text))) ending = tail.reduce((a, b) => a.x > b.x ? a : b);
                ending.unicode += '\n';
            } else previous.copyEnd = '\n';
		}
	}
	const codes = new Map(font.codes.map((code, index) => [code, index + 1]));
	const rows = font.codes.map((code, index) => '<' + (index + 1).toString(16).padStart(4, '0') + '> <' + hex(String.fromCodePoint(code)) + '>');
	const fallbackCharacters = (part, carrier) => {
		const characters = Array.from(part.text);
		if (!carrier && !/[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}]/u.test([...part.text.trimEnd()].at(-1) || '')) {
			let suffix = part.copyEnd || '';
			while (characters.length > 1 && characters.at(-1) === ' ') suffix = characters.pop() + suffix;
			if (suffix && characters.length) characters[characters.length - 1] += suffix;
		}
		return characters;
	};
	const fallbackIds = font.codes.map((_, index) => index + 1);
	for (const page of textPages) for (const run of page) for (const part of run.parts || [run]) if (!part.font)
		for (const character of fallbackCharacters(part, run.carrier)) if ([...character].length > 1 && !codes.has(character)) {
			const code = rows.length + 1; if (code > 65535) fail('pdf_text_glyph_limit');
			codes.set(character, code); fallbackIds.push(codes.get(character.codePointAt(0)));
			rows.push('<' + code.toString(16).padStart(4, '0') + '> <' + hex(character) + '>');
		}
	let cmap = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /RapierText def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <ffff>\nendcodespacerange\n';
	for (let at = 0; at < rows.length; at += 100) cmap += Math.min(100, rows.length - at) + ' beginbfchar\n' + rows.slice(at, at + 100).join('\n') + '\nendbfchar\n';
	cmap += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
	const mapping = stream('/Filter /FlateDecode', await compressed(encode(cmap)));
	const fontFile = stream('/Length1 ' + font.bytes.length + ' /Filter /FlateDecode', await compressed(font.bytes));
	const descriptor = add('<< /Type /FontDescriptor /FontName /RapierText /Flags 4 /FontBBox [' + font.bounds.join(' ') + '] /ItalicAngle 0 /Ascent 500 /Descent -500 /CapHeight 500 /StemV 80 /FontFile2 ' + fontFile + ' 0 R >>');
	const fallbackMap = new Uint8Array((fallbackIds.length + 1) * 2);
	fallbackIds.forEach((id, index) => {fallbackMap[(index + 1) * 2] = id >> 8; fallbackMap[(index + 1) * 2 + 1] = id & 255;});
	const fallbackGlyphs = stream('/Filter /FlateDecode', await compressed(fallbackMap));
	const descendant = add('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /RapierText /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ' + descriptor + ' 0 R /DW 500 /CIDToGIDMap ' + fallbackGlyphs + ' 0 R >>');
	const type = add('<< /Type /Font /Subtype /Type0 /BaseFont /RapierText /Encoding /Identity-H /DescendantFonts [' + descendant + ' 0 R] /ToUnicode ' + mapping + ' 0 R >>');
	const carrierDescriptor = add('<< /Type /FontDescriptor /FontName /RapierWillCarrier /Flags 4 /FontBBox [' + font.bounds.join(' ') + '] /ItalicAngle 0 /Ascent 500 /Descent -500 /CapHeight 500 /StemV 80 /FontFile2 ' + fontFile + ' 0 R >>');
	const carrierDescendant = add('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /RapierWillCarrier /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ' + carrierDescriptor + ' 0 R /DW 500 /CIDToGIDMap /Identity >>');
	const carrierType = add('<< /Type /Font /Subtype /Type0 /BaseFont /RapierWillCarrier /Encoding /Identity-H /DescendantFonts [' + carrierDescendant + ' 0 R] /ToUnicode ' + mapping + ' 0 R >>');
	const numberFont = pageNumbers ? add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>') : null;
	const kids = pages.map(() => { objects.push(null); return objects.length - 1; }), decimal = value => Number(value.toFixed(4));
	const nativeFonts = new Map(), nativeEntries = [], fontFiles = new Map();
	const glyphKey = part => part.glyph + ':' + part.unicode + ':' + decimal(part.width / part.size / (part.scaleX || 1));
	for (const page of textPages) for (const run of page) for (const part of run.parts || []) if (part.font && part.unicode) {
		const key = glyphKey(part), cff = part.font.outline === 'cff';
		const cid = cff ? part.font.cids?.[part.glyph] ?? part.glyph : null;
		let variants = nativeFonts.get(part.font);
		if (!variants) {variants = []; nativeFonts.set(part.font, variants);}
		let entry = variants.find(entry => !cff || !entry.rows.some(row => row.code === cid && glyphKey(row) !== key));
		if (!entry) {
			entry = {font: part.font, name: '/Fn' + nativeEntries.length, codes: new Map(), rows: []};
			variants.push(entry); nativeEntries.push(entry);
		}
		if (!entry.codes.has(key)) {
			const code = cff ? cid : entry.rows.length + 1;
			if (code > 65535) fail('pdf_text_glyph_limit');
			entry.codes.set(key, code); entry.rows.push({...part, code});
		}
		part.pdfFont = entry;
	}
	const nativeResources = [], fontNames = new Map();
	for (const entry of nativeEntries) {
		check();
		const face = entry.font, scale = 1000 / face.units;
		if (!fontNames.has(face)) {
			const prefix = face.asset.subset ? fontNames.size.toString(26).padStart(6, '0').replace(/[0-9a-p]/g, c => String.fromCharCode(65 + parseInt(c, 26))) + '+' : '';
			fontNames.set(face, prefix + (face.asset.postscriptName || 'Rapier' + entry.name.slice(1) + '-' + face.asset.family).replace(/[^a-z0-9-]/gi, ''));
		}
		const name = fontNames.get(face);
		let unicode = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /' + name + 'Unicode def\n/CMapType 2 def\n1 begincodespacerange\n' + (face.type3 ? '<00> <ff>' : '<0000> <ffff>') + '\nendcodespacerange\n';
		for (let at = 0; at < entry.rows.length; at += 100) {const rows = entry.rows.slice(at, at + 100); unicode += rows.length + ' beginbfchar\n' + rows.map(row => '<' + row.code.toString(16).padStart(face.type3 ? 2 : 4, '0') + '> <' + hex(row.unicode) + '>').join('\n') + '\nendbfchar\n';}
		unicode += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
		const mapping = stream('/Filter /FlateDecode', await compressed(encode(unicode)));
		if (face.type3) {
			if (entry.rows.length > 255) fail('pdf_text_glyph_limit');
			const widths = entry.rows.map(row => decimal(row.width / row.size / (row.scaleX || 1) * 1000));
			const paths = [];
			for (let index = 0; index < entry.rows.length; index++) {
				const row = entry.rows[index], drawing = widths[index] + ' 0 d0\n' + face.commands;
				paths[index] = '/g' + row.code + ' ' + stream('/Filter /FlateDecode', await compressed(encode(drawing))) + ' 0 R';
			}
			const type = add('<< /Type /Font /Subtype /Type3 /Name /' + name + ' /FontBBox [' + face.bbox.join(' ') + '] /FontMatrix [.001 0 0 .001 0 0] /CharProcs << ' + paths.join(' ') + ' >> /Encoding << /Type /Encoding /Differences [1 ' + entry.rows.map(row => '/g' + row.code).join(' ') + '] >> /FirstChar 1 /LastChar ' + entry.rows.length + ' /Widths [' + widths.join(' ') + '] /Resources << >> /ToUnicode ' + mapping + ' 0 R >>');
			nativeResources.push(entry.name + ' ' + type + ' 0 R'); continue;
		}
		let descriptor = fontFiles.get(face);
		if (!descriptor) {
			const file = stream((face.outline === 'cff' ? '/Subtype /OpenType ' : '/Length1 ' + face.bytes.length) + ' /Filter /FlateDecode', await compressed(face.bytes));
			descriptor = add('<< /Type /FontDescriptor /FontName /' + name + ' /Flags ' + (face.italic ? 96 : 32) + ' /FontBBox [' + face.bbox.map(value => decimal(value * scale)).join(' ') + '] /ItalicAngle ' + decimal(face.italicAngle || 0) + ' /Ascent ' + decimal(face.ascent * scale)
				+ ' /Descent ' + decimal(face.descent * scale) + ' /CapHeight ' + decimal(face.capHeight * scale) + ' /StemV 80 /' + (face.outline === 'cff' ? 'FontFile3' : 'FontFile2') + ' ' + file + ' 0 R >>');
			fontFiles.set(face, descriptor);
		}
		let glyphMap = '';
		if (face.outline !== 'cff') {
			const ids = new Uint8Array((entry.rows.length + 1) * 2);
			for (const row of entry.rows) {ids[row.code * 2] = row.glyph >> 8; ids[row.code * 2 + 1] = row.glyph & 255;}
			glyphMap = ' /CIDToGIDMap ' + stream('/Filter /FlateDecode', await compressed(ids)) + ' 0 R';
		}
		const descendant = add('<< /Type /Font /Subtype /' + (face.outline === 'cff' ? 'CIDFontType0' : 'CIDFontType2') + ' /BaseFont /' + name + ' /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ' + descriptor + ' 0 R' + glyphMap + ' /W [' + entry.rows.map(row => row.code + ' [' + decimal(row.width / row.size / (row.scaleX || 1) * 1000) + ']').join(' ') + '] >>');
		const type = add('<< /Type /Font /Subtype /Type0 /BaseFont /' + name + ' /Encoding /Identity-H /DescendantFonts [' + descendant + ' 0 R] /ToUnicode ' + mapping + ' 0 R >>');
		nativeResources.push(entry.name + ' ' + type + ' 0 R');
	}
	const sharedImages = new Map();
	const structs = new Map(), documentElement = {role: 'Document', kids: []}, parentTree = [];
	const structOf = tags => {
		let parent = documentElement;
		for (const {node, role} of tags) {
			let element = structs.get(node);
			if (!element) {element = {role, kids: [], parent}; structs.set(node, element); parent.kids.push(element);}
			parent = element;
		}
		return parent === documentElement ? null : parent;
	};
	for (let index = 0; index < pages.length; index++) {
		check();
		const marked = [];
		parentTree.push(marked);
		const held = pages[index], flate = !!held?.rgb;
		const tiles = held?.tiles || [{...(flate ? held : {jpeg: held}), x: 0, y: 0, width: pixelWidth, height: pixelHeight}];
		const pictures = tiles.map((tile, at) => '/Im0_' + at + ' ' + stream('/Type /XObject /Subtype /Image /Width ' + tile.width + ' /Height ' + tile.height +
			' /ColorSpace /DeviceRGB /BitsPerComponent 8' + (tile.alpha ? ' /SMask ' + stream('/Type /XObject /Subtype /Image /Width ' + tile.width + ' /Height ' + tile.height +
				' /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode', tile.alpha) + ' 0 R' : '') +
			' /Filter /' + (tile.rgb ? 'FlateDecode' : 'DCTDecode'), tile.rgb || tile.jpeg) + ' 0 R'), states = [];
		pages[index] = null;
		const emit = (drawing, left, top, clipWidth, clipHeight) => {
			let out = `q\n.75 0 0 -.75 ${decimal(left)} ${decimal(top)} cm\n0 0 ${clipWidth} ${clipHeight} re W n\n1 0 0 1 ${decimal(drawing.x)} 0 cm\n`;
			out += [drawing.clip.x, drawing.clip.y, drawing.clip.width, drawing.clip.height].map(decimal).join(' ') + ' re W n\n';
			for (const piece of drawing.sequence) {
				if (piece.image) {
					let shared = sharedImages.get(piece.image);
					if (!shared) {
						const image = piece.image;
						const mask = stream('/Type /XObject /Subtype /Image /Width ' + image.width + ' /Height ' + image.height + ' /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode', image.alpha);
						const object = stream('/Type /XObject /Subtype /Image /Width ' + image.width + ' /Height ' + image.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask ' + mask + ' 0 R /Filter /FlateDecode', image.rgb);
						image.alpha = image.rgb = null;
						const name = '/Im' + (sharedImages.size + 1);
						shared = {name, resource: name + ' ' + object + ' 0 R'};
						sharedImages.set(piece.image, shared);
					}
					if (!pictures.includes(shared.resource)) pictures.push(shared.resource);
					out += `q\n${[piece.width, 0, 0, -piece.height, piece.x, piece.y + piece.height].map(decimal).join(' ')} cm\n${shared.name} Do\nQ\n`;
				} else {
					const state = '/Gs' + states.length;
					states.push(state + ' ' + add('<< /Type /ExtGState /ca ' + decimal(piece.fillAlpha) + ' /CA ' + decimal(piece.strokeAlpha) + ' >>') + ' 0 R');
					out += 'q\n' + state + ' gs\n' + piece.commands + 'Q\n';
				}
			}
			return out + 'Q\n';
		};
		let commands = '';
		for (const drawing of backdrop || []) commands += emit(drawing, 0, height, Math.round(width * 4 / 3), Math.round(height * 4 / 3));
		for (const drawing of vectorPages[index] || []) if (drawing.under) commands += emit(drawing, margins.left, height - margins.top, pixelWidth, pixelHeight);
		commands += '/Artifact BMC\n' + tiles.map((tile, at) => 'q\n' + [decimal(tile.width * .75), 0, 0, decimal(tile.height * .75), decimal(margins.left + tile.x * .75),
			decimal(height - margins.top - (tile.y + tile.height) * .75)].join(' ') + ' cm\n/Im0_' + at + ' Do\nQ\n').join('') + 'EMC\n';
		for (const drawing of vectorPages[index] || []) if (!drawing.under) commands += emit(drawing, margins.left, height - margins.top, pixelWidth, pixelHeight);
		const textAlphas = new Map();
		for (const run of textPages[index]) {
			if (!run.text && !run.parts?.some(part => part.font)) continue;
			const element = structOf(run.tags || []);
			if (element) {element.kids.push({page: index, mcid: marked.length}); commands += `/${element.role} << /MCID ${marked.length} >> BDC\n`; marked.push(element);}
			commands += 'q\n';
			const groups = [];
			for (const part of run.parts || [run]) {
				if (part.font && !part.unicode) continue;
				const last = groups.at(-1), previous = last?.at(-1);
				if (previous && previous.font === part.font && previous.skew === part.skew && previous.size === part.size && previous.scaleX === part.scaleX) last.push(part);
				else groups.push([part]);
			}
			for (const group of groups) {
				const actual = group.map(part => part.actual ?? part.text).join('');
				let text = `/Span << /ActualText <feff${hex(actual)}> >> BDC\nBT\n100 Tz\n`;
            const shown = group.some(part => part.font && /\p{Script=Hebrew}/u.test(part.text)) ? [...group].sort((a, b) => a.x - b.x) : group;
			for (const part of shown) {
				if (part.font) {
					const entry = part.pdfFont, value = entry.codes.get(glyphKey(part)).toString(16).padStart(part.font.type3 ? 2 : 4, '0'), alpha = decimal(part.rgba[3]);
					let state = textAlphas.get(alpha);
					if (!state) {state = '/Gs' + states.length; states.push(state + ' ' + add('<< /Type /ExtGState /ca ' + alpha + ' >>') + ' 0 R'); textAlphas.set(alpha, state);}
					text += `${state} gs\n${part.rgba.slice(0, 3).map(decimal).join(' ')} rg\n${entry.name} ${decimal(part.size * .75)} Tf\n${decimal((part.scaleX || 1) * 100)} Tz\n0 Tr\n1 0 ${decimal((part.skew || 0) * (part.scaleX || 1))} 1 ${decimal(margins.left + part.x * .75)} ${decimal(height - margins.top - part.baseline * .75)} Tm\n<${value}> Tj\n`;
				} else {
					const characters = fallbackCharacters(part, run.carrier); if (!characters.length) continue;
					const {slots, count} = _rapierPrintSlots(part.text, part.rtl);
					const advance = part.width * .75 / count;
					const baseline = decimal(height - margins.top - (part.y + part.height * .8) * .75);
					for (let letter = 0; letter < characters.length; letter++) {
						const size = Math.max(.1, advance * 2 * [...characters[letter].replace(/\n/g, '')].length), scaleY = Math.max(.1, part.height * .75) / size;
						const value = (codes.get(characters[letter]) || codes.get(characters[letter].codePointAt(0))).toString(16).padStart(4, '0');
						text += `${run.carrier ? '/Fc' : '/F1'} ${decimal(size)} Tf\n3 Tr\n1 0 0 ${decimal(scaleY)} ${decimal(margins.left + part.x * .75 + slots[letter] * advance)} ${baseline} Tm\n<${value}> Tj\n`;
					}
				}
			}
				text += 'ET\nEMC\n';
				const name = '/Tx' + pictures.length;
				const object = stream('/Type /XObject /Subtype /Form /BBox [0 0 ' + decimal(width) + ' ' + decimal(height) + '] /Resources << /Font << /F1 ' + type + ' 0 R /Fc ' + carrierType + ' 0 R ' + nativeResources.join(' ') + ' >> /ExtGState << ' + states.join(' ') + ' >> >> /Filter /FlateDecode', await compressed(encode(text)));
				pictures.push(name + ' ' + object + ' 0 R');
				commands += name + ' Do\n';
			}
			commands += 'Q\n' + (element ? 'EMC\n' : '');
		}
		if (numberFont) commands += `BT\n/F2 9 Tf\n0 Tr\n1 0 0 1 ${decimal(width / 2 - String(index + 1).length * 2.5)} ${decimal(margins.bottom / 2)} Tm\n(${index + 1}) Tj\nET\n`;
		const content = stream('/Filter /FlateDecode', await compressed(encode(commands)));
		const annotations = (linkPages[index] || []).map(link => {
			const rect = [margins.left + link.x * .75, height - margins.top - (link.y + link.height) * .75,
				margins.left + (link.x + link.width) * .75, height - margins.top - link.y * .75].map(decimal);
			const target = link.target.uri ? '/A << /S /URI /URI ' + literal(link.target.uri) + ' >>'
				: '/Dest [' + kids[link.target.page] + ' 0 R /XYZ ' + decimal(margins.left + link.target.x * .75) + ' ' + decimal(height - margins.top - link.target.y * .75) + ' null]';
			return add('<< /Type /Annot /Subtype /Link /Border [0 0 0] /Rect [' + rect.join(' ') + '] ' + target + ' >>');
		});
		put(kids[index], '<< /Type /Page /Parent 2 0 R /StructParents ' + index + ' /MediaBox [0 0 ' + decimal(width) + ' ' + decimal(height) + '] /Resources << /XObject << ' + pictures.join(' ') + ' >> /ExtGState << ' + states.join(' ') + ' >> /Font << /F1 ' + type + ' 0 R /Fc ' + carrierType + ' 0 R' + (numberFont ? ' /F2 ' + numberFont + ' 0 R' : '') + ' ' + nativeResources.join(' ') + ' >> >> /Contents ' + content + ' 0 R' + (annotations.length ? ' /Annots [' + annotations.map(id => id + ' 0 R').join(' ') + ']' : '') + ' >>');
	}
	put(2, '<< /Type /Pages /Count ' + kids.length + ' /Kids [' + kids.map(id => id + ' 0 R').join(' ') + '] >>');
	const tree = add(''), ids = new Map([[documentElement, add('')]]);
	const reserve = element => { for (const kid of element.kids) if (kid.kids) { ids.set(kid, add('')); reserve(kid); } };
	reserve(documentElement);
	for (const [element, id] of ids) put(id, '<< /Type /StructElem /S /' + element.role + ' /P ' + (element.parent ? ids.get(element.parent) : tree) + ' 0 R /K [' +
		element.kids.map(kid => kid.kids ? ids.get(kid) + ' 0 R' : '<< /Type /MCR /Pg ' + kids[kid.page] + ' 0 R /MCID ' + kid.mcid + ' >>').join(' ') + '] >>');
	const parents = add('<< /Nums [' + parentTree.map((marked, index) => index + ' [' + marked.map(element => ids.get(element) + ' 0 R').join(' ') + ']').join(' ') + '] >>');
	put(tree, '<< /Type /StructTreeRoot /K [' + ids.get(documentElement) + ' 0 R] /ParentTree ' + parents + ' 0 R /ParentTreeNextKey ' + parentTree.length + ' >>');
	put(1, '<< /Type /Catalog /Pages 2 0 R /MarkInfo << /Marked true >> /StructTreeRoot ' + tree + ' 0 R /Names << /EmbeddedFiles << /Names [<feff' + hex(filename) + '> ' + file + ' 0 R] >> >> /AF [' + file + ' 0 R] >>');
	const info = add('<< /Producer (Rapier) /Creator (Rapier) /Title <feff' + hex(title || filename.replace(/\.[^.]*$/, '')) + '> >>');
	const header = encode('%PDF-1.7\n%\u00e2\u00e3\u00cf\u00d3\n'), offsets = new Array(objects.length);
	let cursor = header.length;
	for (let id = 1; id < objects.length; id++) {
		offsets[id] = cursor;
		cursor += (id + ' 0 obj\n').length + objects[id].length + 8;
	}
	const xrefAt = cursor;
	const xref = encode('xref\n0 ' + objects.length + '\n0000000000 65535 f \n' + offsets.slice(1).map(at => String(at).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xrefAt + '\n%%EOF\n');
	if (cursor + xref.length > maxBytes) fail('export_too_large');
	const bytes = new Uint8Array(cursor + xref.length);
	bytes.set(header, 0);
	let at = header.length;
	for (let id = 1; id < objects.length; id++) {
		const prefix = encode(id + ' 0 obj\n');
		bytes.set(prefix, at); at += prefix.length;
		bytes.set(objects[id], at); at += objects[id].length;
		objects[id] = null;
		const suffix = encode('\nendobj\n');
		bytes.set(suffix, at); at += suffix.length;
	}
	bytes.set(xref, at);
	return bytes;
}
export {createPrintRenderer, applyPrintCapitals, RAPIER_WILL_SENTINEL_MARK as sentinel};
