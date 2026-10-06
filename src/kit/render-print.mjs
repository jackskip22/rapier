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
	const outline = cat(u16(1), u16(0), u16(-2), u16(10), u16(2), u16(2), u16(0), [1, 1, 1], u16(0), u16(10), u16(-5), u16(-2), u16(4), u16(-2), [0]);
	const utf16 = text => Array.from(text, ch => u16(ch.charCodeAt(0)));
	const names = [[1, 'RapierWill'], [2, 'Regular'], [4, 'RapierWill Regular'], [6, 'RapierWill-Regular']];
	let offset = 0;
	const tables = {
		'OS/2': cat(u16(4), u16(advance), u16(400), u16(5), u16(0), u16(650), u16(600), u16(0), u16(75), u16(650), u16(600), u16(0), u16(350),
			u16(50), u16(300), u16(0), new Array(10).fill(0), u32(0), u32(0), u32(0), u32(0), [78, 79, 78, 69], u16(0x40),
			u16(order.find(code => code < 0xffff) || 0x20), u16(order.filter(code => code < 0xffff).pop() || 0x20), u16(500), u16(-500), u16(0),
			u16(500), u16(500), u32(1), u32(0), u16(500), u16(700), u16(0), u16(32), u16(0)),
		cmap: cat(u16(0), u16(2), u16(3), u16(1), u32(20), u16(3), u16(10), u32(20 + narrow.length), narrow, full),
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
	return { family: 'RapierWillCarrier', bytes: Uint8Array.from(file), size };
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

  return {_rapierWillSentinelPlan, _rapierPrintWillAdmit, _rapierPrintWillFont, _rapierPrintWillMetrics, _rapierPrintWillPlace, _rapierPrintWillLost, _rapierPrintWillPageCss};
}
export {createPrintRenderer, RAPIER_WILL_SENTINEL_MARK as sentinel};
