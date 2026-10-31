import {refuse, isProviderRefusal} from './provider-http.mjs';
export const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const te = new TextEncoder();
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
export function s3Bucket({endpoint, bucket, addressingStyle, network = 'public', allowInsecureLan = false} = {}) {
	if (typeof endpoint !== 'string' || !endpoint.trim() || /[\x00-\x20\x7f\\]/.test(endpoint.trim())) refuse('config', 'enter the S3 API origin in Sync');
	const address = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(endpoint.trim()) ? endpoint.trim() : 'https://' + endpoint.trim();
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
		!['path', 'virtual-host'].includes(addressingStyle)) refuse('config', 'a bucket, explicit addressing style and opaque vault id are required');
	const endpointOrigin = url.origin;
	if (addressingStyle === 'virtual-host') {
		if (url.hostname.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) refuse('config', 'an IP endpoint requires explicit path-style addressing');
		url.hostname = bucket + '.' + url.hostname;
	}
	return Object.freeze({endpoint: endpointOrigin, origin: url.origin, bucket, addressingStyle, network,
		path: addressingStyle === 'path' ? '/' + bucket + '/' : '/'});
}
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
export {readXML as readS3XML, scalar as s3XMLScalar};
