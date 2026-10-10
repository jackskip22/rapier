// SPDX-License-Identifier: MIT
import {encodeCarried, decodeCarried, writeParts, takeParts, readDocument, readBase, writeBase, takeBase} from './ledger/carried.mjs';
import {sha256} from './ledger/hash.mjs';
import {PAGE_SEED, returnAddress, returnExpiresAt} from './return-address.mjs';

const START = '<script type="text/markdown" id="rapier-document"';
const DRAWING_START = '<script type="text/plain" id="rapier-drawing"';
// The original text is a display reference: the page opens on its diff from the current document.
const END = '</script>';
// The page's search words (rapier.html's RAPIER_SEO regions: description, canonical address, previews, structured data and the plain guide
// a crawler reads) are rapier.website's own. A page that carries someone's document never claims that address or that description.
const SEARCH_WORDS = /<!-- RAPIER_SEO_BEGIN -->[\s\S]*?<!-- RAPIER_SEO_END -->\n?/g;

// One encoding, exactly reversible: no `<` before `/` or `!`, no CR, no NUL. engine.js _rapierDecodeCarried is its
// inverse.
export {encodeCarried, decodeCarried};

function safeName(name, fallback) {
	return [...String(name || fallback).replace(/[\\/\0"<>&]/g, '-')].slice(0, 256).join('').replace(/[\uD800-\uDBFF]$/, '') || fallback;
}

export function wrap(pageHtml, text, name, options) {
	if (typeof pageHtml !== 'string' || !pageHtml.includes('</body>')) throw new Error('not a Rapier page: no </body>');
	if (typeof text !== 'string') throw new Error('the document must be text');
	const saved = readDocument(text);
	text = saved.text;
	const previous = unwrap(pageHtml);
	const opts = {...saved, ...(options || {})};
	const docName = safeName(name, 'document.md');
	// `view`: the view the page opens on with the document behind it, `draw` or `notes`.
	if (opts.view != null && !['draw', 'notes'].includes(opts.view)) throw new Error('the view is draw or notes');
	const address = opts.return == null ? null : returnAddress(opts.return);
	const expiry = opts.return_expires_at == null ? null : returnExpiresAt(opts.return_expires_at);
	if (!!address !== !!expiry) throw new Error('a return needs its URL and return_expires_at from document.create_return');
	const block = START + ' data-name="' + docName + '"' + (opts.view ? ' data-view="' + opts.view + '"' : '') +
		(address ? ' data-return="' + address + '" data-return-expires-at="' + expiry + '"' : '') + '>' + encodeCarried(text) + END;
	let carriedBlocks = '\n' + writeParts(text, opts);
	if (opts.drawing != null) {
		if (typeof opts.drawing !== 'string') throw new Error('the drawing must be SVG text');
		const drawingName = safeName(opts.drawingName, 'drawing.svg');
		carriedBlocks += '\n' + DRAWING_START + ' data-name="' + drawingName + '">' + encodeCarried(opts.drawing) + END;
	}
	if ((opts.by != null || opts.at != null) && opts.base == null && previous.base == null) throw new Error('comparison attribution needs its original text');
	let baseline = previous.comparisonBase;
	if (!baseline && opts.base != null) {
		if (typeof opts.base === 'object') baseline = readBase(opts.base);
		else {
			if (typeof opts.base !== 'string') throw new Error('the base must be text');
			// A returned Share page uses its own source dialect; its original base is the same carrier.
			// Read that base before optional current-document history, which belongs to the current text.
			const carriedBase = /^\s*<!doctype html/i.test(opts.base) ? takeBase(opts.base).base : null;
			const pageBase = !carriedBase && /^\s*<!doctype html/i.test(opts.base) ? unwrap(opts.base) : null;
			const source = carriedBase ? {text: carriedBase.text} : pageBase?.text != null ? readDocument(pageBase.text) : readDocument(opts.base);
			baseline = carriedBase || pageBase?.comparisonBase || readBase({text: source.text, sha256: sha256(source.text),
				revision: source.ledger?.head.root || pageBase?.ledger?.head.root || sha256(source.text), name: safeName(opts.baseName || pageBase?.name, docName),
				by: opts.by == null ? 'Agent' : String(opts.by).trim(), at: opts.at == null ? new Date().toISOString() : String(opts.at)});
		}
	}
	// Rewrapping retains the original text, hash and revision; attribution names this comparison.
	if (baseline) baseline = readBase({...baseline, ...(opts.by != null ? {by: String(opts.by).trim()} : {}), ...(opts.at != null ? {at: String(opts.at)} : {})});
	carriedBlocks += '\n' + writeBase(text, baseline);
	// The agent seed goes after the charset (or <head>), once: a page that already carries it, wrapped again, loses its old one.
	const unseeded = previous.html.replace(SEARCH_WORDS, '').split(PAGE_SEED + '\n').join('');
	const headTag = /<meta charset[^>]*>\n?/i.exec(unseeded) || /<head[^>]*>\n?/.exec(unseeded);
	if (!headTag) throw new Error('not a Rapier page: no <head>');
	const seededAt = headTag.index + headTag[0].length;
	const stripped = unseeded.slice(0, seededAt) + PAGE_SEED + '\n' + unseeded.slice(seededAt);
	// Before Rapier's scripts: parsed before the engine boots.
	const bodyTag = /<body[^>]*>/.exec(stripped);
	if (!bodyTag) throw new Error('not a Rapier page: no <body>');
	const at = bodyTag.index + bodyTag[0].length;
	// A function, not a string: `$'`, `$&` and `` $` `` are replacement patterns.
	const titled = stripped.replace(/<title>[^<]*<\/title>/, () => '<title>' + docName.replace(/&/g, '&amp;').replace(/</g, '&lt;') + ' — Rapier</title>');
	const shift = titled.length - stripped.length;
	return titled.slice(0, at + shift) + '\n' + block + carriedBlocks + titled.slice(at + shift);
}
export function unwrap(pageHtml) {
	let html = pageHtml, text = null, name = null, view = null, address = null, expiry = null;
	const a = pageHtml.indexOf(START);
	if (a >= 0) {
		const open = pageHtml.indexOf('>', a), b = pageHtml.indexOf(END, open);
		if (open < 0 || b < 0) throw new Error('a carried document without its end');
		name = /data-name="([^"]*)"/.exec(pageHtml.slice(a, open))?.[1] ?? null;
		view = /data-view="(draw|notes)"/.exec(pageHtml.slice(a, open))?.[1] ?? null;
		const carriedReturn = /data-return="([^"]*)"/.exec(pageHtml.slice(a, open));
		if (carriedReturn) address = returnAddress(carriedReturn[1]);
		const carriedExpiry = /data-return-expires-at="([^"]*)"/.exec(pageHtml.slice(a, open));
		if (carriedExpiry) expiry = returnExpiresAt(carriedExpiry[1]);
		if (!!address !== !!expiry) throw new Error('a carried return needs its URL and return_expires_at');
		text = decodeCarried(pageHtml.slice(open + 1, b));
		html = pageHtml.slice(0, a) + pageHtml.slice(b + END.length);
		if (a > 0 && html[a - 1] === '\n') html = html.slice(0, a - 1) + html.slice(a);
	}
	let drawing = null, drawingName = null;
	const d = html.indexOf(DRAWING_START);
	if (d >= 0) {
		const open = html.indexOf('>', d), b = html.indexOf(END, open);
		if (open < 0 || b < 0) throw new Error('a carried drawing without its end');
		drawingName = /data-name="([^"]*)"/.exec(html.slice(d, open))?.[1] ?? null;
		drawing = decodeCarried(html.slice(open + 1, b));
		html = html.slice(0, d) + html.slice(b + END.length);
		if (d > 0 && html[d - 1] === '\n') html = html.slice(0, d - 1) + html.slice(d);
	}
	const carriedBase = takeBase(html); html = carriedBase.html;
	const comparisonBase = carriedBase.base;
	const parts = takeParts(html, text);
	return {...parts, text, name, view, drawing, drawingName, comparisonBase, base: comparisonBase?.text ?? null, baseName: comparisonBase?.name ?? null, baseSha256: comparisonBase?.sha256 ?? null, baseRevision: comparisonBase?.revision ?? null, by: comparisonBase?.by ?? null, at: comparisonBase?.at ?? null, return: address, return_expires_at: expiry};
}
