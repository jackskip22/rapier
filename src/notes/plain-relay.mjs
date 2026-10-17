// SPDX-License-Identifier: AGPL-3.0-only
export const RELAY_PAGE = '/plain-storage.html';
const fail = (code, message) => Object.assign(new Error(message), {code});
const NULL_BODY = new Set([101, 103, 204, 205, 304]);

export function createPlainRelay({document, window, origin, timeoutMs = 15000} = {}) {
	if (!document?.createElement || typeof window?.addEventListener !== 'function' || !/^https:\/\//.test(origin || '')) throw fail('unavailable', 'plain files on webdav or s3 need rapier.website.');
	const frames = new Map(), answers = new Map(), ready = new Map();
	let sequence = 0;
	window.addEventListener('message', event => {
		const data = event.data;
		if (event.origin !== origin || !data || typeof data !== 'object') return;
		if (data.type === 'rapier-plain-storage-ready') { for (const [frame, done] of ready) if (frame.contentWindow === event.source && data.target === frame.dataset.target) { ready.delete(frame); done(); } return; }
		if (data.type !== 'rapier-plain-storage-answer') return;
		const waiting = answers.get(data.id);
		if (waiting && waiting.frame.contentWindow === event.source) { answers.delete(data.id); waiting.resolve(data); }
	});
	function frameFor(target) {
		if (!frames.has(target)) frames.set(target, new Promise((resolve, reject) => {
			const frame = document.createElement('iframe');
			frame.hidden = true; frame.title = ''; frame.setAttribute('aria-hidden', 'true'); frame.dataset.target = target;
			const timer = setTimeout(() => { ready.delete(frame); frame.remove(); frames.delete(target); reject(fail('relay', 'the storage page did not open; try again on rapier.website.')); }, timeoutMs);
			ready.set(frame, () => { clearTimeout(timer); resolve(frame); });
			frame.src = RELAY_PAGE + '#' + encodeURIComponent(target);
			document.body.append(frame);
		}));
		return frames.get(target);
	}
	return async function relayFetch(url, init = {}) {
		const address = new URL(String(url)), frame = await frameFor(address.origin), id = ++sequence;
		let body = init.body;
		if (typeof body === 'string') body = new TextEncoder().encode(body);
		const buffer = body == null ? null : body instanceof ArrayBuffer ? body.slice(0) : new Uint8Array(body.buffer, body.byteOffset, body.byteLength).slice().buffer;
		const answer = await new Promise((resolve, reject) => {
			const signal = init.signal;
			if (signal?.aborted) { reject(new DOMException('The request was aborted.', 'AbortError')); return; }
			const abort = () => { answers.delete(id); reject(new DOMException('The request was aborted.', 'AbortError')); };
			signal?.addEventListener('abort', abort, {once: true});
			answers.set(id, {frame, resolve: value => { signal?.removeEventListener('abort', abort); resolve(value); }});
			frame.contentWindow.postMessage({type: 'rapier-plain-storage-fetch', id, url: address.href, method: init.method || 'GET',
				headers: {...(init.headers || {})}, body: buffer, redirect: init.redirect}, origin, buffer ? [buffer] : []);
		});
		if (answer.failed) throw new TypeError('Failed to fetch');
		if (answer.kind === 'opaqueredirect') return Object.freeze({status: 0, type: 'opaqueredirect', redirected: false, url: '', headers: new Headers(), body: null});
		return new Response(NULL_BODY.has(answer.status) ? null : answer.body, {status: answer.status, headers: answer.headers});
	};
}
