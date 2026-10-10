// SPDX-License-Identifier: MIT
const RAPIER_WILL_SENTINEL_MARK = '⁣';
// SPDX-License-Identifier: MIT
// The document's renderer. DOM, codecs and host state are explicit inputs.
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

const _rapierWillStripOneTerminator = globalThis.RapierAgentWill.stripOneTerminator;



function _rapierPrintWillAdmit(canonical, plan) {
	const quoted = globalThis.RapierMarkdownSpec.quotedWillSpan(canonical, _rapierWillParse(canonical).blocks.map(block => [block.start, block.end]));
	if (quoted && quoted.where === 'frontmatter') throw _rapierPrintWillLost('a marker stands in the front matter, which is not on the printed page', 'Take it out of the front matter');
	if (quoted) throw _rapierPrintWillLost('a marker stands inside other content, where a reader of the PDF\'s text could not tell it from a carried marker', 'Take the quoted marker out');
	for (const marker of plan.markers) {
		const bad = /[\u0000\u0009\u000a\u000c\u000d\u1df8\u202b]/.exec(marker);
		if (bad) throw _rapierPrintWillLost('U+' + bad[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0') + ' in a marker cannot be read back from a PDF', 'Take it out of the marker');
	}
	if (new Set(plan.markers.flatMap(marker => Array.from(marker))).size > 65000) throw _rapierPrintWillLost('the markers use more distinct characters than a font can hold', 'Shorten them');
}

function _rapierPrintWillFont(markers) {
	const { size, advance } = _rapierPrintWillMetrics(markers);
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
	const outline = cat(u16(1), u16(0), u16(-2), u16(10), u16(2), u16(2), u16(0), [1, 1, 1], u16(0), u16(10), u16(-5), u16(-2), u16(4), u16(-2), [0]);
	const utf16 = text => Array.from(text, ch => u16(ch.charCodeAt(0)));
	const names = [[1, 'RapierWill'], [2, 'Regular'], [4, 'RapierWill Regular'], [6, 'RapierWill-Regular']];
	let offset = 0;
	const tables = {
		'OS/2': cat(u16(4), u16(advance), u16(400), u16(5), u16(0), u16(650), u16(600), u16(0), u16(75), u16(650), u16(600), u16(0), u16(350),
			u16(50), u16(300), u16(0), new Array(10).fill(0), u32(0), u32(0), u32(0), u32(0), [78, 79, 78, 69], u16(0x40),
			u16(order.find(code => code < 0xffff) || 0x20), u16(order.filter(code => code < 0xffff).pop() || 0x20), u16(500), u16(-500), u16(0),
			u16(500), u16(500), u32(1), u32(0), u16(500), u16(700), u16(0), u16(32), u16(0)),
		cmap,
		glyf: Array.from({ length: count }, () => outline).flat(),
		head: cat(u32(0x00010000), u32(0x00010000), u32(0), u32(0x5f0f3cf5), u16(1), u16(1000), new Array(16).fill(0), u16(0), u16(-2), u16(10), u16(2),
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
	return { family: 'RapierWillCarrier', bytes: Uint8Array.from(file), size, codes: order };
}

function _rapierPrintWillMetrics(markers) {
	const size = 2, natural = 200, line = 216;
	const longest = markers.reduce((most, marker) => Math.max(most, Array.from(marker).length), 1);
	return { size, advance: Math.max(1, Math.min(natural, Math.floor(line * 1000 / (longest * size)))) };
}

function _rapierPrintWillPlace(root, plan) {
	// A marker the page holds inside other content (a code block, say) is quoted text, which a reader of the PDF's text could not tell from a carried marker.
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
		+ 'white-space:pre;text-align:left;text-indent:0;text-transform:none;text-shadow:none;letter-spacing:0;word-spacing:0;hyphens:none;'
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
		// A rule's own top margin is a line of the sheet's (none at the head of the page, where the sheet takes it off the first child): it
		// moves to the run, so the gap the rule makes with the block above is the one it made.
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

// The capture's own limits (agent/visual.mjs VISUAL_LIMITS): the longest edge and the most pixels one capture returns.
const CAPTURE_EDGE = 4096, CAPTURE_PIXELS = 4 * 1024 * 1024;

async function _rapierWritePrintPdf({root, css, canonical, filename, title, settings}, {capture, signal, current, maxBytes = 8 * 1024 * 1024} = {}) {
	const refuse = code => { throw Object.assign(new Error(code), {code}); };
	const check = () => {
		if (signal?.aborted) refuse('cancelled');
		if (current?.() === false) refuse('document_changed');
	};
	if (!root?.ownerDocument || typeof capture !== 'function') refuse('pdf_render_unavailable');
	// The native printer chooses its default paper. A file made without a printer uses A4,
	// with the same explicit document settings and default margins as the print artifact.
	const paper = settings?.papersize || {width: 11906, height: 16838};
	const width = paper.width / 20, height = paper.height / 20;
	const margin = settings?.geometry ? settings.geometry.twips / 20 : null;
	const margins = {top: margin ?? 12 * 72 / 25.4, right: margin ?? 14 * 72 / 25.4,
		bottom: margin ?? 14 * 72 / 25.4, left: margin ?? 14 * 72 / 25.4};
	const bodyWidth = Math.floor((width - margins.left - margins.right) * 4 / 3);
	const bodyHeight = Math.floor((height - margins.top - margins.bottom) * 4 / 3);
	if (bodyWidth < 1 || bodyHeight < 1 || bodyWidth * bodyHeight > 4 * 1024 * 1024) refuse('pdf_page_geometry_invalid');
	const frame = document.createElement('iframe');
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
		into.documentElement.setAttribute('data-rapier-theme', 'light');
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
		// A file for paper is light whatever the person's own scheme: the page's text takes its colour scheme from this attribute.
		main.setAttribute('data-md-theme', 'light');
		for (const details of main.querySelectorAll('details')) details.open = true;
		main.getBoundingClientRect();
		await step(into.fonts.ready);
		for (const image of main.querySelectorAll('img')) { image.loading = 'eager'; await step(image.decode()); }
		check();
		// The print sheet owns the words and styles. CSS fragmentation supplies the file's
		// pages without a print dialog; its break constraints become column constraints here.
		for (const node of [main, ...main.querySelectorAll('*')]) {
			const style = into.defaultView.getComputedStyle(node);
			for (const name of ['break-before', 'break-after', 'break-inside']) {
				const value = style.getPropertyValue(name);
				if (value.includes('page')) node.style.setProperty(name, value.replace('page', 'column'), 'important');
			}
		}
		for (const [name, value] of Object.entries({width: bodyWidth + 'px', height: bodyHeight + 'px',
			'max-width': 'none', 'min-height': '0', padding: '0', margin: '0', overflow: 'visible',
			'column-width': bodyWidth + 'px', 'column-gap': '0', 'column-count': 'auto', 'column-fill': 'auto'}))
			main.style.setProperty(name, value, 'important');
		globalThis.RapierMath?.fit(main);
		const count = Math.max(1, Math.ceil((main.scrollWidth - 1) / bodyWidth));
		if (!Number.isSafeInteger(count)) refuse('pdf_page_geometry_invalid');
		const textPages = await _rapierPrintTextPages(main, bodyWidth, count, check);
		const text = textPages.flatMap(page => page.map(run => run.text));
		const glyphs = new Set();
		for (const line of text) for (const character of line) {
			glyphs.add(character);
			if (glyphs.size > 65000) refuse('pdf_text_glyph_limit');
		}
		const font = _rapierPrintWillFont(text);
		strip.style.width = count * bodyWidth + 'px';
		// A capture costs the whole document, however little of it the clip takes, so the pages that carry no picture share captures: as many to one
		// as the capture's own limits allow, fewer when the capture refuses its size. A page with a picture is captured alone, so the picture keeps
		// the capture's byte limit to itself.
		let share = main.querySelector('img,svg,canvas,video,picture') ? 1
			: Math.max(1, Math.min(Math.floor(CAPTURE_EDGE / bodyWidth), Math.floor(CAPTURE_PIXELS / (bodyWidth * bodyHeight))));
		const pages = [];
		let imageBytes = 0;
		for (let first = 0; first < count;) {
			check();
			const span = Math.min(share, count - first);
			surface.style.width = span * bodyWidth + 'px';
			strip.style.transform = `translateX(${-first * bodyWidth}px)`;
			let captured;
			try { captured = await capture({root: surface, clip: {x: 0, y: 0, width: span * bodyWidth, height: bodyHeight}, signal, current}); }
			catch (error) {
				if (error?.code === 'visual_too_large' && span > 1) { share = Math.ceil(span / 2); continue; }
				throw error;
			}
			check();
			const image = new into.defaultView.Image();
			image.src = 'data:' + captured.mimeType + ';base64,' + captured.data;
			try {
				await step(image.decode());
				for (let offset = 0; offset < span; offset++) {
					const canvas = into.createElement('canvas'); canvas.width = bodyWidth; canvas.height = bodyHeight;
					try {
						const context = canvas.getContext('2d', {alpha: false});
						if (!context) refuse('pdf_render_unavailable');
						context.fillStyle = '#fff'; context.fillRect(0, 0, bodyWidth, bodyHeight);
						context.drawImage(image, offset * bodyWidth, 0, bodyWidth, bodyHeight, 0, 0, bodyWidth, bodyHeight);
						const blob = await step(new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95)));
						if (!blob) refuse('pdf_render_unavailable');
						imageBytes += blob.size;
						if (imageBytes > maxBytes) refuse('export_too_large');
						pages.push(new Uint8Array(await blob.arrayBuffer()));
					} finally { canvas.width = canvas.height = 0; }
				}
			} finally { image.src = ''; }
			first += span;
		}
		check();
		const bytes = await writeRasterPdf({pages, textPages, canonical, filename, title, font, width, height, margins,
			pixelWidth: bodyWidth, pixelHeight: bodyHeight, pageNumbers: settings?.pagestyle === 'plain', maxBytes, check});
		check();
		return {bytes, pages: count};
	} finally { signal?.removeEventListener('abort', abort); frame.remove(); }
}

// Ranges locate the actual text fragments after column layout. Splitting a text node at
// its line and page boundaries keeps a PDF search on the page that carries those words.
async function _rapierPrintTextPages(main, pageWidth, count, check) {
	const into = main.ownerDocument, origin = main.getBoundingClientRect();
	const pages = Array.from({length: count}, () => []);
	// The renderer's outlines have no text ranges. Read each equation's exact TeX
	// alternative at its SVG box, and reject its subtree so titles cannot duplicate it.
	const walker = into.createTreeWalker(main, 5, {acceptNode(node) {
		if (node.parentElement?.closest('.math-rendered svg[aria-label]')) return 2;
		return node.nodeType === 3 || node.matches('.math-rendered svg[aria-label]') ? 1 : 3;
	}});
	const range = into.createRange();
	const pageOf = x => Math.max(0, Math.min(count - 1, Math.floor((x - origin.left + .01) / pageWidth)));
	let nodes = 0, operations = 0;
	for (let node; (node = walker.nextNode());) {
		if (++nodes % 128 === 0) { await new Promise(resolve => setTimeout(resolve, 0)); check(); }
		const math = node.nodeType === 1;
		const style = into.defaultView.getComputedStyle(math ? node : node.parentElement);
		if (style.visibility === 'hidden' || style.visibility === 'collapse') continue;
		if (math) {
			const rect = node.getBoundingClientRect(), text = node.getAttribute('aria-label');
			if (rect.width > 0 && rect.height > 0 && text) {
				const page = pageOf(rect.left);
				pages[page].push({text, x: rect.left - origin.left - page * pageWidth, y: rect.top - origin.top,
					width: rect.width, height: rect.height, math: true});
			}
			continue;
		}
		const preserve = /pre|break-spaces/.test(style.whiteSpace);
		const block = node.parentElement.closest('p,h1,h2,h3,h4,h5,h6,li,pre,td,th,figcaption,blockquote,.rapier-will-carrier') || node.parentElement;
		const carrier = node.parentElement.closest('.rapier-will-carrier');
		const value = node.data;
		const visit = (start, end) => {
			if (++operations % 128 === 0) check();
			range.setStart(node, start); range.setEnd(node, end);
			const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
			if (!rects.length) return;
			const first = rects[0], page = pageOf(first.left);
			const oneLine = rects.every(rect => pageOf(rect.left) === page && pageOf(rect.right - .02) === page && Math.abs(rect.top - first.top) < .5);
			let middle = Math.floor((start + end) / 2);
			if (middle > start && /[\uD800-\uDBFF]/.test(value[middle - 1]) && /[\uDC00-\uDFFF]/.test(value[middle])) middle--;
			if (!oneLine && middle > start && middle < end) { visit(start, middle); visit(middle, end); return; }
			let text = value.slice(start, end);
			text = preserve ? text.replace(/\r\n?|\n/g, '') : text.replace(/[ \t\r\n\f]+/g, ' ');
			if (!text) return;
			const x = Math.min(...rects.map(rect => rect.left)) - origin.left - page * pageWidth;
			const y = Math.min(...rects.map(rect => rect.top)) - origin.top;
			const right = Math.max(...rects.map(rect => rect.right)) - origin.left - page * pageWidth;
			const bottom = Math.max(...rects.map(rect => rect.bottom)) - origin.top;
			const last = pages[page].at(-1);
			if (last && !last.math && last.block === block && last.carrier === carrier && Math.abs(last.y - y) < Math.max(2, Math.min(last.height, bottom - y) * .2)) {
				last.text = preserve ? last.text + text : (last.text + text).replace(/[ \t\r\n\f]+/g, ' ');
				last.width = Math.max(last.x + last.width, right) - Math.min(last.x, x);
				last.height = Math.max(last.y + last.height, bottom) - Math.min(last.y, y);
				last.x = Math.min(last.x, x); last.y = Math.min(last.y, y);
			} else pages[page].push({text, x, y, width: right - x, height: bottom - y, block, carrier});
		};
		visit(0, value.length);
	}
	check();
	return pages.map(page => page.map(({block, carrier, ...run}) => run));
}

  return {_rapierWillSentinelPlan, _rapierPrintWillAdmit, _rapierPrintWillFont, _rapierPrintWillMetrics, _rapierPrintWillPlace, _rapierPrintWillLost, _rapierPrintWillPageCss, _rapierWritePrintPdf};
}

// A standard PDF page tree, image streams, Unicode text and an associated source file.
// It accepts already-rendered pages, so there is no second document grammar or layout engine.
async function writeRasterPdf({pages, textPages, canonical, filename, title, font, width, height, margins, pixelWidth, pixelHeight, pageNumbers, maxBytes, check}) {
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
	const source = encoder.encode(canonical);
	const embedded = stream('/Type /EmbeddedFile /Subtype /text#2Fplain /Params <</Size ' + source.length + '>> /Filter /FlateDecode', await compressed(source));
	const file = add('<< /Type /Filespec /F ' + literal(String(filename).replace(/[^\x20-\x7e]/g, '_')) + ' /UF <feff' + hex(filename) + '> /AFRelationship /Source /EF << /F ' + embedded + ' 0 R /UF ' + embedded + ' 0 R >> >>');
	const codes = new Map(font.codes.map((code, index) => [code, index + 1]));
	const rows = font.codes.map((code, index) => '<' + (index + 1).toString(16).padStart(4, '0') + '> <' + hex(String.fromCodePoint(code)) + '>');
	let cmap = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /RapierText def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <ffff>\nendcodespacerange\n';
	for (let at = 0; at < rows.length; at += 100) cmap += Math.min(100, rows.length - at) + ' beginbfchar\n' + rows.slice(at, at + 100).join('\n') + '\nendbfchar\n';
	cmap += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
	const mapping = stream('/Filter /FlateDecode', await compressed(encode(cmap)));
	const fontFile = stream('/Length1 ' + font.bytes.length + ' /Filter /FlateDecode', await compressed(font.bytes));
	const descriptor = add('<< /Type /FontDescriptor /FontName /RapierText /Flags 4 /FontBBox [0 -2 10 2] /ItalicAngle 0 /Ascent 500 /Descent -500 /CapHeight 500 /StemV 80 /FontFile2 ' + fontFile + ' 0 R >>');
	const descendant = add('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /RapierText /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ' + descriptor + ' 0 R /DW 500 /CIDToGIDMap /Identity >>');
	const type = add('<< /Type /Font /Subtype /Type0 /BaseFont /RapierText /Encoding /Identity-H /DescendantFonts [' + descendant + ' 0 R] /ToUnicode ' + mapping + ' 0 R >>');
	const numberFont = pageNumbers ? add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>') : null;
	const kids = [], decimal = value => Number(value.toFixed(4));
	for (let index = 0; index < pages.length; index++) {
		check();
		const picture = stream('/Type /XObject /Subtype /Image /Width ' + pixelWidth + ' /Height ' + pixelHeight + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode', pages[index]);
		let commands = 'q\n' + [decimal(pixelWidth * .75), 0, 0, decimal(pixelHeight * .75), decimal(margins.left), decimal(height - margins.top - pixelHeight * .75)].join(' ') + ' cm\n/Im0 Do\nQ\n';
		for (const run of textPages[index]) {
			const characters = Array.from(run.text);
			const value = characters.map(character => codes.get(character.codePointAt(0)).toString(16).padStart(4, '0')).join('');
			const size = Math.max(.1, run.height * .75);
			const scale = run.width * .75 / (characters.length * size * .5) * 100;
			if (run.math) commands += '/Span << /ActualText <feff' + hex(run.text) + '> >> BDC\n';
			commands += `BT\n/F1 ${decimal(size)} Tf\n${decimal(scale)} Tz\n3 Tr\n1 0 0 1 ${decimal(margins.left + run.x * .75)} ${decimal(height - margins.top - (run.y + run.height * .8) * .75)} Tm\n<${value}> Tj\nET\n`;
			if (run.math) commands += 'EMC\n';
		}
		if (numberFont) commands += `BT\n/F2 9 Tf\n0 Tr\n1 0 0 1 ${decimal(width / 2 - String(index + 1).length * 2.5)} ${decimal(margins.bottom / 2)} Tm\n(${index + 1}) Tj\nET\n`;
		const content = stream('/Filter /FlateDecode', await compressed(encode(commands)));
		kids.push(add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + decimal(width) + ' ' + decimal(height) + '] /Resources << /XObject << /Im0 ' + picture + ' 0 R >> /Font << /F1 ' + type + ' 0 R' + (numberFont ? ' /F2 ' + numberFont + ' 0 R' : '') + ' >> >> /Contents ' + content + ' 0 R >>'));
	}
	put(2, '<< /Type /Pages /Count ' + kids.length + ' /Kids [' + kids.map(id => id + ' 0 R').join(' ') + '] >>');
	put(1, '<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles << /Names [<feff' + hex(filename) + '> ' + file + ' 0 R] >> >> /AF [' + file + ' 0 R] >>');
	const info = add('<< /Producer (Rapier) /Title <feff' + hex(title || filename.replace(/\.[^.]*$/, '')) + '> >>');
	const parts = [encode('%PDF-1.7\n%\u00e2\u00e3\u00cf\u00d3\n')], offsets = [0];
	let length = parts[0].length;
	for (let id = 1; id < objects.length; id++) {
		offsets.push(length);
		const body = concat([encode(id + ' 0 obj\n'), objects[id], encode('\nendobj\n')]); parts.push(body); length += body.length;
	}
	const xref = length;
	parts.push(encode('xref\n0 ' + objects.length + '\n0000000000 65535 f \n' + offsets.slice(1).map(at => String(at).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n'));
	const bytes = concat(parts); if (bytes.length > maxBytes) fail('export_too_large'); return bytes;
}
export {createPrintRenderer, RAPIER_WILL_SENTINEL_MARK as sentinel};
