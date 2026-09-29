// One bounded network seam for the storage transports and public-client OAuth. No dispatch, ambient
// fetch, credential store, or vault key. Callers own their endpoints, verbs and retry policy.
const LOCAL = Symbol('provider-refusal');
export const isProviderRefusal = error => !!error && error[LOCAL] === true;
export const fail = (code, message, detail = {}) => Object.assign(new Error(message), {code, ...detail, [LOCAL]: true});
export function refuse(code, message) { throw fail(code, message); }
export function publicOptions(options) {
	for (const name of ['clientSecret', 'client_secret', 'secretAccessKey', 'accessKeyId']) {
		if (Object.hasOwn(options, name)) refuse('secret', 'public-client sync never accepts a client secret or S3 credentials');
	}
	for (const name of ['origin', 'endpoint', 'apiOrigin', 'vdk', 'vaultKey']) {
		if (Object.hasOwn(options, name)) refuse('authority', 'provider authority is fixed and the vault key stays in the editor');
	}
}
export function asBytes(value) {
	if (value instanceof Uint8Array) return value;
	if (value instanceof ArrayBuffer) return new Uint8Array(value);
	if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
	refuse('bytes', 'complete bytes are required; no value is coerced');
}
export function byteCount(value) {
	const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
	if (!Number.isSafeInteger(n) || n < 0) refuse('response', 'the provider returned an invalid byte count');
	return n;
}
export function pinnedURL(value, origin, allowHTTP = false) {
	let url;
	try { url = new URL(value); } catch { refuse('authority', 'the provider returned an invalid URL'); }
	if (!(url.protocol === 'https:' || allowHTTP && url.protocol === 'http:') || url.origin !== origin || url.username || url.password || url.hash) refuse('authority', 'the request is outside the pinned provider authority');
	return url;
}
export async function untilAbort(signal, run) {
	if (signal.aborted) throw fail('cancelled', 'sync is paused; local work is kept');
	let stop;
	const aborted = new Promise((_, reject) => { stop = () => reject(fail('cancelled', 'sync is paused; local work is kept')); signal.addEventListener('abort', stop, {once: true}); });
	try { return await Promise.race([Promise.resolve().then(() => { if (signal.aborted) throw fail('cancelled', 'sync is paused; local work is kept'); return run(); }), aborted]); }
	finally { signal.removeEventListener('abort', stop); }
}
const td = new TextDecoder('utf-8', {fatal: true});
export function jsonBody(response) {
	try { return JSON.parse(td.decode(response.bytes)); }
	catch { refuse('response', 'the provider returned unreadable JSON; nothing was acknowledged'); }
}
export function providerError(provider, response, code = 'provider') {
	let data;
	try { data = JSON.parse(td.decode(response.bytes)); } catch {}
	const own = data?.error_description || data?.error_summary || data?.error?.message || (typeof data?.error === 'string' ? data.error : '');
	let text = own;
	if (!text) { try { text = td.decode(response.bytes); } catch {} }
	return fail(code, `${provider} refused the request (HTTP ${response.status})${text ? ': ' + String(text).slice(0, 4096) : ''}`, {status: response.status});
}
export function retryAfter(response, bodySeconds) {
	const header = response.headers.get('retry-after');
	let ms = 0;
	if (header != null) {
		if (/^\d+(?:\.\d+)?$/.test(header.trim())) ms = Number(header) * 1000;
		else { const at = Date.parse(header); if (Number.isFinite(at)) ms = Math.max(0, at - Date.now()); }
	}
	if (typeof bodySeconds === 'number' && Number.isFinite(bodySeconds) && bodySeconds >= 0) ms = Math.max(ms, bodySeconds * 1000);
	return Math.ceil(ms);
}
export function createHTTP(options = {}) {
	publicOptions(options);
	const {fetch: fetchFn, signal} = options;
	if (typeof fetchFn !== 'function') refuse('fetch', 'an injected companion fetch is required');
	const timeoutMs = options.timeoutMs ?? 30000;
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) refuse('config', 'request deadline must be between 1 and 300000 milliseconds');
	const lifetime = new AbortController(), active = new Set();
	const check = () => { if (lifetime.signal.aborted || signal?.aborted) refuse('cancelled', 'sync is paused; local work and queued ciphertext are kept'); };
	function pause() { lifetime.abort(); for (const controller of active) controller.abort(); }
	async function wait(ms) {
		check();
		const controller = new AbortController(), stop = () => controller.abort();
		lifetime.signal.addEventListener('abort', stop, {once: true}); signal?.addEventListener('abort', stop, {once: true});
		let timer;
		try { await untilAbort(controller.signal, () => options.wait ? options.wait(ms) : new Promise(resolve => { timer = setTimeout(resolve, ms); })); }
		finally { clearTimeout(timer); lifetime.signal.removeEventListener('abort', stop); signal?.removeEventListener('abort', stop); }
		check();
	}
	// prepare runs inside the same deadline as fetch and its body. No redirect is followed here; WebDAV validates each hop itself. allowHTTP only after LAN admission.
	async function request(url, {origin, method = 'GET', headers = {}, body, maxBytes = 4 * 1024 * 1024,
		resume308 = false, exactTarget = false, identityOnly = false, allowHTTP = false,
		manualRedirects = false, prepare, inspect, deadlineAt} = {}) {
		check(); const target = pinnedURL(url, origin, allowHTTP);
		if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) refuse('config', 'a complete response byte budget is required');
		const controller = new AbortController(), stop = () => controller.abort();
		active.add(controller); signal?.addEventListener('abort', stop, {once: true});
		let expired = false, reader, response, attempted = false;
		const remaining = deadlineAt === undefined ? timeoutMs : Math.min(timeoutMs, deadlineAt - Date.now());
		const timer = setTimeout(() => { expired = true; controller.abort(); }, Math.max(0, remaining));
		try {
			if (remaining <= 0) { expired = true; controller.abort(); }
			const prepared = prepare ? await untilAbort(controller.signal, () => prepare(controller.signal)) : {};
			// identityOnly certifies bytes by Content-Length, so it asks for no compression (a browser may drop the
			// forbidden header; a response still encoded is refused below).
			const outgoing = {...headers, ...prepared};
			if (identityOnly) { delete outgoing['Accept-Encoding']; outgoing['accept-encoding'] = 'identity'; }
			response = await untilAbort(controller.signal, async () => {
				attempted = true;
				const received = await fetchFn(url, {method, headers: outgoing, body, signal: controller.signal,
					redirect: manualRedirects ? 'manual' : 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer'});
				// A client which ignores AbortSignal can resolve after this request already ended.
				// Release that late body here: the request's finally cannot see it any more.
				if (controller.signal.aborted) { try { void received?.body?.cancel().catch(() => {}); } catch {} }
				return received;
			});
			let targetOK = !response?.url;
			try { if (response?.url) { const observed = new URL(response.url); targetOK = exactTarget ? observed.href === target.href : observed.origin === origin; } } catch { targetOK = false; }
			if (!response || response.redirected || response.type === 'opaqueredirect' || !targetOK ||
				(response.status >= 300 && response.status < 400 && !manualRedirects && !(resume308 && response.status === 308 && !response.headers?.get('location')))) {
				refuse('redirect', 'the provider redirected or changed the target; credentials were not forwarded');
			}
			if (!Number.isInteger(response.status) || response.status < 200 || response.status > 599) refuse('response', 'the provider returned no readable HTTP response');
			const read = inspect ? inspect(response) !== false : true;
			if (!read || method === 'HEAD') return {status: response.status, headers: response.headers, bytes: new Uint8Array()};
			const cap = response.status >= 400 ? 64 * 1024 : maxBytes;
			const declared = response.headers.get('content-length');
			// Fetch may decode Content-Encoding. Only identity lengths describe the bytes we read.
			const identity = !response.headers.get('content-encoding') || response.headers.get('content-encoding') === 'identity';
			if (identityOnly && !identity) refuse('response', 'encoded response bytes cannot certify an opaque object');
			if (declared != null && identity && byteCount(declared) > cap) refuse('too_large', 'the complete response exceeds its byte budget; nothing was truncated');
			const chunks = []; let count = 0;
			if (response.body) {
				if (typeof response.body.getReader !== 'function') refuse('response', 'a bounded response stream is required');
				reader = response.body.getReader();
				while (true) {
					const {done, value} = await untilAbort(controller.signal, () => reader.read());
					if (done) break;
					const bytes = asBytes(value); count += bytes.length;
					if (count > cap) refuse('too_large', 'the complete response exceeds its byte budget; nothing was truncated');
					chunks.push(bytes.slice());
				}
			}
			if (declared != null && identity && count !== byteCount(declared)) refuse('response', 'the response body was incomplete');
			const bytes = new Uint8Array(count); let at = 0;
			for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
			check();
			return {status: response.status, headers: response.headers, bytes};
		} catch (error) {
			if (reader) void reader.cancel().catch(() => {});
			check();
			if (expired) throw fail('timeout', 'the request exceeded its deadline; its outcome is unconfirmed');
			if (isProviderRefusal(error)) throw error;
			throw fail('network', 'the network request failed; its outcome is unconfirmed', {unanswered: attempted && !response});
		} finally {
			clearTimeout(timer); signal?.removeEventListener('abort', stop); active.delete(controller);
			try { reader?.releaseLock(); } catch {}
			if (response?.body && !response.body.locked) { try { void response.body.cancel().catch(() => {}); } catch {} }
		}
	}
	// Provider wrappers classify HTTP statuses. OAuth never calls this: a consumed code or a
	// rotating refresh token must not be retried blindly. Stop rather than shorten a long throttle.
	async function retry(run, classify, safe = true, backoff = attempt => Math.min(32000, 1000 * 2 ** attempt + Math.floor(Math.random() * 1000))) {
		for (let attempt = 0; ; attempt++) {
			check(); let error, delay = 0;
			try {
				const response = await run(), refusal = classify(response);
				if (!refusal) return response;
				({error, delay = 0} = refusal);
			} catch (caught) { if (!['network', 'timeout'].includes(caught?.code)) throw caught; error = caught; }
			if (!safe || attempt === 4 || delay > 60000) { if (delay) error.retryAfterMs = delay; throw error; }
			await wait(Math.max(delay, backoff(attempt)));
		}
	}
	return Object.freeze({request, retry, wait, check, pause});
}
