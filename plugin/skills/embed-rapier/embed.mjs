// SPDX-License-Identifier: MIT
// Host side of docs/embed-contract.md. The host keeps the document; this module stores nothing.
// A repeated requestId gets the remembered answer, never a second write.

const CAPABILITIES = ['open', 'read', 'changes', 'compare', 'close', 'agent'];

export function connectRapier(iframe, options) {
	const {sessionId, documentId, store, capabilities = ['open', 'read'], theme, onClose, onState, onError,
		origin = new URL(iframe.src, globalThis.location?.href).origin, onConnected} = options;
	if (typeof sessionId !== 'string' || !sessionId || typeof documentId !== 'string' || !documentId) throw new TypeError('sessionId and documentId are nonempty strings');
	if (!Array.isArray(capabilities) || capabilities.some(name => !CAPABILITIES.includes(name))) throw new TypeError('capabilities is a list from ' + CAPABILITIES.join(', '));
	if (capabilities.includes('read') && typeof store?.write !== 'function') throw new TypeError('read needs store.write(requestId, content, baseRevision) -> {revision} or {conflict: true, currentRevision}');
	const ids = {sessionId, documentId};
	const answered = new Map(), waiting = new Map();
	// save() waits on the frame's own save-request, not the command id the helper just minted.
	const commandWaiters = {save: []};
	let port = null, posted = false, connected = false, seq = 0;
	const listeners = new Map();

	const emit = (type, message) => { for (const fn of listeners.get(type) || []) fn(message); };
	const fail = error => { emit('error', error); if (onError) onError(error); };
	const sameFrame = event => event.source === iframe.contentWindow && event.origin === origin;

	function send(type, payload, baseRevision, quiet) {
		if (!port || !connected) return Promise.reject(new Error('not connected'));
		const requestId = 'h' + (++seq) + '-' + Math.random().toString(36).slice(2, 10);
		const message = {type, ...ids, requestId, ...(baseRevision !== undefined ? {baseRevision} : {}), ...(payload ? {payload} : {})};
		// Theme is painted and not answered. A refusal has this requestId and reaches onError below.
		if (quiet) {
			try { port.postMessage(message); } catch (error) { return Promise.reject(error); }
			return Promise.resolve();
		}
		return new Promise((resolve, reject) => {
			waiting.set(requestId, {resolve, reject, type});
			try { port.postMessage(message); } catch (error) { waiting.delete(requestId); reject(error); }
		});
	}

	// Drop the command's own waiter once the frame has answered it by another id, so it cannot hang.
	function releaseCommand(type) {
		for (const [requestId, pending] of waiting) {
			if (pending.type !== type) continue;
			waiting.delete(requestId);
			pending.resolve();
			return;
		}
	}

	async function answerSave(message) {
		const {requestId, baseRevision} = message;
		// The answer is held from the moment storage starts: a Retry while it is pending shares the one write.
		if (!answered.has(requestId)) {
			const job = (async () => {
				let reply;
				try {
					const outcome = await store.write(requestId, message.payload?.content ?? '', baseRevision, message.payload);
					reply = outcome && outcome.conflict
						? {type: 'save-nack', payload: {code: 'conflict', ...(outcome.currentRevision !== undefined ? {currentRevision: outcome.currentRevision} : {})}}
						: {type: 'save-ack', payload: {revision: outcome.revision}};
				} catch (error) {
					reply = {type: 'save-nack', payload: {code: 'failed', reason: String(error?.message || error).slice(0, 500)}};
				}
				return {...ids, requestId, baseRevision, ...reply};
			})();
			answered.set(requestId, job);
			// The host's save() is settled by this save-request, which carries the frame's id, not the command's.
			job.then(reply => {
				const slot = commandWaiters.save.shift();
				if (!slot) return;
				releaseCommand('save');
				if (reply.type === 'save-ack') slot.resolve(reply.payload);
				else slot.reject(Object.assign(new Error(reply.payload?.reason || reply.payload?.code || 'refused'), {code: reply.payload?.code, payload: reply.payload}));
			}, () => {});
		}
		port.postMessage(await answered.get(requestId));
	}

	function onPortMessage(event) {
		const message = event.data;
		if (!message || typeof message !== 'object' || message.sessionId !== sessionId || message.documentId !== documentId) return;
		const pending = message.requestId ? waiting.get(message.requestId) : null;
		switch (message.type) {
			case 'connected':
				connected = true;
				emit('connected', message.payload);
				if (onConnected) onConnected(message.payload);
				return;
			case 'save-request': answerSave(message).catch(fail); return;
			case 'document-state': emit('state', message.payload); if (onState) onState(message.payload); return;
			case 'close-request': {
				const decide = decision => port.postMessage({type: 'close-decision', ...ids, requestId: message.requestId, baseRevision: message.baseRevision, payload: {decision}});
				const dirty = !!message.payload?.dirty;
				Promise.resolve(onClose ? onClose({dirty}) : (dirty ? 'save' : 'discard')).then(decide, fail);
				emit('close-request', message.payload);
				return;
			}
			case 'close-ready': emit('closed', message.payload); if (pending) { waiting.delete(message.requestId); pending.resolve(message.payload); } return;
			case 'protocol-error':
				if (pending) { waiting.delete(message.requestId); pending.reject(Object.assign(new Error(message.payload?.reason || message.payload?.code || 'refused'), {code: message.payload?.code, payload: message.payload})); }
				else fail(Object.assign(new Error(message.payload?.reason || message.payload?.code || 'refused'), {code: message.payload?.code, payload: message.payload}));
				return;
			default:
				if (pending) { waiting.delete(message.requestId); pending.resolve(message.payload); }
				else emit(message.type, message.payload);
		}
	}

	function connect() {
		if (posted) return;
		posted = true;
		const channel = new MessageChannel();
		port = channel.port1;
		port.onmessage = onPortMessage;
		iframe.contentWindow.postMessage({type: 'rapier-connect', ...ids, capabilities, ...(theme ? {theme} : {})}, origin, [channel.port2]);
	}

	function onWindowMessage(event) {
		if (!sameFrame(event)) return;
		const message = event.data;
		if (message?.type === 'rapier-ready' && !posted) connect();
		else if (message?.type === 'close-ready' && message.sessionId === sessionId && message.documentId === documentId) emit('closed', message.payload);
	}

	globalThis.addEventListener?.('message', onWindowMessage);
	iframe.addEventListener('load', connect);

	return Object.freeze({
		get connected() { return connected; },
		load: (content, {filename, revision = 1, readOnly, title} = {}) => send('load', {content, ...(filename ? {filename} : {}), revision, ...(readOnly !== undefined ? {readOnly} : {}), ...(title ? {title} : {})}, null),
		save() {
			const posted = send('save');
			return new Promise((resolve, reject) => {
				let settled = false;
				const slot = {
					resolve: value => { if (settled) return; settled = true; resolve(value); },
					reject: error => { if (settled) return; settled = true; reject(error); },
				};
				commandWaiters.save.push(slot);
				posted.catch(error => {
					const index = commandWaiters.save.indexOf(slot);
					if (index >= 0) commandWaiters.save.splice(index, 1);
					slot.reject(error);
				});
			});
		},
		compare: (content, {filename} = {}) => send('compare', {content, ...(filename ? {filename} : {})}),
		close() {
			const posted = send('close');
			return new Promise((resolve, reject) => {
				let settled = false;
				const finish = payload => {
					if (settled) return;
					settled = true;
					listeners.get('closed')?.delete(finish);
					releaseCommand('close');
					resolve(payload);
				};
				if (!listeners.has('closed')) listeners.set('closed', new Set());
				listeners.get('closed').add(finish);
				posted.catch(error => {
					if (settled) return;
					settled = true;
					listeners.get('closed')?.delete(finish);
					reject(error);
				});
			});
		},
		theme: value => send('theme', {theme: value}, undefined, true),
		disconnect() {
			send('disconnect').catch(() => {});
			globalThis.removeEventListener?.('message', onWindowMessage);
			iframe.removeEventListener('load', connect);
			try { port?.close(); } catch (_) {}
			port = null; connected = false; posted = false;
		},
		on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); },
	});
}

export function memoryStore(initial = {revision: 0, content: ''}) {
	const state = {...initial};
	return {
		get revision() { return state.revision; },
		get content() { return state.content; },
		async write(requestId, content, baseRevision) {
			if (baseRevision !== null && baseRevision !== undefined && baseRevision !== state.revision) return {conflict: true, currentRevision: state.revision};
			state.content = content;
			state.revision = (typeof state.revision === 'number' ? state.revision : 0) + 1;
			return {revision: state.revision};
		},
	};
}
