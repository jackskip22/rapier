// SPDX-License-Identifier: MIT
import {markdownParser, installMarkdownImages, normalizeLabel} from './md-assets.mjs';
import {splitOpeningFrontmatter} from './frontmatter.mjs';
import {readDocumentSettings, documentFont} from './document-settings.mjs';
import {normalizeFontFamily, fontFamilyCss, FONT_STACKS, typography} from './md-marks.mjs';

export const CSS_GENERIC_FONT_FAMILIES = Object.freeze(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
  'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', 'initial', 'revert', 'revert-layer']);

export function fontDataUrl(url) {
	if (typeof url !== 'string') return null;
	const match = /^data:font\/(woff2|woff|ttf|otf);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(url);
	if (!match || match[2].length % 4) return null;
	const padding = match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0;
	const byteLength = match[2].length / 4 * 3 - padding;
	return byteLength >= 12 ? {format: match[1].toLowerCase(), byteLength, data: match[2]} : null;
}

function parserFor(parser) {
	const md = installMarkdownImages(markdownParser(parser));
	if (!md.__rapierFontsInstalled) {
		const validate = md.validateLink;
		md.validateLink = url => !!fontDataUrl(url) || validate(url);
		md.__rapierFontsInstalled = true;
	}
	return md;
}

function faceOf(value) {
	const family = normalizeFontFamily(value?.family), style = value?.style || 'normal';
	const weight = value?.weight ?? 400, stretch = value?.stretch ?? 100;
	if (!family || !['normal', 'italic', 'oblique'].includes(style) || !Number.isFinite(weight) || weight < 1 || weight > 1000 ||
		!Number.isFinite(stretch) || stretch <= 0 || stretch > 1000) return null;
	const result = {family, style, weight, stretch};
	if (value.weightRange != null) {
		const range = value.weightRange;
		if (!Array.isArray(range) || range.length !== 2 || range.some(number => !Number.isFinite(number) || number < 1 || number > 1000) || range[0] > range[1]) return null;
		result.weightRange = range.slice();
	}
	if (value.axes != null) {
		if (!Array.isArray(value.axes) || value.axes.length > 64) return null;
		const seen = new Set(), axes = [];
		for (const axis of value.axes) {
			if (!axis || !/^[ -~]{4}$/.test(axis.tag) || seen.has(axis.tag) ||
				![axis.min, axis.default, axis.max].every(Number.isFinite) || axis.min > axis.default || axis.default > axis.max) return null;
			seen.add(axis.tag);
			axes.push({tag: axis.tag, min: axis.min, default: axis.default, max: axis.max, ...(typeof axis.name === 'string' ? {name: axis.name} : {})});
		}
		if (axes.length) result.axes = axes;
	}
	if (value.sourceId != null) {
		if (!/^f[0-9a-f]{24}$/.test(value.sourceId)) return null;
		result.sourceId = value.sourceId;
	}
	return result;
}

export function fontAssetKey(font) {
	const face = faceOf(font);
	if (!face) return '';
	return [face.family.toLowerCase(), face.style, face.weight, face.stretch,
		(face.axes || []).map(axis => [axis.tag, axis.min, axis.max].join(':')).sort().join(',')].join('/');
}

export function readFontAssets(markdown, parser) {
	const source = String(markdown ?? ''), assets = [], blocks = [], refused = [];
	if (!/\[font:/i.test(source)) return {assets, blocks, refused, references: Object.create(null)};
	const md = parserFor(parser), frame = splitOpeningFrontmatter(source), env = {}, tokens = [], starts = [frame.bodyOffset];
	for (let at = frame.bodyOffset; at < source.length; at++) {
		if (source[at] === '\r') { if (source[at + 1] === '\n') at++; starts.push(at + 1); }
		else if (source[at] === '\n') starts.push(at + 1);
	}
	md.block.parse(frame.body.replace(/\r\n?/g, '\n').replace(/\0/g, '\ufffd'), md, env, tokens);
	const labels = new Set(), faces = new Set();
	for (const token of tokens) {
		if (token.type !== 'reference_definition' || !token.map) continue;
		const id = token.meta.label, first = !labels.has(id);
		labels.add(id);
		const definition = token.meta.mdImageDefinition || env.references?.[id];
		const url = definition?.href, data = fontDataUrl(url);
		if (!/^FONT:/i.test(id)) continue;
		const start = starts[token.map[0]], next = starts[token.map[1]] ?? source.length;
		let end = next;
		if (source[end - 1] === '\n') end--;
		if (source[end - 1] === '\r') end--;
		const raw = source.slice(start, end), match = /^[ \t]{0,3}\[((?:\\.|[^\]\\\r\n])+)\]:/.exec(raw);
		if (!match) continue;
		const label = md.utils.unescapeAll(match[1]);
		if (!data) { refused.push({name: label, reason: 'The font reference must contain an embedded font.'}); continue; }
		let metadata = {family: label.slice(5)};
		if (definition.title) {
			try { metadata = JSON.parse(definition.title); }
			catch (_) { refused.push({name: label, reason: 'The font reference has invalid metadata.'}); continue; }
		}
		const face = faceOf(metadata);
		if (!face) { refused.push({name: label, reason: 'The font reference has invalid metadata.'}); continue; }
		const key = fontAssetKey(face), active = first && !faces.has(key);
		const row = {...face, ...data, url, label, id, key, source: raw, start, end, next, active, topLevel: token.level === 0};
		blocks.push(row);
		if (active) { assets.push(row); faces.add(key); }
	}
	return {assets, blocks, refused, references: env.references || Object.create(null)};
}

