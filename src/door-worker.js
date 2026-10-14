// SPDX-License-Identifier: AGPL-3.0-only
const ORIGIN = 'https://rapier.website';
const PAGE = '/rapier.html';
const BEGIN = '<!-- RAPIER_SEO_BEGIN -->';
const END = '<!-- RAPIER_SEO_END -->';
const HEAD_WINDOW = 65536;
const WINDOW = 1024 * 1024;

export const DOORS = Object.freeze({
	'/privacy': Object.freeze({name: 'Privacy and terms', title: 'Rapier privacy and terms',
		description: 'Rapier privacy and terms: local editing, optional services, data storage and deletion.'}),
	'/commercial': Object.freeze({name: 'Commercial licence', title: 'Rapier commercial licence',
		description: 'Commercial licences for embedding Rapier in proprietary products. The editor is free under AGPL-3.0-only.'}),
	'/notes': Object.freeze({name: 'Notes', title: 'Rapier Notes: offline Markdown notes',
		description: 'Plain Markdown notes with embedded pictures, colors, pins, checklists, voice recordings and history. Import from 15+ note apps. No account.',
		image: 'og-notes.png', imageSize: [1200, 630], imageAlt: 'Rapier Notes: Markdown notes on your phone'}),
	'/draw': Object.freeze({name: 'Draw', title: 'Rapier Draw: SVG drawing and painting',
		description: 'Draw freehand, edit SVG diagrams and create typographic art. Paint with MyPaint brushes and watercolor, with artwork embedded in your Markdown file.',
		image: 'og-draw.png', imageSize: [1200, 630], imageAlt: 'Rapier Draw: draw and paint in Markdown'}),
	'/watercolor': Object.freeze({name: 'Watercolor', title: 'Rapier Watercolor: free watercolor painting online',
		description: 'Paint watercolor in your browser with flowing pigments, wet washes and textured paper. Keep transparent paintings in editable drawings. Free, no account.',
		image: 'og-watercolor.png', imageSize: [1200, 630], imageAlt: 'Blue, yellow and rose watercolor washes painted with Rapier Water',
		picture: 'watercolor-painting.png'}),
});

const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', {fatal: true});
const beginBytes = encoder.encode(BEGIN), endBytes = encoder.encode(END);
const attribute = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const text = value => String(value).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const jsonInScript = value => JSON.stringify(value).replace(/</g, '\\u003c');

function indexOf(bytes, needle, from = 0) {
	outer: for (let at = from; at <= bytes.length - needle.length; at++) {
		for (let i = 0; i < needle.length; i++) if (bytes[at + i] !== needle[i]) continue outer;
		return at;
	}
	return -1;
}

export function doorHead(head, path) {
	const door = DOORS[path];
	if (!door) return null;
	const title = /<title>([^<]*)<\/title>/.exec(head);
	const description = /<meta name="description" content="([^"]*)">/.exec(head);
	const canonical = /<link rel="canonical" href="([^"]*)">/.exec(head);
	const graph = /<script type="application\/ld\+json">[\s\S]*?<\/script>/.exec(head);
	if (!title || !description || !canonical || !graph || !head.includes(BEGIN) || !head.endsWith(END)) return null;
	const url = ORIGIN + path;
	const set = (text, pattern, replacement) => {
		if (!pattern.test(text)) throw new Error('head tag missing: ' + pattern);
		return text.replace(pattern, () => replacement);
	};
	let out = head;
	out = set(out, /<title>[^<]*<\/title>/, '<title>' + attribute(door.title) + '</title>');
	out = set(out, /<meta name="description" content="[^"]*">/, '<meta name="description" content="' + attribute(door.description) + '">');
	out = set(out, /<link rel="canonical" href="[^"]*">/, '<link rel="canonical" href="' + url + '">');
	out = set(out, /<meta property="og:title" content="[^"]*">/, '<meta property="og:title" content="' + attribute(door.title) + '">');
	out = set(out, /<meta property="og:description" content="[^"]*">/, '<meta property="og:description" content="' + attribute(door.description) + '">');
	out = set(out, /<meta property="og:url" content="[^"]*">/, '<meta property="og:url" content="' + url + '">');
	out = set(out, /<meta name="twitter:title" content="[^"]*">/, '<meta name="twitter:title" content="' + attribute(door.title) + '">');
	out = set(out, /<meta name="twitter:description" content="[^"]*">/, '<meta name="twitter:description" content="' + attribute(door.description) + '">');
	if (door.image) {
		out = set(out, /<meta property="og:image" content="[^"]*">/, '<meta property="og:image" content="' + ORIGIN + '/' + door.image + '">');
		out = set(out, /<meta property="og:image:alt" content="[^"]*">/, '<meta property="og:image:alt" content="' + attribute(door.imageAlt) + '">');
		out = set(out, /<meta property="og:image:width" content="[^"]*">/, '<meta property="og:image:width" content="' + door.imageSize[0] + '">');
		out = set(out, /<meta property="og:image:height" content="[^"]*">/, '<meta property="og:image:height" content="' + door.imageSize[1] + '">');
		out = set(out, /<meta name="twitter:image" content="[^"]*">/, '<meta name="twitter:image" content="' + ORIGIN + '/' + door.image + '">');
	}
	const data = {'@context': 'https://schema.org', '@graph': [
		{'@type': 'WebPage', '@id': url + '#webpage', url, name: door.title, description: door.description, inLanguage: 'en',
			isPartOf: {'@id': ORIGIN + '/#website'}, breadcrumb: {'@id': url + '#breadcrumb'},
			...(door.image ? {primaryImageOfPage: {'@id': url + '#image'}} : {})},
		{'@type': 'BreadcrumbList', '@id': url + '#breadcrumb', itemListElement: [
			{'@type': 'ListItem', position: 1, name: 'Rapier', item: ORIGIN + '/'},
			{'@type': 'ListItem', position: 2, name: door.name, item: url}]},
		...(door.image ? [{'@type': 'ImageObject', '@id': url + '#image', url: ORIGIN + '/' + (door.picture || door.image),
			caption: door.imageAlt}] : [])]};
	out = out.replace(graph[0], () => '<script type="application/ld+json">' + jsonInScript(data) + '</script>');
	const home = {title: text(title[1]), description: text(description[1]), canonical: text(canonical[1])};
	return out.slice(0, out.length - END.length) + '<script type="application/json" id="rapier-home-head">' + jsonInScript(home) + '</script>\n' + END;
}

