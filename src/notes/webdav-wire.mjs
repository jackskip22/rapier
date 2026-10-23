import {asBytes as bytes, refuse} from './provider-http.mjs';
const DAV = 'DAV:', XML = 'http://www.w3.org/XML/1998/namespace';
const XMLNS = 'http://www.w3.org/2000/xmlns/';
const te = new TextEncoder(), td = new TextDecoder('utf-8', {fatal: true});
const XML_LIMIT = 8 * 1024 * 1024, ROW_LIMIT = 20000;
const PROP = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getetag/><d:getcontentlength/></d:prop></d:propfind>';
function xmlError() { refuse('xml', 'The server returned incomplete or ambiguous WebDAV XML; no listing was accepted.'); }
function integer(value, max, code = 'config') {
	if (!Number.isSafeInteger(value) || value < 1 || value > max) refuse(code, 'The operation exceeds its configured complete-response budget.');
	return value;
}
function length(value) {
	if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) xmlError();
	return Number(value);
}
export function isStrongWebDAVETag(value) { return typeof value === 'string' && /^"[\x21\x23-\x7e\x80-\xff]*"$/.test(value); }
function validXMLChar(n) { return n === 9 || n === 10 || n === 13 || n >= 32 && n <= 0xd7ff || n >= 0xe000 && n <= 0xfffd || n >= 0x10000 && n <= 0x10ffff; }
function entities(value) {
	if (/&(?!(?:amp|lt|gt|apos|quot|#[0-9]+|#x[0-9a-fA-F]+);)/.test(value)) xmlError();
	return value.replace(/&([^;]+);/g, (_, name) => {
		const fixed = {amp: '&', lt: '<', gt: '>', apos: "'", quot: '"'};
		if (Object.hasOwn(fixed, name)) return fixed[name];
		const n = name.startsWith('#x') ? parseInt(name.slice(2), 16) : Number(name.slice(1));
		if (!validXMLChar(n)) xmlError();
		return String.fromCodePoint(n);
	});
}
export function parseWebDAVMultistatus(input, {maxBytes = XML_LIMIT, maxResponses = ROW_LIMIT, sync = false} = {}) {
	integer(maxBytes, XML_LIMIT); integer(maxResponses, ROW_LIMIT);
	let text;
	try { text = typeof input === 'string' ? input : td.decode(bytes(input)); } catch { xmlError(); }
	if (te.encode(text).length > maxBytes) refuse('too_large', 'The WebDAV listing exceeds its complete-response budget; nothing was truncated.');
	for (const ch of text) if (!validXMLChar(ch.codePointAt(0))) xmlError();
	text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
	let at = 0, root = null, nodes = 0;
	const stack = [], name = /[A-Za-z_\u00c0-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd][A-Za-z0-9_.\-\u00b7\u00c0-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]*(?::[A-Za-z_\u00c0-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd][A-Za-z0-9_.\-\u00b7\u00c0-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]*)?/y;
	const space = () => { while (/[\t\n ]/.test(text[at] || '\0')) at++; };
	const readName = () => { name.lastIndex = at; const m = name.exec(text); if (!m) xmlError(); at = name.lastIndex; return m[0]; };
	function expanded(qname, ns, attribute = false) {
		const pair = qname.split(':'), local = pair.at(-1), prefix = pair.length === 2 ? pair[0] : '';
		const uri = prefix ? ns.get(prefix) : attribute ? '' : ns.get('') || '';
		if (prefix && !uri) xmlError();
		return {uri, local};
	}
	function addText(value) {
		if (!stack.length) { if (value.trim()) xmlError(); }
		else stack.at(-1).text += value;
	}
	while (at < text.length) {
		if (text[at] !== '<') { let end = text.indexOf('<', at); if (end < 0) end = text.length; const s = text.slice(at, end); if (s.includes(']]>')) xmlError(); addText(entities(s)); at = end; continue; }
		if (text.startsWith('<!--', at)) { const end = text.indexOf('-->', at + 4); if (end < 0 || text.slice(at + 4, end).includes('--') || text[end - 1] === '-') xmlError(); at = end + 3; continue; }
		if (text.startsWith('<![CDATA[', at)) { const end = text.indexOf(']]>', at + 9); if (!stack.length || end < 0) xmlError(); addText(text.slice(at + 9, end)); at = end + 3; continue; }
		if (text.startsWith('<?', at)) {
			const end = text.indexOf('?>', at + 2); if (end < 0) xmlError();
			const pi = text.slice(at + 2, end);
			if (/^xml(?:\s|$)/i.test(pi) && (at !== 0 || !/^xml\s+version\s*=\s*(['"])1\.0\1(?:\s+encoding\s*=\s*(['"])[Uu][Tt][Ff]-8\2)?(?:\s+standalone\s*=\s*(['"])(?:yes|no)\3)?\s*$/.test(pi))) xmlError();
			if (!/^[A-Za-z_][\w.:-]*(?:\s|$)/.test(pi)) xmlError(); at = end + 2; continue;
		}
		if (text.startsWith('<!', at)) xmlError();
		if (text.startsWith('</', at)) { at += 2; const q = readName(); space(); if (text[at++] !== '>' || !stack.length || stack.pop().q !== q) xmlError(); continue; }
		at++; const q = readName(), parent = stack.at(-1), attrs = [];
		const ns = new Map(parent?.ns || [['xml', XML]]), attrNames = new Set(); let closed = false;
		while (true) {
			const before = at; space();
			if (text.startsWith('/>', at)) { closed = true; at += 2; break; }
			if (text[at] === '>') { at++; break; }
			if (before === at || attrs.length >= 64) xmlError();
			const a = readName(); if (attrNames.has(a)) xmlError(); attrNames.add(a); space(); if (text[at++] !== '=') xmlError(); space();
			const quote = text[at++]; if (quote !== '"' && quote !== "'") xmlError(); const end = text.indexOf(quote, at); if (end < 0) xmlError();
			const raw = text.slice(at, end); if (raw.includes('<')) xmlError(); const value = entities(raw.replace(/[\t\n]/g, ' ')); at = end + 1; attrs.push([a, value]);
			if (a === 'xmlns' || a.startsWith('xmlns:')) {
				const prefix = a === 'xmlns' ? '' : a.slice(6);
				if (prefix === 'xmlns' || value === XMLNS || prefix === 'xml' && value !== XML || prefix !== 'xml' && value === XML || prefix && !value) xmlError(); ns.set(prefix, value);
			}
		}
		const seenAttrs = new Set();
		for (const [a] of attrs) if (a !== 'xmlns' && !a.startsWith('xmlns:')) { const x = expanded(a, ns, true), id = x.uri + '\0' + x.local; if (seenAttrs.has(id)) xmlError(); seenAttrs.add(id); if (x.uri === XML && x.local === 'base') xmlError(); }
		const node = {q, ...expanded(q, ns), ns, children: [], text: ''};
		if (++nodes > 150000 || stack.length >= 64) xmlError();
		if (parent) parent.children.push(node); else { if (root) xmlError(); root = node; }
		if (!closed) stack.push(node);
	}
	if (stack.length || !root || root.uri !== DAV || root.local !== 'multistatus' || root.text.trim()) xmlError();
	const children = (n, local) => n.children.filter(c => c.uri === DAV && c.local === local);
	const one = (n, local, required = false) => { const found = children(n, local); if (found.length > 1 || required && !found.length) xmlError(); return found[0]; };
	const scalar = n => { if (n.children.length) xmlError(); return n.text.trim(); };
	const status = n => { const m = /^HTTP\/\d+(?:\.\d+)?[ \t]+([1-5]\d\d)(?:[ \t]+[^\r\n]*)?$/.exec(scalar(n)); if (!m) xmlError(); return Number(m[1]); };
	const responses = children(root, 'response'); if (!sync && !responses.length || responses.length > maxResponses) xmlError();
	const rows = responses.map(response => {
		if (response.text.trim()) xmlError();
		const href = scalar(one(response, 'href', true)); if (!href) xmlError();
		const directStatus = one(response, 'status'), propstats = children(response, 'propstat');
		if (!!directStatus === !!propstats.length) xmlError();
		const row = {href, status: directStatus ? status(directStatus) : 200, collection: null, etag: null, size: null};
		let successes = 0; const seen = new Set(), failures = [];
		for (const ps of propstats) {
			const code = status(one(ps, 'status', true)), prop = one(ps, 'prop', true);
			if (code < 200 || code >= 300) { failures.push(code); continue; } successes++;
			for (const p of prop.children) {
				if (p.uri === 'http://calendarserver.org/ns/' && p.local === 'getctag') { if (Object.hasOwn(row, 'ctag')) xmlError(); row.ctag = scalar(p) || null; continue; }
				if (p.uri === DAV && p.local === 'sync-token') { if (Object.hasOwn(row, 'syncToken')) xmlError(); row.syncToken = scalar(p) || null; continue; }
				if (p.uri !== DAV || !['resourcetype', 'getetag', 'getcontentlength'].includes(p.local)) continue;
				if (seen.has(p.local)) xmlError(); seen.add(p.local);
				if (p.local === 'resourcetype') { if (p.text.trim()) xmlError(); row.collection = children(p, 'collection').length > 0; }
				else if (p.local === 'getetag') row.etag = scalar(p) || null;
				else { const s = scalar(p); row.size = s ? length(s) : null; }
			}
		}
		if (propstats.length && !successes) row.status = failures[0];
		return row;
	});
	const token = one(root, 'sync-token');
	return sync ? {rows, syncToken: token ? scalar(token) : null} : rows;
}
function segments(path) {
	if (!path.startsWith('/') || /[\\\x00-\x20\x7f?#]/.test(path)) refuse('authority', 'The destination path is not unambiguous.');
	const raw = path.split('/').slice(1); if (raw.at(-1) === '') raw.pop();
	return raw.map(s => {
		let decoded; try { decoded = decodeURIComponent(s); } catch { refuse('authority', 'The destination path has invalid encoding.'); }
		if (!decoded || decoded === '.' || decoded === '..' || /[/\\\x00-\x1f\x7f]/.test(decoded) || /%[0-9a-f]{2}/i.test(decoded)) refuse('authority', 'The destination path contains an ambiguous segment.');
		return decoded;
	});
}
function checkedURL(value, origin) {
	if (typeof value !== 'string' || /[\\\x00-\x20\x7f]/.test(value)) refuse('authority', 'The WebDAV destination is not a safe absolute URL.');
	const raw = /^(?:https?:\/\/[^/?#]+)?(\/[^?#]*)$/i.exec(value); if (!raw) refuse('authority', 'Use a WebDAV URL without query, fragment or embedded credentials.');
	const parts = segments(raw[1]); let url;
	try { url = origin ? new URL(value, origin) : new URL(value); } catch { refuse('authority', 'The WebDAV destination is not a valid URL.'); }
	if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || origin && url.origin !== origin) refuse('authority', 'The destination leaves the configured WebDAV authority.');
	return {url, parts};
}
function lanHost(host) {
	const h = host.replace(/^\[|\]$/g, '').toLowerCase();
	if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || !h.includes('.') && !h.includes(':')) return true;
	if (h.includes(':')) return h === '::' || h === '::1' || /^(?:f[cd]|fe[89ab])/.test(h) || h.startsWith('::ffff:');
	const v = h.split('.').map(Number);
	return v.length === 4 && v.every(n => Number.isInteger(n) && n >= 0 && n <= 255) && (v[0] === 0 || v[0] === 10 || v[0] === 127 || v[0] === 169 && v[1] === 254 || v[0] === 172 && v[1] >= 16 && v[1] <= 31 || v[0] === 192 && v[1] === 168 || v[0] === 100 && v[1] >= 64 && v[1] <= 127 || v[0] >= 224);
}
export {checkedURL as checkedWebDAVURL, lanHost as webDAVLanHost};
