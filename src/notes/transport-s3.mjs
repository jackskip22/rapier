import {createHTTP, asBytes, byteCount as integer, fail, refuse, isProviderRefusal} from './provider-http.mjs';
import {objectKey, objectPrefix, listOptions} from './provider-objects.mjs';
// S3 SigV4, in the network owner only. Inject fetch; configure the destination in Sync, NEVER
// from a note. Prefer provider credentials scoped to this bucket AND vault prefix: our key
// checks restrict the application, not the provider grant. No OAuth bearer and no vault key.
// Opaque immutable addresses share transport-r2.mjs's contract. PUT is a complete, signed,
// digest-addressed object; sync.mjs's putVerified still owns full readback before publication.
export const PUT_MAX_BYTES = 300000000; // In-memory budget, NOT a claimed S3 service limit.
export const LIST_MAX_BYTES = 4 * 1024 * 1024;
export const RETRY_CAP = 4;
export const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
export const SEAMS = Object.freeze({
	multipart: 'not implemented; oversized objects remain local, never split or truncated',
	conditionalWrite: 'not assumed across S3 providers; immutable ciphertext addresses instead',
	redirects: 'refused, including same-origin redirects; change the destination explicitly in Sync',
	delete: 'disabled unless Sync creates a separate allowDelete transport for reviewed vault retirement',
	credentials: 'memory only; persistence, rotation, consent and destination-change audit belong to Sync',
	lan: 'explicit network class; the host owns DNS/IP admission and LAN permission, not this JS module',
	browser: 'WebCrypto secure context and bucket CORS required; provider/browser paths need qualification',
});
const te = new TextEncoder(), td = new TextDecoder('utf-8', {fatal: true});
function cryptoAPI(value) {
	const s = value?.subtle;
	if (!s || !['digest', 'importKey', 'sign'].every(k => typeof s[k] === 'function')) refuse('crypto', 'WebCrypto is required for S3 signing');
	return s;
}
const hex = bytes => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
async function sha256(bytes, crypto) {
	try { return hex(await cryptoAPI(crypto).digest('SHA-256', bytes)); }
	catch (e) { if (isProviderRefusal(e)) throw e; refuse('crypto', 'the complete payload could not be hashed; no request was sent'); }
}
function credentials(accessKeyId, secretAccessKey, sessionToken) {
	if (typeof accessKeyId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(accessKeyId) ||
		typeof secretAccessKey !== 'string' || !/^[\x21-\x7e]{1,4096}$/.test(secretAccessKey) ||
		(sessionToken != null && (typeof sessionToken !== 'string' || !/^[\x21-\x7e]{1,65536}$/.test(sessionToken))))
		refuse('auth', 'an S3 access key pair, and optionally its session token, are required; a bearer is not an S3 key');
}
// RFC 3986/AWS UriEncode: upper-case escapes, space is %20, literal + is %2B, ~ stays ~.
// Input is RAW text, not an already-escaped URL. In an S3 key only '/' is left as a separator.
function encode(value) {
	if (typeof value !== 'string') refuse('encoding', 'URI components must be strings');
	try { return encodeURIComponent(value).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()); }
	catch { refuse('encoding', 'the URI contains invalid Unicode'); }
}
export function encodeObjectKey(key) {
	if (typeof key !== 'string') refuse('encoding', 'an object key must be a string');
	return key.split('/').map(encode).join('/');
}
export function canonicalQuery(pairs = []) {
	if (!Array.isArray(pairs)) refuse('signing', 'query parameters must be raw name/value pairs');
	return pairs.map(pair => {
		if (!Array.isArray(pair) || pair.length !== 2) refuse('signing', 'query parameters must be raw name/value pairs');
		return pair.map(encode);
	}).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)
		.map(([name, value]) => name + '=' + value).join('&');
}
// Pure signer; no URL fetching or endpoint discovery. service is explicit only so AWS's
// general SigV4 vectors can exercise this SAME signing implementation. The transport pins s3.
// Diagnostics contain canonical headers (which can include a session token); never log them.
export async function signV4({method, path, query = [], headers, payloadHash = EMPTY_SHA256,
	region, service = 's3', accessKeyId, secretAccessKey, crypto = globalThis.crypto} = {}) {
	credentials(accessKeyId, secretAccessKey);
	if (typeof method !== 'string' || !/^[A-Z]+$/.test(method) || typeof path !== 'string' || !path.startsWith('/') ||
		!(/^[a-z0-9-]{1,63}$/).test(region || '') || !(/^[a-z0-9-]{1,63}$/).test(service || '') ||
		!(/^[a-f0-9]{64}$|^UNSIGNED-PAYLOAD$/).test(payloadHash)) refuse('signing', 'the signing method, path, region, service or payload hash is invalid');
	const fields = new Map();
	for (const pair of (Array.isArray(headers) ? headers : Object.entries(headers || {}))) {
		if (!Array.isArray(pair) || pair.length !== 2) refuse('signing', 'invalid signing headers');
		let [name, value] = pair;
		if (typeof name !== 'string' || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
			typeof value !== 'string' || /[\x00-\x08\x0a-\x1f\x7f]/.test(value)) refuse('signing', 'invalid signing headers');
		name = name.toLowerCase(); value = value.trim().replace(/[ \t]+/g, ' ');
		if (name === 'authorization') refuse('signing', 'an existing authorization header cannot be signed');
		fields.set(name, fields.has(name) ? fields.get(name) + ',' + value : value);
	}
	const date = fields.get('x-amz-date');
	if (!fields.get('host') || !/^\d{8}T\d{6}Z$/.test(date || '')) refuse('signing', 'host and an AWS UTC timestamp are required');
	if (fields.has('x-amz-content-sha256') && fields.get('x-amz-content-sha256') !== payloadHash) refuse('signing', 'the payload header disagrees with the signed payload');
	const names = [...fields.keys()].sort(), signedHeaders = names.join(';');
	const canonicalRequest = [method, encodeObjectKey(path), canonicalQuery(query),
		names.map(name => name + ':' + fields.get(name) + '\n').join(''), signedHeaders, payloadHash].join('\n');
	const scope = `${date.slice(0, 8)}/${region}/${service}/aws4_request`;
	const stringToSign = `AWS4-HMAC-SHA256\n${date}\n${scope}\n${await sha256(te.encode(canonicalRequest), crypto)}`;
	let signature;
	try {
		const s = cryptoAPI(crypto);
		const hmac = async (key, text) => s.sign('HMAC', await s.importKey('raw', key, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']), te.encode(text));
		let key = te.encode('AWS4' + secretAccessKey);
		for (const part of [date.slice(0, 8), region, service, 'aws4_request']) key = await hmac(key, part);
		signature = hex(await hmac(key, stringToSign));
	} catch (e) { if (isProviderRefusal(e)) throw e; refuse('crypto', 'the request could not be signed; no credential details were retained'); }
	return {canonicalRequest, stringToSign, signedHeaders, signature,
		authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`};
}
function localHost(host) {
	const h = host.replace(/^\[|\]$/g, '').toLowerCase();
	if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || (!h.includes('.') && !h.includes(':'))) return true;
	if (h.includes(':')) {
		if (h === '::' || h === '::1' || /^(?:f[cd]|fe[89ab])/.test(h)) return true;
		const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/.exec(h);
		if (mapped) { const n = parseInt(mapped[1], 16) * 65536 + parseInt(mapped[2], 16); return localHost([n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255].join('.')); }
		return false;
	}
	if (!/^\d+\.\d+\.\d+\.\d+$/.test(h)) return false;
	const [a, b] = h.split('.').map(Number);
	return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 ||
		a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19);
}
// This is configuration, never a value accepted from a provider response. The endpoint is an
// API origin, not an arbitrary URL. Virtual hosting adds the chosen bucket ONCE, before pinning.
export function s3Destination({endpoint, bucket, addressingStyle, vaultId, prefix = 'rapier/',
	network = 'public', allowInsecureLan = false} = {}) {
	if (typeof endpoint !== 'string' || !endpoint.trim() || /[\x00-\x20\x7f\\]/.test(endpoint.trim())) refuse('config', 'enter the S3 API origin in Sync');
	const address = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(endpoint.trim()) ? endpoint.trim() : 'https://' + endpoint.trim();
	// Check the entered form BEFORE URL can erase dot segments or empty ?/#/userinfo.
	if (!/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/?#@]+\/?$/.test(address)) refuse('authority', 'the endpoint must be an API origin without a path, credentials, query or fragment');
	let url;
	try { url = new URL(address); }
	catch { refuse('config', 'the S3 endpoint is not a valid origin'); }
	if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
		!['https:', 'http:'].includes(url.protocol) || url.hostname.endsWith('.')) refuse('authority', 'the endpoint must be an API origin without a path, credentials, query or fragment');
	if (!['public', 'lan'].includes(network) || typeof allowInsecureLan !== 'boolean') refuse('config', 'choose a public or LAN destination explicitly');
	if (network === 'public' && localHost(url.hostname)) refuse('authority', 'this is a LAN endpoint; select LAN in Sync before connecting');
	if (url.protocol !== 'https:' && !(network === 'lan' && allowInsecureLan)) refuse('authority', 'HTTPS is required unless insecure LAN access was explicitly approved in Sync');
	if (typeof bucket !== 'string' || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || /\.\.|\.-|-\./.test(bucket) ||
		!['path', 'virtual-host'].includes(addressingStyle) || typeof vaultId !== 'string' || !/^[a-f0-9]{32}$/.test(vaultId)) refuse('config', 'a bucket, explicit addressing style and opaque vault id are required');
	if (typeof prefix !== 'string' || prefix.startsWith('/') || /[\x00-\x1f\x7f\\]/.test(prefix) || prefix.split('/').some(p => p === '.' || p === '..'))
		refuse('authority', 'the configured prefix must stay inside the selected bucket');
	encodeObjectKey(prefix); // Reject invalid Unicode before keeping any destination.
	const root = (prefix && !prefix.endsWith('/') ? prefix + '/' : prefix) + vaultId + '/';
	// Leave room for a longest permitted head key in S3's 1024-byte key budget.
	if (te.encode(root).length > 800) refuse('config', 'the vault prefix leaves too little room for immutable object names');
	const endpointOrigin = url.origin;
	if (addressingStyle === 'virtual-host') {
		if (url.hostname.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) refuse('config', 'an IP endpoint requires explicit path-style addressing');
		url.hostname = bucket + '.' + url.hostname;
	}
	return Object.freeze({endpoint: endpointOrigin, origin: url.origin, bucket, addressingStyle, root, network,
		path: addressingStyle === 'path' ? '/' + bucket + '/' : '/'});
}
function stopBody(res) { try { const p = res.body?.cancel(); if (p?.catch) void p.catch(() => {}); } catch {} }
function isObject(key) { try { objectKey(key); return true; } catch { return false; } }
// A bounded XML reader for ListObjectsV2, identical in Node and browser. No DOMParser,
// external entities, DTD, tolerant HTML repair or regex extraction of nested lookalike fields.
function xmlText(raw) {
	return raw.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);|&/g, match => {
		const known = {'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'"};
		if (Object.hasOwn(known, match)) return known[match];
		if (match === '&') refuse('response', 'the listing contains an invalid XML entity');
		const n = match[2] === 'x' ? parseInt(match.slice(3, -1), 16) : Number(match.slice(2, -1));
		if (!(n === 9 || n === 10 || n === 13 || n >= 32 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) && n !== 0xfffe && n !== 0xffff))
			refuse('response', 'the listing contains an invalid XML character');
		return String.fromCodePoint(n);
	});
}
function readXML(text, root = 'ListBucketResult') {
	if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) refuse('response', 'the listing is not valid XML');
	text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
	const tokens = /<!--[\s\S]*?-->|<\?xml\s[^?]*\?>|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]*>|[^<]+/gy;
	const stack = [], roots = []; let at = 0, nodes = 0;
	while (at < text.length) {
		tokens.lastIndex = at; const token = tokens.exec(text);
		if (!token) refuse('response', 'the listing is not complete XML');
		const raw = token[0]; at = tokens.lastIndex;
		if (raw.startsWith('<!--')) { if (raw.slice(4, -3).includes('--')) refuse('response', 'the listing has an invalid XML comment'); continue; }
		if (raw.startsWith('<?xml')) { if (token.index !== 0) refuse('response', 'the listing has a misplaced XML declaration'); continue; }
		if (raw.startsWith('<![CDATA[')) {
			if (!stack.length) refuse('response', 'the listing has misplaced XML text');
			stack.at(-1).text += raw.slice(9, -3); continue;
		}
		if (!raw.startsWith('<')) {
			if (raw.includes(']]>')) refuse('response', 'the listing has invalid XML text');
			if (stack.length) stack.at(-1).text += xmlText(raw);
			else if (raw.trim()) refuse('response', 'the listing has text outside its root');
			continue;
		}
		const closing = /^<\/([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)\s*>$/.exec(raw);
		if (closing) { if (!stack.length || stack.pop().qname !== closing[1]) refuse('response', 'the listing has mismatched XML tags'); continue; }
		const opening = /^<([A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?)([\s\S]*?)(\/?)>$/.exec(raw);
		if (!opening || ++nodes > 25000 || stack.length >= 16) refuse('response', 'the listing has invalid or excessive XML structure');
		const ns = {...(stack.at(-1)?.ns || {})}, seen = new Set(); let attrs = opening[2];
		while (attrs.trim()) {
			const attr = /^\s+(xmlns(?::[A-Za-z_][\w.-]*)?)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/.exec(attrs);
			if (!attr || seen.has(attr[1])) refuse('response', 'the listing has unsupported or duplicate XML attributes');
			seen.add(attr[1]); ns[attr[1].slice(6)] = xmlText(attr[2] ?? attr[3]); attrs = attrs.slice(attr[0].length);
		}
		const parts = opening[1].split(':'), prefix = parts.length === 2 ? parts[0] : '', uri = ns[prefix] || '';
		if (prefix && !uri || uri && uri !== 'http://s3.amazonaws.com/doc/2006-03-01/') refuse('response', 'the listing has an unexpected XML namespace');
		const node = {qname: opening[1], name: parts.at(-1), ns, uri, text: '', children: []};
		if (roots.length && uri !== roots[0].uri) refuse('response', 'the listing changes XML namespace');
		(stack.length ? stack.at(-1).children : roots).push(node);
		if (!opening[3]) stack.push(node);
	}
	if (stack.length || roots.length !== 1 || roots[0].name !== root) refuse('response', 'the listing is not a complete ListObjectsV2 result');
	return roots[0];
}
function scalar(node, name, required = false) {
	const found = node.children.filter(c => c.name === name);
	if (found.length > 1 || required && !found.length || found.some(n => n.children.length)) refuse('response', 'the listing has missing, duplicate or nested scalar fields');
	return found.length ? found[0].text : null;
}
function parseListing(bytes, {bucket, root}, prefix, cursor, {startAfter = null, delimiter = null} = {}) {
	let text;
	try { text = td.decode(bytes); } catch { refuse('response', 'the listing is not valid UTF-8'); }
	const xml = readXML(text);
	const allowed = new Set(['Name', 'Prefix', 'KeyCount', 'MaxKeys', 'IsTruncated', 'EncodingType', 'ContinuationToken', 'NextContinuationToken', 'Contents', 'Delimiter', 'StartAfter', ...(delimiter === null ? [] : ['CommonPrefixes'])]);
	if (xml.text.trim() || xml.children.some(c => !allowed.has(c.name))) refuse('response', 'the listing contains an unexpected object grouping');
	const encoding = scalar(xml, 'EncodingType');
	if (encoding !== null && encoding !== 'url') refuse('response', 'the listing uses an unknown key encoding');
	const decode = value => { try { return encoding === 'url' ? decodeURIComponent(value) : value; } catch { refuse('response', 'the listing has invalid URL-encoded keys'); } };
	if (scalar(xml, 'Name', true) !== bucket || decode(scalar(xml, 'Prefix', true)) !== root + prefix) refuse('authority', 'the listing does not belong to the requested bucket and prefix');
	// A grouping or a start key omits objects, so only the requested ones are admitted.
	const echoedDelimiter = scalar(xml, 'Delimiter'), echoedStart = scalar(xml, 'StartAfter');
	if (echoedDelimiter !== null && decode(echoedDelimiter) !== delimiter || echoedStart !== null && decode(echoedStart) !== (startAfter === null ? null : root + startAfter))
		refuse('response', 'the listing omitted objects through an unrequested grouping or start key');
	const echo = scalar(xml, 'ContinuationToken');
	if (echo !== null && echo !== (cursor ?? '')) refuse('cursor', 'the listing belongs to a different continuation');
	const flag = scalar(xml, 'IsTruncated', true);
	if (flag !== 'true' && flag !== 'false') refuse('response', 'the listing does not say whether it is complete');
	const next = scalar(xml, 'NextContinuationToken');
	if (flag === 'true' && (typeof next !== 'string' || !next || next.length > 8192 || next === cursor) || flag === 'false' && next)
		refuse('cursor', 'the listing did not supply an advancing, consistent cursor');
	const seen = new Set();
	const keys = xml.children.filter(c => c.name === 'Contents').map(row => {
		if (row.text.trim()) refuse('response', 'the object listing contains mixed XML text');
		const full = decode(scalar(row, 'Key', true)), key = full.slice(root.length);
		if (!full.startsWith(root + prefix) || !isObject(key) || te.encode(full).length > 1024) refuse('authority', 'the provider returned an object outside the requested vault scope');
		if (seen.has(key)) refuse('response', 'the listing repeated an object'); seen.add(key);
		return {key, size: integer(scalar(row, 'Size', true)), etag: scalar(row, 'ETag') || ''};
	});
	const prefixes = xml.children.filter(c => c.name === 'CommonPrefixes').map(group => {
		if (group.text.trim() || group.children.some(c => c.name !== 'Prefix')) refuse('response', 'the listing contains an unexpected grouping');
		const full = decode(scalar(group, 'Prefix', true)), value = full.slice(root.length);
		if (!full.startsWith(root + prefix) || !/^heads\/[A-Za-z0-9][A-Za-z0-9_-]{0,63}\/$/.test(value)) refuse('authority', 'the provider returned a grouping outside the requested vault scope');
		if (seen.has(value)) refuse('response', 'the listing repeated a grouping'); seen.add(value);
		return value;
	});
	const count = scalar(xml, 'KeyCount'), max = scalar(xml, 'MaxKeys'), entries = keys.length + prefixes.length;
	if (entries > 1000 || count !== null && integer(count) !== entries || max !== null && (integer(max) > 1000 || entries > integer(max)))
		refuse('response', 'the listing count does not match its objects');
	return {keys, ...(delimiter === null ? {} : {prefixes}), truncated: flag === 'true', cursor: flag === 'true' ? next : null};
}
// Reuse the bounded XML reader; only a known direct Code may select our own words.
// Message, RequestId, credentials, malformed/nested/duplicate codes are never reflected.
function forbiddenResponse(response, destination) {
	let code;
	try { code = scalar(readXML(td.decode(response.bytes), 'Error'), 'Code', true)?.trim(); } catch {}
	const provider = destination.origin.endsWith('.r2.cloudflarestorage.com') ? 'cloudflare' : 'your storage provider';
	const messages = {
		InvalidAccessKeyId: 'this bucket key was deleted or is not recognised; replace it with a new key from ' + provider + '.',
		SignatureDoesNotMatch: 'the bucket key does not match its secret; copy both again from ' + provider + '.',
		RequestTimeTooSkewed: 'this device’s clock is too far off for the bucket; set the time automatically and try again.',
		AccessDenied: 'this key cannot access the selected bucket; give it object read and write access in ' + provider + '.',
	};
	return fail('permission', Object.hasOwn(messages, code) ? messages[code] : 'the bucket refused access; check the selected bucket and its key’s permissions.',
		{status: 403, ...(Object.hasOwn(messages, code) ? {providerCode: code} : {})});
}
export function createS3Transport(options = {}) {
	const {fetch: fetchFn, accessKeyId, secretAccessKey, sessionToken, region, signal,
		crypto = globalThis.crypto, clock = () => new Date(), allowDelete = false, payloadSigning = 'signed'} = options;
	if (typeof fetchFn !== 'function') refuse('fetch', 'an injected companion fetch is required; there is no ambient fallback');
	if (['vdk', 'vaultKey', 'vaultDataKey', 'token', 'accessToken', 'origin'].some(k => Object.hasOwn(options, k)))
		refuse('authority', 'configure an S3 key pair in Sync, not a vault key, bearer or alternate origin');
	credentials(accessKeyId, secretAccessKey, sessionToken); cryptoAPI(crypto);
	const destination = s3Destination(options);
	if (!/^[a-z0-9-]{1,63}$/.test(region || '') || typeof clock !== 'function' || typeof allowDelete !== 'boolean' ||
		!['signed', 'unsigned'].includes(payloadSigning)) refuse('config', 'an explicit signing region and valid transport options are required');
	if (payloadSigning === 'unsigned' && !destination.origin.startsWith('https:')) refuse('config', 'UNSIGNED-PAYLOAD requires HTTPS');
	const timeoutMs = options.timeoutMs ?? 30000, maxObjectBytes = options.maxObjectBytes ?? PUT_MAX_BYTES;
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000 || !Number.isSafeInteger(maxObjectBytes) || maxObjectBytes < 1 || maxObjectBytes > PUT_MAX_BYTES)
		refuse('config', 'invalid request deadline or complete-object budget');
	if (signal && (typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function' || typeof signal.aborted !== 'boolean')) refuse('config', 'a valid abort signal is required');
	const wait = options.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
	if (typeof wait !== 'function') refuse('config', 'the retry wait must be a function');
	const http = createHTTP({fetch: fetchFn, signal, timeoutMs, wait}), check = http.check;
	function keyCheck(key) { objectKey(key); if (te.encode(destination.root + key).length > 1024) refuse('authority', 'only opaque immutable objects in the selected vault are allowed'); }
	function noConditional(condition) { if (condition != null && (typeof condition !== 'object' || Object.keys(condition).length)) refuse('conditional', 'conditional writes are not assumed for this provider; no request was sent'); }
	async function request(method, key, {body, hash = EMPTY_SHA256, query = [], listing = false} = {}) {
		const path = destination.path + (key === null ? '' : destination.root + key);
		const qs = canonicalQuery(query), url = destination.origin + encodeObjectKey(path) + (qs ? '?' + qs : '');
		const res = await http.retry(() => http.request(url, {origin: destination.origin, method, body,
			// Fetch may decode compressed listing XML; its decoded stream stays bounded.
			// Opaque objects still require identity bytes and exact complete-object lengths.
			allowHTTP: destination.origin.startsWith('http:'), exactTarget: true, identityOnly: !listing,
			maxBytes: listing ? LIST_MAX_BYTES : method === 'GET' ? maxObjectBytes : 65536,
			prepare: async () => {
				let date;
				try { date = clock().toISOString().replace(/[:-]|\.\d{3}/g, ''); } catch { refuse('clock', 'the signing clock did not supply a valid UTC date'); }
				const payloadHash = payloadSigning === 'unsigned' ? 'UNSIGNED-PAYLOAD' : hash;
				const headers = {'host': new URL(destination.origin).host, 'x-amz-date': date, 'x-amz-content-sha256': payloadHash,
					...(body ? {'content-type': 'application/octet-stream'} : {}), ...(sessionToken ? {'x-amz-security-token': sessionToken} : {})};
				const signed = await signV4({method, path, query, headers, payloadHash, region, accessKeyId, secretAccessKey, crypto});
				delete headers.host; // Fetch owns Host (including a non-default port); browsers forbid setting it.
				headers.authorization = signed.authorization;
				return headers;
			},
			inspect: response => {
				const status = response.status;
				if (status === 401) refuse('auth', 'the S3 credential was refused; reconnect in Rapier Sync');
				if (status === 403) return true; // Read the bounded fault body before choosing our own sentence.
				if (status === 429 || status >= 500 || status === 404 && !listing && ['GET', 'HEAD'].includes(method)) return false;
				if (status === 412) refuse('precondition', 'the provider refused a precondition; existing remote bytes were not replaced');
				if (status === 404 && listing) refuse('bucket', 'the selected bucket was not found; this is not an empty vault');
				const accepted = method === 'DELETE' ? [200, 204, 404] : method === 'PUT' ? [200, 201, 204] : [200];
				if (!accepted.includes(status) || response.headers?.get('content-range')) refuse('http', 'the provider refused a complete operation (HTTP ' + status + ')');
				return method !== 'HEAD';
			},
		}), response => response.status === 429 || response.status >= 500
			? {error: fail(response.status === 429 ? 'rate' : 'server', 'the provider is temporarily refusing requests; work is kept')} : null,
		true, attempt => Math.min(2000, 200 * 2 ** attempt));
		if (res.status === 403) throw forbiddenResponse(res, destination);
		if (res.status === 404 && !listing && ['GET', 'HEAD'].includes(method)) return null;
		const etag = res.headers?.get('etag') || '';
		if (method === 'HEAD') return {etag, size: integer(res.headers?.get('content-length'))};
		if (method === 'PUT' || method === 'DELETE') {
			if (res.bytes.length) refuse('response', 'the provider returned an unexpected write receipt; the outcome must be verified');
			return {etag};
		}
		return {bytes: res.bytes, etag, size: res.bytes.length};
	}
	let connectionProof = null, connecting = null;
	async function connect() {
		check(); if (connectionProof) return connectionProof;
		if (!connecting) connecting = (async () => {
			// Random diagnostic bytes, never a note, header, vault key or provider credential.
			// Keep the object: ordinary sync has no deletion grant, even during failed enrollment.
			if (typeof crypto?.getRandomValues !== 'function') refuse('crypto', 'a secure random source is required for the connection check');
			const bytes = new Uint8Array(32);
			try { crypto.getRandomValues(bytes); } catch { refuse('crypto', 'the connection check could not obtain secure random bytes'); }
			const key = 'objects/' + await sha256(bytes, crypto);
			const written = await transport.put(key, bytes), got = await transport.get(key);
			if (!got || got.bytes.length !== bytes.length || !bytes.every((byte, i) => byte === got.bytes[i])) refuse('probe', 'The S3 connection check did not read back exactly. No notes were sent.');
			const page = await transport.list(key);
			if (page.truncated || page.cursor !== null || page.keys.length !== 1 || page.keys[0].key !== key) refuse('probe', 'The S3 listing did not contain exactly the object just checked. No notes were sent.');
			const row = page.keys[0];
			if (row.size !== bytes.length || !row.etag || row.etag !== got.etag || row.etag !== written.etag) refuse('probe', 'The S3 listing and readback metadata disagree. No notes were sent.');
			check();
			connectionProof = Object.freeze({ready: true, key, size: bytes.length, etag: row.etag, retention: 'kept'});
			return connectionProof;
		})();
		const pending = connecting;
		try { return await pending; } finally { if (connecting === pending) connecting = null; }
	}

	const stat = async key => { keyCheck(key); const value = await request('HEAD', key); return value ? {key, ...value} : null; };
	const transport = {
		destination, connect,
		get answered() { return http.answered; },
		capabilities: Object.freeze({supportsConditionalWrite: false, supportsETag: true, supportsResumableUpload: false,
			supportsMultipart: false, supportsDeltaFeed: false, supportsServerSideCopy: false, supportsNativeVersioning: false,
			maxSingleUploadBytes: maxObjectBytes, listsFrom: true, seams: SEAMS}),
		pause: http.pause,
		async put(key, value, condition) {
			check(); keyCheck(key); noConditional(condition);
			const source = asBytes(value);
			if (source.byteLength > maxObjectBytes) refuse('too_large', 'this complete object exceeds the transport budget; the original remains local');
			const body = new Uint8Array(source), hash = await sha256(body, crypto);
			if (key.slice(-64) !== hash) refuse('ciphertext', 'ciphertext does not match its immutable upload address; no bytes were sent');
			const receipt = await request('PUT', key, {body, hash});
			return {key, etag: receipt.etag, size: body.length};
		},
		async get(key) { keyCheck(key); const value = await request('GET', key); return value ? {key, ...value} : null; },
		async list(prefix, cursor = null, options = {}) {
			if (prefix !== '') objectPrefix(prefix);
			if (cursor !== null && (typeof cursor !== 'string' || !cursor || cursor.length > 8192)) refuse('cursor', 'invalid provider cursor');
			const {startAfter, delimiter} = listOptions(prefix, options);
			const query = [['list-type', '2'], ['encoding-type', 'url'], ['max-keys', '1000'], ['prefix', destination.root + prefix]];
			if (startAfter !== null) query.push(['start-after', destination.root + startAfter]);
			if (delimiter !== null) query.push(['delimiter', delimiter]);
			if (cursor !== null) query.push(['continuation-token', cursor]);
			const page = await request('GET', null, {query, listing: true});
			return parseListing(page.bytes, destination, prefix, cursor, {startAfter, delimiter});
		},
		stat, head: stat,
		async exists(key) { return (await stat(key)) !== null; },
		async delete(key, condition) {
			check(); keyCheck(key); noConditional(condition);
			if (!allowDelete) refuse('keep', 'remote deletion requires a separately approved vault-retirement transport in Sync');
			await request('DELETE', key); return {key, deleted: true};
		},
	};
	return Object.freeze(transport);
}