function fontLabel(face) {
	const variants = face.style !== 'normal' || face.weight !== 400 || face.stretch !== 100 || face.axes?.length;
	return 'font:' + face.family + (variants ? '/' + face.style + '/' + face.weight + (face.stretch !== 100 ? '/' + face.stretch : '')
		+ (face.axes?.length ? '/' + face.axes.map(axis => axis.tag + '=' + axis.min + ':' + axis.max).join(',') : '') : '');
}

export function serializeFontAsset(asset, label = null) {
	const face = faceOf(asset), data = fontDataUrl(asset?.url);
	if (!face || !data) throw new TypeError('font: use an embedded font with valid family metadata');
	const escaped = escapeFontLabel(label || fontLabel(face));
	const title = JSON.stringify(face).replace(/&/g, '&amp;').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
	return '[' + escaped + ']: ' + asset.url + ' "' + title + '"';
}

function escapeFontLabel(label) {
	return String(label).replace(/[\\[\]]/g, '\\$&').replace(/&/g, '&amp;');
}

export function writeFontAssets(markdown, assets, parser) {
	const source = String(markdown ?? ''), md = parserFor(parser), index = readFontAssets(source, md), wanted = new Map();
	for (const asset of assets || []) {
		const key = fontAssetKey(asset);
		if (!key || !fontDataUrl(asset?.url)) throw new TypeError('font: invalid embedded asset');
		if (wanted.has(key) && wanted.get(key).url !== asset.url) throw new TypeError('font: one file owns each family face');
		wanted.set(key, asset);
	}
	const edits = [], consumed = new Set(), labels = new Set(Object.keys(index.references));
	const retired = index.assets.filter(row => !wanted.has(row.key));
	for (const row of index.blocks) {
		if (!row.active) {
			if (retired.some(active => active.key === row.key || active.id === row.id)) edits.push({start: row.start, end: row.next, text: ''});
			continue;
		}
		const asset = wanted.get(row.key);
		if (!asset) { edits.push({start: row.start, end: row.next, text: ''}); continue; }
		consumed.add(row.key);
		if (asset.url === row.url && JSON.stringify(faceOf(asset)) === JSON.stringify(faceOf(row))) continue;
		edits.push({start: row.start, end: row.end, text: serializeFontAsset(asset, row.label)});
	}
	let result = source;
	for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
	const pending = [];
	for (const [key, asset] of wanted) {
		if (consumed.has(key)) continue;
		const base = fontLabel(faceOf(asset));
		let label = base, suffix = 2;
		while (labels.has(normalizeLabel(escapeFontLabel(label)))) label = base + '/' + suffix++;
		labels.add(normalizeLabel(escapeFontLabel(label)));
		pending.push(serializeFontAsset(asset, label));
	}
	if (pending.length) {
		const eol = /\r\n|\r|\n/.exec(source)?.[0] || '\n';
		result += (result ? (/(?:\r\n|\r(?!\n)|\n)[ \t]*(?:\r\n|\r(?!\n)|\n)$/.test(result) ? '' : /[\r\n]$/.test(result) ? eol : eol + eol) : '') + pending.join(eol) + eol;
		const written = readFontAssets(result, md).assets;
		for (const [key, asset] of wanted) if (!written.some(row => row.key === key && row.url === asset.url)) throw new Error('font: close the code or HTML block before embedding a font');
	}
	return result;
}

export function documentFontsCss(assets) {
	const rules = [];
	for (const asset of assets || []) {
		const face = faceOf(asset);
		if (!face || !fontDataUrl(asset?.url)) continue;
		const weight = face.axes?.find(axis => axis.tag === 'wght');
		const width = face.axes?.find(axis => axis.tag === 'wdth');
		const range = weight ? [weight.min, weight.max] : face.weightRange || [face.weight, face.weight];
		const weightCss = range[0] === range[1] ? String(range[0]) : range.join(' ');
		const stretchCss = width ? width.min + '% ' + width.max + '%' : face.stretch + '%';
		rules.push('@font-face{font-family:' + fontFamilyCss(face.family) + ';font-style:' + face.style + ';font-weight:' + weightCss +
			';font-stretch:' + stretchCss + ';src:url("' + asset.url + '");font-display:swap}');
	}
	return rules.join('');
}

