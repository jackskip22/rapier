#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Exact Markdown from a shared page by string scanning (markdown-standard.md, "The document as a web page"). A reference definition resolves
// only when its label is also in data-image-definitions. A duplicate <img> id refuses the page. Verify data-sha256.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const fail = message => { console.error(message); process.exit(1); };
// markdown-it's normalizeReference: trim, collapse internal whitespace, case-fold.
const normalizeReference = label => label.trim().replace(/\s+/g, ' ').toLowerCase().toUpperCase();

const htmlPath = process.argv[2], outPath = process.argv[3];
if (!htmlPath || !outPath) { console.error('usage: read-shared-page.mjs <page.html> <out.md>'); process.exit(2); }
const html = readFileSync(htmlPath, 'utf8');
const m = /<script type="text\/markdown"([^>]*)>\n?([\s\S]*?)\n?<\/script>/.exec(html);
if (!m) fail('no text/markdown carrier');
const sha = (/\bdata-sha256="([0-9a-f]{64})"/.exec(m[1]) || [])[1];
if (!sha) fail('missing data-sha256');
const ids = ((/\bdata-images="([^"]*)"/.exec(m[1]) || [])[1] || '').split(/\s+/).filter(Boolean);
const defTokens = ((/\bdata-image-definitions="([^"]*)"/.exec(m[1]) || [])[1] || '').split(/\s+/).filter(Boolean);
if (defTokens.some(t => !/^(?:[A-Za-z0-9\-_.!~*'()]|%[0-9A-Fa-f]{2})+$/.test(t))) fail('malformed data-image-definitions');
let definitions;
try { definitions = new Set(defTokens.map(decodeURIComponent)); } catch (_) { fail('malformed data-image-definitions'); }
const decode = text => text.replace(/&#35;/g, '#').replace(/&#13;/g, '\r').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
let md = m[2].replace(/&#13;/g, '\r');
// A duplicate id records null so any resolution of it is caught.
const imgs = new Map();
for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
	const id = (/\bid="([^"]*)"/.exec(tag[0]) || [])[1];
	if (!id) continue;
	const src = (/\bsrc="([^"]*)"/.exec(tag[0]) || [])[1];
	imgs.set(id, imgs.has(id) ? null : (src || null));
}
if (ids.length) {
	let broken = false;
	const id = '(' + ids.map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')';
	const src = value => { const found = imgs.get(value); if (typeof found !== 'string') { broken = true; return null; } return found; };
	const swapInline = (all, lead, value) => { const found = src(value); return found == null ? all : lead + found; };
	const swapDefinition = (all, lead, label, value) => {
		if (!definitions.has(normalizeReference(decode(label)))) return all;
		const found = src(value);
		return found == null ? all : lead + found;
	};
	md = md.replace(new RegExp('(!\\[(?:\\\\.|[^\\]\\\\])*\\]\\([ \\t]*)#' + id + '(?=[ \\t]*\\)|[ \\t]+["\'(])', 'g'), swapInline);
	md = md.replace(new RegExp('(^ {0,3}\\[((?:\\\\.|[^\\]\\\\])+)\\]:[ \\t]*)#' + id + '(?=[ \\t]*$|[ \\t]+["\'(])', 'gm'), swapDefinition);
	if (broken) fail('ambiguous <img id> in this page (duplicate ids); cannot recover Markdown safely');
}
md = decode(md);
const hash = createHash('sha256').update(Buffer.from(md, 'utf8')).digest('hex');
if (hash !== sha) fail('data-sha256 mismatch: declared ' + sha + ' got ' + hash);
writeFileSync(outPath, md);
