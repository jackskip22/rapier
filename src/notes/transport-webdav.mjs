import {createHTTP, asBytes as bytes, fail, refuse} from './provider-http.mjs';
// Companion-side WebDAV over an injected, non-redirecting client. No ambient network or vault key.
const DAV = 'DAV:', XML = 'http://www.w3.org/XML/1998/namespace';
const XMLNS = 'http://www.w3.org/2000/xmlns/';
const HASH = '[a-f0-9]{64}', DEVICE = '[A-Za-z0-9][A-Za-z0-9_-]{0,63}';
const OBJECT = new RegExp(`^(?:objects|keys)/${HASH}$|^heads/${DEVICE}/(?!0{12})[0-9]{12}-${HASH}$`); // twelve digits, never all zeros
const FAMILY = new RegExp(`^(?:objects/|keys/|heads/(?:${DEVICE}/)?)$`);
const te = new TextEncoder(), td = new TextDecoder('utf-8', {fatal: true});
export const WEBDAV_MAX_OBJECT_BYTES = 300000000;
export const WEBDAV_SETUP_NOTICE = 'WebDAV storage and companion setup are included; note transfers are not connected in this build yet. Nothing is sent until the companion is configured.';
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
function matchTag(value) {
	if (!isStrongWebDAVETag(value)) refuse('etag', 'This operation needs one strong, quoted ETag. A weak, missing or unquoted ETag cannot protect your work.');
	return value;
}
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
// Bounded XML 1.0, DTD-free subset: a cursor scanner, namespace stack and expanded names.
// No DOM, regex extraction of response blocks, external entities or namespace-prefix guessing.
export function parseWebDAVMultistatus(input, {maxBytes = XML_LIMIT, maxResponses = ROW_LIMIT} = {}) {
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
	const responses = children(root, 'response'); if (!responses.length || responses.length > maxResponses) xmlError();
	return responses.map(response => {
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
function equalPath(a, b) { return a.length === b.length && a.every((p, i) => p === b[i]); }
function startsPath(a, b) { return a.length >= b.length && b.every((p, i) => p === a[i]); }
export function createWebDAVTransport(options = {}) {
	const {fetch: fetchFn, endpoint, username, password, vaultId, authorizeEndpoint, signal} = options;
	if (typeof fetchFn !== 'function' || typeof authorizeEndpoint !== 'function') refuse('config', 'An injected companion HTTP client and endpoint authorization check are required.');
	if (typeof endpoint !== 'string' || !/^https?:\/\//i.test(endpoint)) refuse('config', 'Configure the absolute WebDAV collection URL in Rapier Sync.');
	const configured = checkedURL(endpoint.endsWith('/') ? endpoint : endpoint + '/'), origin = configured.url.origin, base = configured.parts;
	if (!/^[a-f0-9]{32}$/.test(vaultId || '')) refuse('config', 'An opaque vault identifier is required.');
	if (typeof username !== 'string' || !username || /[:\x00-\x1f\x7f]/.test(username) || typeof password !== 'string' || !password || /[\x00-\x1f\x7f]/.test(password) || username.length + password.length > 8192) refuse('auth', 'A WebDAV username and app password are required, without control characters.');
	const network = options.network ?? 'public', cleartext = configured.url.protocol === 'http:';
	if (!['public', 'lan'].includes(network) || lanHost(configured.url.hostname) && network !== 'lan') refuse('network_scope', 'A local destination must be explicitly configured as LAN storage.');
	if (cleartext && !(network === 'lan' && options.allowInsecureLan === true)) refuse('tls', 'Use HTTPS. Cleartext is only available for an explicitly accepted LAN destination.');
	const timeoutMs = integer(options.timeoutMs ?? 30000, 300000), maxObjectBytes = integer(options.maxObjectBytes ?? WEBDAV_MAX_OBJECT_BYTES, WEBDAV_MAX_OBJECT_BYTES);
	const maxListingBytes = integer(options.maxListingBytes ?? XML_LIMIT, XML_LIMIT), maxEntries = integer(options.maxEntries ?? ROW_LIMIT, ROW_LIMIT);
	const authBytes = te.encode(username + ':' + password); let binary = ''; for (const b of authBytes) binary += String.fromCharCode(b); const authorization = 'Basic ' + btoa(binary);
	const root = [...base, 'rapier', vaultId], http = createHTTP({fetch: fetchFn, signal, timeoutMs});
	let ready = false, connecting = null;
	const urlFor = (parts, collection = false) => {
		// An empty collection is the server root, "/", never "//".
		const path = '/' + parts.map(encodeURIComponent).join('/');
		return origin + (collection && !path.endsWith('/') ? path + '/' : path);
	};
	const check = http.check;
	function keyCheck(key) { if (typeof key !== 'string' || !OBJECT.test(key)) refuse('authority', 'Only one opaque immutable vault object is allowed, never a directory or note-supplied URL.'); return key; }
	async function request(method, parts, {collection = false, headers = {}, body, read = false, max = maxObjectBytes} = {}) {
		check(); let url = urlFor(parts, collection);
		const deadlineAt = Date.now() + timeoutMs;
		for (let hop = 0; hop <= 4; hop++) {
			let next = null;
			const res = await http.request(url, {origin, method, body, headers: {Authorization: authorization, ...headers},
				maxBytes: max, allowHTTP: cleartext, manualRedirects: true, deadlineAt,
				prepare: async requestSignal => {
					const allowed = await authorizeEndpoint(Object.freeze({url, origin, network, cleartext, signal: requestSignal}));
					if (allowed !== true) refuse('network_scope', 'This destination is not authorized on the current network; no credential was sent.');
				},
				inspect: response => {
					if (response.url) { const observed = checkedURL(response.url, origin); if (!equalPath(observed.parts, parts)) refuse('redirect', 'The response came from a different resource than requested.'); }
					if (response.status >= 300 && response.status < 400) {
						const location = response.headers.get('location'); let target;
						try {
							if (typeof location !== 'string' || !/^(?:https?:\/\/|\/)/i.test(location) || location.startsWith('//')) throw 0;
							target = checkedURL(location.startsWith('/') ? origin + location : location);
							if (!equalPath(target.parts, parts) || target.url.origin !== origin) throw 0; // Q2 redirect authority guard
							if (!['GET', 'PROPFIND'].includes(method) && (![307, 308].includes(response.status) || !collection && target.url.pathname.endsWith('/'))) throw 0;
							if (![301, 302, 307, 308].includes(response.status) || hop === 4 || target.url.href === url) throw 0;
						} catch { refuse('redirect', 'The server redirected outside the admitted resource or changed write semantics; credentials were not forwarded. Configure its final WebDAV URL in Sync.'); }
						next = target.url.href; return false;
					}
					if (response.status === 401) refuse('auth', 'The WebDAV credential was refused; reconnect in Rapier Sync.');
					if (response.status === 429) refuse('rate', 'The server is rate limiting requests; local work is kept.');
					if (response.status >= 500 && response.status !== 501 && response.status !== 507) refuse('server', 'The server could not confirm the operation; local work is kept.');
					return read && response.status >= 200 && response.status < 300;
				},
			});
			if (next) { url = next; continue; }
			return {status: res.status, etag: res.headers.get('etag')?.trim() || null,
				...(read && res.status >= 200 && res.status < 300 ? {bytes: res.bytes} : {})};
		}
	}
	function accepted(res, codes) {
		if (codes.includes(res.status)) return;
		const code = ({403: 'permission', 404: 'missing', 405: 'unsupported', 409: 'parent', 412: 'conflict', 423: 'locked', 501: 'unsupported', 507: 'quota', 207: 'partial', 202: 'unconfirmed'})[res.status] || 'http';
		refuse(code, `The WebDAV operation was not confirmed (HTTP ${res.status}); local work is kept.`);
	}
	async function propfind(parts, depth, {collection = false, budget} = {}) {
		if (budget && ++budget.requests > 1024) refuse('too_large', 'The listing needs more requests than this pass can safely complete.');
		const res = await request('PROPFIND', parts, {collection, headers: {Depth: String(depth), 'Content-Type': 'application/xml; charset=utf-8'}, body: PROP, read: true, max: budget ? Math.max(1, budget.remaining) : maxListingBytes});
		if (res.status === 404) return null; accepted(res, [207]);
		if (budget) { budget.remaining -= res.bytes.length; if (budget.remaining < 0) refuse('too_large', 'The complete listing exceeds its byte budget.'); }
		const rows = parseWebDAVMultistatus(res.bytes, {maxBytes: maxListingBytes, maxResponses: maxEntries});
		const seen = new Set(); let self = null;
		for (const row of rows) {
			const href = checkedURL(row.href, origin), id = JSON.stringify(href.parts);
			if (seen.has(id) || !startsPath(href.parts, parts) || href.parts.length > parts.length + depth) refuse('authority', 'The listing names duplicate resources or resources outside its requested depth.'); seen.add(id);
			if (row.status < 200 || row.status >= 300) refuse('listing', 'Part of the requested listing failed; it was not treated as complete.');
			row.parts = href.parts;
			if (equalPath(href.parts, parts)) self = row;
		}
		if (!self || depth === 1 && self.collection !== true || depth === 0 && rows.length !== 1) refuse('listing', 'The listing does not identify its requested resource completely.');
		if (budget) { budget.entries += rows.length; if (budget.entries > maxEntries) refuse('too_large', 'The complete listing exceeds its entry budget.'); }
		return {self, children: rows.filter(row => row !== self)};
	}
	async function ensureCollection(parts) {
		const res = await request('MKCOL', parts, {collection: true});
		if (![201, 200, 204, 403, 405, 409].includes(res.status)) accepted(res, [201]);
		// An "already exists" code is not evidence that the existing thing is a collection.
		const found = await propfind(parts, 0, {collection: true});
		if (!found || found.self.collection !== true) refuse('collection', 'The required WebDAV folder is missing or is a file; no file was replaced.');
	}
	async function rawGet(parts) { const res = await request('GET', parts, {read: true}); if (res.status === 404) return null; accepted(res, [200]); return res; }
	async function settledProbe(probe) {
		// mod_dav marks a freshly written file weak until its timestamp settles. Re-read;
		// never manufacture a strong validator by stripping W/. Only the diagnostic waits.
		for (let attempt = 0; attempt < 3; attempt++) {
			const got = await rawGet(probe);
			if (!got || got.bytes.length) refuse('keep', 'The server did not preserve the empty connection-check file.');
			if (!got.etag?.startsWith('W/') || attempt === 2) return matchTag(got.etag);
			await http.wait(1100);
			check();
		}
	}
	async function connect() {
		check(); if (ready) return {ready: true}; if (connecting) return connecting;
		connecting = (async () => {
			const baseInfo = await propfind(base, 0, {collection: true});
			if (!baseInfo || baseInfo.self.collection !== true) refuse('collection', 'Select an existing WebDAV collection in Rapier Sync.');
			await ensureCollection([...base, 'rapier']); await ensureCollection(root);
			// One reserved, empty diagnostic file per vault. Never use a person's object as a probe,
			// never send different bytes on a failing-precondition probe, never clean up recursively.
			const probe = [...root, '.webdav-check']; let existing = await propfind(probe, 0);
			if (existing && existing.self.collection !== false) refuse('collection', 'The reserved WebDAV check path is not an ordinary file.');
			if (existing) { const got = await rawGet(probe); if (!got || got.bytes.length) refuse('keep', 'The reserved WebDAV check file is occupied; it was not overwritten.'); }
			else accepted(await request('PUT', probe, {headers: {'If-None-Match': '*', 'Content-Type': 'application/octet-stream'}, body: new Uint8Array()}), [201, 204, 412]);
			const etag = await settledProbe(probe), wrong = '"rapier-check-' + crypto.randomUUID() + '"';
			for (const headers of [{'If-None-Match': '*'}, {'If-Match': wrong}]) {
				const result = await request('PUT', probe, {headers: {...headers, 'Content-Type': 'application/octet-stream'}, body: new Uint8Array()});
				if (result.status !== 412) refuse('conditional', 'This WebDAV server does not enforce conditional writes. Vault uploads are disabled; existing work is kept.');
			}
			const del = await request('DELETE', probe, {headers: {'If-Match': wrong, Depth: '0'}});
			if (del.status !== 412) refuse('conditional', 'This WebDAV server does not enforce conditional deletion. Vault writes are disabled; existing work is kept.');
			accepted(await request('PUT', probe, {headers: {'If-Match': etag, 'Content-Type': 'application/octet-stream'}, body: new Uint8Array()}), [200, 201, 204]);
			const after = await rawGet(probe); if (!after || after.bytes.length) refuse('conditional', 'The server did not preserve the connection-check file.');
			for (const family of ['objects', 'keys', 'heads']) await ensureCollection([...root, family]);
			ready = true; return {ready: true};
		})();
		try { return await connecting; } finally { connecting = null; }
	}
	const metadata = (key, row) => ({key, etag: row.etag, size: row.size, canCondition: isStrongWebDAVETag(row.etag)});
	const transport = {
		endpoint: Object.freeze({origin, network, cleartext}),
		capabilities: Object.freeze({get supportsConditionalWrite() { return ready; }, supportsETag: true, supportsResumableUpload: false, supportsMultipart: false, supportsDeltaFeed: false, supportsServerSideCopy: false, supportsNativeVersioning: false, maxSingleUploadBytes: maxObjectBytes}),
		connect,
		pause() { ready = false; http.pause(); },
		async get(key) { keyCheck(key); const result = await rawGet([...root, ...key.split('/')]); return result ? {key, bytes: result.bytes, etag: result.etag, size: result.bytes.length} : null; },
		async stat(key) { keyCheck(key); const result = await propfind([...root, ...key.split('/')], 0); if (!result) return null; if (result.self.collection !== false) refuse('collection', 'An opaque object path is not an ordinary file.'); return metadata(key, result.self); },
		async put(key, value, condition) {
			keyCheck(key); const body = bytes(value).slice(); if (body.length > maxObjectBytes) refuse('too_large', 'The complete object exceeds this upload budget; the original is kept locally.');
			const explicit = condition !== undefined;
			if (explicit && (!condition || typeof condition !== 'object' || Array.isArray(condition) || Object.keys(condition).length !== 1)) refuse('conditional', 'Choose exactly one write precondition.');
			let headers;
			if (!explicit || condition.ifNoneMatch === '*') headers = {'If-None-Match': '*'};
			else if (Object.hasOwn(condition, 'ifMatch')) headers = {'If-Match': matchTag(condition.ifMatch)};
			else refuse('conditional', 'An unconditional overwrite is not supported.');
			const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', body))].map(b => b.toString(16).padStart(2, '0')).join('');
			if (key.slice(-64) !== hash) refuse('ciphertext', 'These bytes do not match their immutable object address.');
			await connect(); if (key.startsWith('heads/')) await ensureCollection([...root, ...key.split('/').slice(0, 2)]);
			const res = await request('PUT', [...root, ...key.split('/')], {headers: {...headers, 'Content-Type': 'application/octet-stream'}, body});
			if (res.status === 412 && !explicit) {
				// A competing publisher of the same immutable bytes is success, not a sync failure.
				const got = await transport.get(key); if (got && got.bytes.length === body.length && body.every((b, i) => b === got.bytes[i])) return {key, etag: got.etag, size: body.length};
			}
			accepted(res, [200, 201, 204]);
			// ETags are validators, not content hashes. Success requires exact read-back bytes.
			const got = await transport.get(key);
			if (!got || got.bytes.length !== body.length || !body.every((b, i) => b === got.bytes[i])) refuse('upload_unconfirmed', 'The uploaded object did not read back exactly; local bytes and pending publication must be kept.');
			return {key, etag: got.etag, size: body.length};
		},
		async list(prefix, cursor = null) {
			if (cursor !== null) refuse('cursor', 'WebDAV returns a bounded complete listing, not a resumable provider cursor.');
			if (typeof prefix !== 'string' || !FAMILY.test(prefix) && !OBJECT.test(prefix)) refuse('authority', 'List only an opaque object family in this vault.');
			if (OBJECT.test(prefix)) { const row = await transport.stat(prefix); return {keys: row ? [row] : [], truncated: false, cursor: null}; }
			const parts = [...root, ...prefix.slice(0, -1).split('/')], budget = {remaining: maxListingBytes, entries: 0, requests: 0};
			const page = await propfind(parts, 1, {collection: true, budget}); if (!page) return {keys: [], truncated: false, cursor: null};
			const rows = [];
			for (const row of page.children) {
				if (prefix === 'heads/') {
					if (row.collection !== true || !new RegExp(`^${DEVICE}$`).test(row.parts.at(-1))) refuse('listing', 'The head listing contains a resource outside the immutable device layout.');
					const nested = await propfind(row.parts, 1, {collection: true, budget}); if (!nested) refuse('listing', 'A listed device folder disappeared; the listing was not treated as complete.'); rows.push(...nested.children);
				} else rows.push(row);
			}
			const keys = rows.map(row => { const key = row.parts.slice(root.length).join('/'); keyCheck(key); if (row.collection !== false || !key.startsWith(prefix)) refuse('listing', 'The object listing contains a directory or an out-of-scope object.'); return metadata(key, row); });
			keys.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
			return {keys, truncated: false, cursor: null};
		},
		async delete(key, condition) {
			keyCheck(key);
			if (!condition || condition.confirmed !== true || Object.keys(condition).some(k => !['confirmed', 'ifMatch'].includes(k))) refuse('keep', 'Remote deletion needs an explicitly reviewed single-object request.');
			const etag = matchTag(condition.ifMatch); await connect();
			const current = await transport.stat(key); if (!current) return {key, deleted: false};
			if (matchTag(current.etag) !== etag) refuse('conflict', 'The remote object changed after review; nothing was deleted.');
			const res = await request('DELETE', [...root, ...key.split('/')], {headers: {'If-Match': etag, Depth: '0'}});
			accepted(res, [200, 204, 404]); return {key, deleted: res.status !== 404};
		},
	};
	return Object.freeze(transport);
}
