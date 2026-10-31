import {splitOpeningFrontmatter, frontMatterLine} from '../spec/frontmatter.mjs';
import {scanLinks, escapeLinkAttribute} from './links.mjs';

export const siblingHref = (dir, name) => dir + '/' + encodeURIComponent(name).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
export function renameSiblings(text, rows, mapping, href) {
	let out = String(text ?? ''); const seen = new Set();
	for (const row of rows.sort((a, b) => b.destStart - a.destStart)) {
		const name = mapping instanceof Map ? mapping.get(row.name) : mapping?.[row.name];
		if (!name || seen.has(row.destStart)) continue;
		seen.add(row.destStart); const to = href(name);
		out = out.slice(0, row.destStart) + (row.kind === 'html' ? escapeLinkAttribute(to) : to) + out.slice(row.destEnd);
	}
	return out;
}
function openFenceStart(text) {
	let open = null, offset = 0;
	while (offset < text.length) {
		const line = frontMatterLine(text, offset);
		const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line.text);
		if (m) {
			if (!open && !(m[1][0] === '`' && m[2].includes('`'))) open = {at: offset, mark: m[1][0], length: m[1].length};
			else if (open && m[1][0] === open.mark && m[1].length >= open.length && !m[2].trim()) open = null;
		}
		offset = line.next;
	}
	return open?.at ?? text.length;
}
export function addSiblingLinkLine(text, line) {
	const s = String(text ?? ''), eol = /\r\n|\r|\n/.exec(s)?.[0] || '\n';
	const start = splitOpeningFrontmatter(s).bodyOffset || (s[0] === '\uFEFF' ? 1 : 0);
	const head = s.slice(0, start), body = s.slice(start);
	const at = start + openFenceStart(body), before = s.slice(0, at), after = s.slice(at);
	const joined = before + (before ? (before.endsWith(eol + eol) ? '' : before.endsWith(eol) ? eol : eol + eol) : '') + line + eol + (after ? eol + after : '');
	if (scanLinks(joined).some(r => joined.slice(r.start, r.end) === line && r.start >= before.length)) return joined;
	return head + (head && !/[\r\n\uFEFF]$/.test(head) ? eol : '') + line + eol + eol + body;
}