function htmlFontFamilies(html, md) {
	const families = new Set();
	const decode = value => md.utils.unescapeAll(value.replace(/\\/g, '\\\\'));
	for (const tag of html.matchAll(/<[A-Za-z][A-Za-z0-9:-]*(?:"[^"]*"|'[^']*'|[^'">])*>/g)) {
		for (const attr of tag[0].matchAll(/\s(data-md-font|style)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
			const value = decode(attr[2] ?? attr[3] ?? attr[4]), names = [];
			if (/^<span(?=[\s>])/i.test(tag[0])) {
				const family = attr[1].toLowerCase() === 'style' ? typography.parseStyle(value).family : null;
				if (family?.custom) families.add(family.name);
				continue;
			}
			if (attr[1].toLowerCase() === 'data-md-font') names.push(value);
			else for (const declared of value.matchAll(/(?:^|;)\s*font-family\s*:\s*((?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^;])*)/gi)) {
				const match = /^\s*(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|([^,!]+))/.exec(declared[1]);
				if (!match) continue;
				const name = (match[1] ?? match[2] ?? match[3]).replace(/\\(?:([0-9a-f]{1,6})\s?|([^\r\n\f]))/gi, (_whole, hex, escaped) => {
					const code = hex ? parseInt(hex, 16) : 0;
					return hex ? code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\ufffd' : escaped;
				});
				if (match[3] != null && CSS_GENERIC_FONT_FAMILIES.includes(name.trim().toLowerCase())) continue;
				names.push(name);
			}
			for (const name of names) { const family = normalizeFontFamily(name); if (family) families.add(family); }
		}
	}
	return families;
}

export function documentFontUsage(markdown, parser, defaultFont) {
	const source = String(markdown ?? ''), md = parserFor(parser), settings = readDocumentSettings(source), use = new Map();
	const family = setting => setting?.stack === 'named' ? setting.family : null;
	const inherited = defaultFont === undefined ? settings.defaultfont : documentFont(defaultFont);
	const main = family(settings.mainfont || inherited || settings.sansfont), sans = family(settings.sansfont || settings.mainfont || inherited), mono = family(settings.monofont);
	const add = (name, text) => { if (name && !Object.hasOwn(FONT_STACKS, name.toLowerCase()) && text) use.set(name, (use.get(name) || '') + text + '\n'); };
	if (!main && !sans && !mono && !source.includes('<')) return use;
	const plain = html => md.utils.unescapeAll(String(html).replace(/<!--[^]*?-->/g, '').replace(/<(script|style)\b[^>]*>[^]*?<\/\1\s*>/gi, '').replace(/<[^>]*>/g, '').replace(/\\/g, '\\\\'));
	let blockFamily = main;
	for (const token of md.parse(splitOpeningFrontmatter(source).body, {})) {
		if (token.type === 'heading_open') blockFamily = sans;
		else if (token.type === 'heading_close' || token.type === 'paragraph_open') blockFamily = main;
		else if (token.type === 'fence' && /^html(?:\s+\{[^{}]*\})?\s*$/i.test(token.info)) {
			const text = plain(token.content);
			add(blockFamily, text);
			for (const name of htmlFontFamilies(token.content, md)) add(name, text);
		}
		else if (token.type === 'fence' || token.type === 'code_block') add(mono, token.content);
		else if (token.type === 'html_block') {
			const text = plain(token.content);
			add(blockFamily, text);
			for (const name of htmlFontFamilies(token.content, md)) add(name, text);
		}
		else if (token.type === 'inline') {
			const stack = [blockFamily];
			let html = '', text = '';
			for (const child of token.children || []) {
				if (child.type === 'html_inline') html += child.content;
				if (['text', 'text_special', 'emoji', 'image', 'code_inline'].includes(child.type)) text += child.content;
				const typed = child.meta?.typography;
				if (typed && child.nesting === 1) {
					stack.push(typed.style.family ? typed.style.family.custom ? typed.style.family.name : null : stack.at(-1)); continue;
				}
				if (typed && child.nesting === -1) { if (stack.length > 1) stack.pop(); continue; }
				if (child.type === 'code_inline') add(mono, child.content);
				else if (['text', 'text_special', 'emoji', 'image'].includes(child.type)) add(stack.at(-1), child.content);
			}
			for (const name of htmlFontFamilies(html, md)) add(name, text);
		}
	}
	add(main, settings.title); add(main, settings.subtitle);
	return use;
}