function doorGuide(body, path) {
	const name = 'RAPIER_DOOR_' + path.slice(1).toUpperCase();
	const begin = '<!-- ' + name + '_BEGIN -->', end = '<!-- ' + name + '_END -->';
	const start = body.indexOf(begin), close = body.indexOf(end, start + begin.length);
	if (start < 0 || close < 0 || body.indexOf(begin, start + begin.length) >= 0 || body.indexOf(end, close + end.length) >= 0) return null;
	const template = body.slice(start + begin.length, close).trim();
	return /^<template>\s*(<section id="rapier-seo">[\s\S]*<\/section>)\s*<\/template>$/.exec(template)?.[1] ?? null;
}

export function doorPage(bytes, path) {
	if (!DOORS[path]) return bytes;
	const end = indexOf(bytes, endBytes), cut = end + endBytes.length;
	if (end < 0 || cut > HEAD_WINDOW) return bytes;
	const bodyAt = indexOf(bytes, beginBytes, cut), bodyEnd = indexOf(bytes, endBytes, bodyAt + beginBytes.length);
	const tailAt = bodyEnd + endBytes.length;
	if (bodyAt < 0 || bodyEnd < 0 || tailAt > WINDOW) return bytes;
	try {
		const head = doorHead(decoder.decode(bytes.subarray(0, cut)), path);
		const guide = doorGuide(decoder.decode(bytes.subarray(bodyAt + beginBytes.length, bodyEnd)), path);
		if (head === null || guide === null) return bytes;
		const next = encoder.encode(head), body = encoder.encode(BEGIN + '\n' + guide + '\n' + END);
		const middle = bytes.subarray(cut, bodyAt);
		const out = new Uint8Array(next.length + middle.length + body.length + bytes.length - tailAt);
		out.set(next); out.set(middle, next.length); out.set(body, next.length + middle.length);
		out.set(bytes.subarray(tailAt), next.length + middle.length + body.length);
		return out;
	} catch (_) { return bytes; }
}

function doorStream(source, path) {
	const reader = source.getReader(), marker = endBytes;
	let held = new Uint8Array(0), passing = false;
	const join = (a, b) => { const out = new Uint8Array(a.length + b.length); out.set(a, 0); out.set(b, a.length); return out; };
	return new ReadableStream({
		async pull(controller) {
			try {
				if (passing) {
					const {value, done} = await reader.read();
					if (done) controller.close(); else controller.enqueue(value);
					return;
				}
				for (;;) {
					const {value, done} = await reader.read();
					if (value) held = join(held, value);
					const headAt = indexOf(held, marker);
					const at = headAt < 0 ? -1 : indexOf(held, marker, headAt + marker.length);
					if (at >= 0 || done || held.length > WINDOW || (headAt >= 0 && headAt + marker.length > HEAD_WINDOW) || (headAt < 0 && held.length > HEAD_WINDOW)) {
						passing = true;
						const changed = at >= 0 && at + marker.length <= WINDOW ? doorPage(held, path) : held;
						if (changed.length) controller.enqueue(changed);
						held = new Uint8Array(0);
						if (done) controller.close();
						return;
					}
				}
			} catch (error) { controller.error(error); }
		},
		cancel(reason) { return reader.cancel(reason); },
	});
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		const plain = () => env.ASSETS.fetch(request);
		try {
			const method = request.method.toUpperCase();
			if (method !== 'GET' && method !== 'HEAD') return plain();
			const path = url.pathname.replace(/\/+$/, '');
			if (!DOORS[path]) return plain();
			if (url.pathname !== path) return Response.redirect(url.origin + path + url.search, 308);
			const asset = await env.ASSETS.fetch(new Request(new URL(PAGE, url), {method: 'GET', headers: {accept: 'text/html'}}));
			const encoding = asset.headers.get('content-encoding');
			if (!asset.ok || !asset.body || (encoding && encoding !== 'identity') || !/^text\/html/i.test(asset.headers.get('content-type') || '')) return plain();
			const headers = new Headers(asset.headers);
			headers.delete('content-length'); headers.delete('etag');
			return new Response(method === 'HEAD' ? null : doorStream(asset.body, path), {status: 200, headers});
		} catch (_) { return plain(); }
	},
};
