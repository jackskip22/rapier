// SPDX-License-Identifier: AGPL-3.0-only
// JavaScript is tokenized by acorn, CSS by a small scanner. A comment stays when a tool or a licence needs it.
import acorn from '../agent/vendor/acorn.mjs';

// Kept: licence and attribution text (any comment naming a licence or a port), preserved banners, and comments a tool reads.
export const KEEP = /^\/\*!|\bRAPIER_[A-Z0-9_<>]+\b|^#!|SPDX-|@license|@preserve|copyright|\(c\)\s*\d|©|licen[cs]ed? under|all rights reserved|__PURE__|__NO_SIDE_EFFECTS__|__INLINE__|__NOINLINE__|__KEY__|@ts-|eslint|jshint|istanbul|c8 ignore|[#@] source(Mapping)?URL|webpack[A-Z]|@vite-ignore|@jsx|\b(ISC|BSD|Apache|MPL|L?GPL|OFL|CC0|CC-BY|MIT)\b|\bport(ed)? (of|from)\b|licen[cs]e/i;

export const THIRD_PARTY = /(^|\/)(vendor|vendor-notices|node_modules|fonts|font-subset|mermaid|zenuml|purity-vectors)(\/|$)|(^|\/)(LICENSE|NOTICE|COPYING)[^/]*$|\.min\.(m?js|css)$/;

const lineStart = (text, at) => text.lastIndexOf('\n', at - 1) + 1;
const lineEnd = (text, at) => { const n = text.indexOf('\n', at); return n < 0 ? text.length : n; };

function removeRanges(text, ranges, preserveLines = false) {
	if (preserveLines) {
		let at = 0, out = '';
		for (const [start, end] of ranges) { out += text.slice(at, start) + text.slice(start, end).replace(/[^\r\n]/g, ' '); at = end; }
		return out + text.slice(at);
	}
	let out = '', at = 0;
	for (const [start, end] of ranges) {
		if (start < at) continue;
		const ls = lineStart(text, start), le = lineEnd(text, end);
		const before = text.slice(ls, start), after = text.slice(end, le);
		const blankBefore = !/\S/.test(before) && ls >= at, blankAfter = !/\S/.test(after);
		if (blankBefore && blankAfter) {
			out += text.slice(at, ls);
			at = le < text.length ? le + 1 : le;
			if (le >= text.length) out = out.replace(/\n$/, text.endsWith('\n') ? '\n' : '');
		} else if (blankAfter) {
			out += text.slice(at, start).replace(/[ \t]+$/, '');
			at = end;
		} else {
			out += text.slice(at, start) + (text.slice(start, end).includes('\n') ? '\n' : (/\s$/.test(before) || /^\s/.test(after) ? '' : ' '));
			at = end;
		}
	}
	return out + text.slice(at);
}

export function stripJs(text, {module = true, preserveLines = false} = {}) {
	const comments = [];
	const options = {ecmaVersion: 'latest', sourceType: module ? 'module' : 'script', allowHashBang: true, allowReturnOutsideFunction: true,
		allowAwaitOutsideFunction: true, allowImportExportEverywhere: true, allowSuperOutsideMethod: true,
		onComment: (block, body, start, end) => comments.push({block, body, start, end})};
	try { acorn.parse(text, options); }
	catch (error) {
		if (!module) throw error;
		comments.length = 0;
		acorn.parse(text, {...options, sourceType: 'script'});
	}
	const drop = comments.filter(c => !text.startsWith('#!', c.start) && !KEEP.test((c.block ? '/*' : '//') + c.body)).map(c => [c.start, c.end]);
	return removeRanges(text, drop, preserveLines);
}

export function stripCss(text, {preserveLines = false} = {}) {
	const drop = [];
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch === '"' || ch === "'") {
			for (i++; i < text.length && text[i] !== ch; i++) if (text[i] === '\\') i++;
		} else if (ch === '/' && text[i + 1] === '*') {
			const end = text.indexOf('*/', i + 2);
			if (end < 0) throw new Error('unterminated CSS comment');
			if (!KEEP.test(text.slice(i, end + 2))) drop.push([i, end + 2]);
			i = end + 1;
		}
	}
	return removeRanges(text, drop, preserveLines);
}

export function stripperFor(rel, {preserveLines = false} = {}) {
	if (THIRD_PARTY.test(rel)) return null;
	if (/\.(mjs)$/.test(rel)) return text => stripJs(text, {module: true, preserveLines});
	if (/\.(js|cjs)$/.test(rel)) return text => stripJs(text, {module: !rel.endsWith('.cjs'), preserveLines});
	if (/\.css$/.test(rel)) return text => stripCss(text, {preserveLines});
	return null;
}

export async function stripTree(root, {under = ['.'], skip = () => false} = {}) {
	const {readdir, readFile, writeFile} = await import('node:fs/promises');
	const {join, relative} = await import('node:path');
	const report = {files: 0, changed: 0, before: 0, after: 0};
	async function walk(dir) {
		for (const entry of await readdir(dir, {withFileTypes: true}).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) {
			const path = join(dir, entry.name), rel = relative(root, path).split('\\').join('/');
			if (entry.isDirectory()) { await walk(path); continue; }
			const strip = !skip(rel) && stripperFor(rel);
			if (!strip) continue;
			const text = await readFile(path, 'utf8'), out = strip(text);
			report.files++; report.before += Buffer.byteLength(text); report.after += Buffer.byteLength(out);
			if (out !== text) { report.changed++; await writeFile(path, out); }
		}
	}
	for (const dir of under) await walk(join(root, dir));
	return report;
}
