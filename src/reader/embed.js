// SPDX-License-Identifier: AGPL-3.0-only
// The reader's side of the embed contract (docs/embed-contract.md, "The reader build"): the host connects over a MessagePort, grants
// at most `open` and `changes`, loads documents, sets the theme and restyles the frame. The envelope, the request ledger and the
// validation are the editor's own functions, linked in from editor/engine.js; this file keeps the connection and the three commands.

const _rapierEmbedFramed = window.self !== window.top;
const _rapierEmbedMode = !_rapierEmbedFramed ? 'top' : new URLSearchParams(location.search).get('embed') === '1' ? 'host' : _rapierHasSameOriginParent() ? 'local' : 'refused';
const _rapierEmbed = {
	framed: _rapierEmbedFramed, local: _rapierEmbedMode === 'local', active: _rapierEmbedMode === 'host', refused: _rapierEmbedMode === 'refused',
	ready: false, heldConnect: null, connected: false, loaded: false, loading: false, loadToken: 0,
	port: null, portGeneration: 0, hostOrigin: '', sessionId: '', documentId: '', baseRevision: null,
	capabilities: null, settings: null, readyTimer: null, stateSignature: '', requestLedger: new Map(),
};
// The reader grants nothing beyond these two.
const READER_GRANTS = ['open', 'changes'];
const READER_FEATURES = ['find', 'readAloud', 'share'];
const READER_STYLE_LIMIT = 4 * 1024 * 1024;

function readerPublishState() {
	if (!_rapierEmbed.connected || !_rapierEmbed.capabilities?.includes('changes')) { _rapierEmbed.stateSignature = ''; return; }
	const state = {loaded: _rapierEmbed.loaded, dirty: false, saving: false, closing: false, readOnly: true, filename: reader.filename, docKind: reader.docKind};
	const signature = JSON.stringify(state);
	if (signature === _rapierEmbed.stateSignature) return;
	if (_rapierEmbedPost('document-state', state)) _rapierEmbed.stateSignature = signature;
}

function readerEmbedListen() {
	const early = globalThis.RapierEarlyConnects?.take?.() || [];
	if (!_rapierEmbed.active) return;
	addEventListener('message', readerEmbedConnect);
	for (const event of early) readerEmbedConnect(event);
}

function readerEmbedConnect(event) {
	if (!_rapierEmbed.active || event.source !== window.parent || _rapierAdmitParentOrigin(event.origin) !== event.origin ||
			(_rapierEmbed.hostOrigin && event.origin !== _rapierEmbed.hostOrigin)) return;
	const data = event.data;
	if (!data || typeof data !== 'object' || Array.isArray(data) || data.type !== 'rapier-connect') return;
	if (Object.keys(data).some(key => !['type', 'sessionId', 'documentId', 'capabilities', 'theme', 'contract', 'settings', 'agent'].includes(key))) return;
	const refuse = (code, extra = {}) => {
		try {
			event.ports[0].postMessage({type: 'protocol-error', sessionId: data.sessionId, documentId: data.documentId, requestId: null, baseRevision: null, payload: {code, ...extra}});
			event.ports[0].close();
		} catch (_) {}
	};
	const CONTRACT = 1;
	if (data.contract !== undefined && data.contract !== CONTRACT) { refuse('contract_unsupported', {speaks: [CONTRACT]}); return; }
	if (data.theme !== undefined && !_rapierEmbedValidTheme(data.theme)) return;
	const offered = data.capabilities === undefined ? [] : data.capabilities;
	if (!Array.isArray(offered) || offered.length > READER_GRANTS.length || new Set(offered).size !== offered.length || offered.some(name => !READER_GRANTS.includes(name))) { refuse('capabilities_invalid'); return; }
	let settings;
	try {
		settings = globalThis.RapierEmbedContract.normalizeSettings(data.settings, {
			features: globalThis.RapierEmbedContract.FEATURES.filter(name => READER_FEATURES.includes(name)),
			accents: PREFERENCE_ACCENTS.map(preset => preset.name),
			limits: {documentBytes: RapierTextCodec.maxDocumentBytes, pictureBytes: 16 * 1024 * 1024},
		});
	} catch (error) { refuse(error.code || 'settings_invalid'); return; }
	if (_rapierEmbed.settings && JSON.stringify(_rapierEmbed.settings) !== JSON.stringify(settings)) { refuse('settings_changed'); return; }
	const capabilities = Object.freeze(READER_GRANTS.filter(name => offered.includes(name)));
	if (_rapierEmbed.capabilities && JSON.stringify(_rapierEmbed.capabilities) !== JSON.stringify(capabilities)) { refuse('capabilities_changed'); return; }
	if (typeof data.sessionId !== 'string' || !data.sessionId || data.sessionId.length > 256 || typeof data.documentId !== 'string' || !data.documentId || data.documentId.length > 256) return;
	const port = event.ports?.length === 1 ? event.ports[0] : null;
	if (!port) return;
	// A connect that comes before the frame is ready is held, and taken when it is.
	if (!_rapierEmbed.ready) {
		if (!_rapierEmbed.heldConnect) _rapierEmbed.heldConnect = event; else try { port.close(); } catch (_) {}
		return;
	}
	if (_rapierEmbed.loaded && (data.sessionId !== _rapierEmbed.sessionId || data.documentId !== _rapierEmbed.documentId)) { try { port.close(); } catch (_) {} return; }
	const previous = _rapierEmbed.port;
	if (previous && previous !== port) {
		if (_rapierEmbed.loading) { try { port.close(); } catch (_) {} return; }
		try { previous.close(); } catch (_) {}
	}
	const generation = ++_rapierEmbed.portGeneration;
	Object.assign(_rapierEmbed, {capabilities, hostOrigin: event.origin, sessionId: data.sessionId, documentId: data.documentId, port, connected: true, requestLedger: new Map()});
	if (!_rapierEmbed.settings) {
		_rapierEmbed.settings = settings;
		document.documentElement.setAttribute('data-rapier-host-features', settings.features.join(' '));
		document.documentElement.lang = settings.language;
		if (settings.palette) reader.hostAccent = settings.palette.accent;
	}
	if (data.theme !== undefined) reader.hostTheme = data.theme;
	readerApplyView();
	readerRenderSettings();
	clearTimeout(_rapierEmbed.readyTimer);
	port.addEventListener('message', message => readerEmbedMessage(message, port, generation));
	port.addEventListener('messageerror', () => {
		if (port !== _rapierEmbed.port || generation !== _rapierEmbed.portGeneration) return;
		try { port.close(); } catch (_) {}
		_rapierEmbed.connected = false;
		_rapierEmbed.port = null;
	});
	port.start();
	_rapierEmbedPost('connected', {appVersion: READER_VERSION || '0.0.0', contract: CONTRACT, capabilities, settings: _rapierEmbed.settings});
	_rapierEmbed.stateSignature = '';
	readerPublishState();
}

function readerEmbedMessage(event, port, generation) {
	if (port !== _rapierEmbed.port || generation !== _rapierEmbed.portGeneration) return;
	const data = event && event.data;
	if (!_rapierEmbedValidEnvelope(data)) return;
	if (data.type === 'style') { readerHostStyle(data); return; }
	if (!RAPIER_EMBED_KNOWN_TYPES.has(data.type) && !['asset-ack', 'asset-nack'].includes(data.type)) {
		_rapierEmbedPost('protocol-error', {reason: 'unrecognized message type'}, data.requestId);
		return;
	}
	const required = {load: 'open', compare: 'compare', save: 'read', 'save-ack': 'read', 'save-nack': 'read', close: 'close', 'close-decision': 'close', 'asset-ack': 'assets', 'asset-nack': 'assets'}[data.type];
	if (required && !_rapierEmbed.capabilities?.includes(required)) {
		_rapierEmbedPost('protocol-error', {code: 'capability_denied', capability: required}, data.requestId);
		return;
	}
	const payload = data.payload || {};
	const fields = {load: ['content', 'filename', 'revision', 'readOnly', 'title'], disconnect: [], theme: ['theme']}[data.type];
	const text = (key, max) => payload[key] === undefined || typeof payload[key] === 'string' && payload[key].length <= max;
	const valid = fields && Object.keys(payload).every(key => fields.includes(key)) && text('filename', RAPIER_EMBED_FILENAME_MAX_CHARS) && text('title', 240)
		&& (data.type !== 'load' || typeof payload.content === 'string' && _rapierEmbedValidRevision(payload.revision ?? data.baseRevision))
		&& (payload.readOnly === undefined || typeof payload.readOnly === 'boolean')
		&& (data.type !== 'theme' || _rapierEmbedValidTheme(payload.theme));
	if (!valid) {
		_rapierEmbedPost('protocol-error', {code: 'invalid_payload', reason: 'malformed ' + data.type + ' payload'}, data.requestId);
		return;
	}
	if (data.type === 'theme') { reader.hostTheme = payload.theme; readerApplyView(); readerRenderSettings(); return; }
	if (data.type === 'load') { void readerEmbedLoad(data); return; }
	if (data.type === 'disconnect') {
		try { port.close(); } catch (_) {}
		_rapierEmbed.connected = false;
		if (_rapierEmbed.port === port) _rapierEmbed.port = null;
	}
}

// A load answers once, however often the host repeats its request id: the first answer is replayed to an identical repeat, and a
// repeat with a different payload is refused.
async function readerEmbedLoad(data) {
	if (!_rapierEmbedValidRequestId(data.requestId)) return;
	const admitted = _rapierEmbedLedgerAdmit('load', data);
	if (admitted.outcome === 'conflict') { _rapierEmbedPost('protocol-error', {reason: 'load reused a request id with a different payload'}, data.requestId); return; }
	if (admitted.outcome === 'saturated') { _rapierEmbedPost('protocol-error', {reason: 'load arrived while every request this connection remembers is still pending'}, data.requestId); return; }
	if (admitted.outcome === 'replay' || admitted.outcome === 'join') {
		const answered = admitted.outcome === 'replay' ? admitted.entry : await admitted.entry.promise;
		if (answered && answered.type) _rapierEmbedPost(answered.type, answered.payload, data.requestId);
		return;
	}
	const entry = admitted.entry;
	const respond = (type, payload) => { _rapierEmbedLedgerSettle(entry, type, payload); _rapierEmbedPost(type, payload, data.requestId); };
	try { await readerEmbedLoadRun(data, respond); } finally { _rapierEmbedLedgerSettle(entry, null, null); }
}

async function readerEmbedLoadRun(data, respond) {
	if (_rapierEmbed.loading) { respond('load-nack', {reason: 'another document is still loading'}); return; }
	const payload = data.payload || {};
	const revision = payload.revision == null ? data.baseRevision : payload.revision;
	if (typeof payload.content !== 'string' || !_rapierEmbedValidRevision(revision)) { respond('load-nack', {reason: 'invalid document payload'}); return; }
	const limit = _rapierEmbed.settings?.limits.documentBytes || RapierTextCodec.maxDocumentBytes;
	if (new Blob([payload.content]).size > limit) { respond('load-nack', {code: 'document_too_large', limit}); return; }
	let content;
	try { content = RapierTextCodec.normalizeProtocol(payload.content); } catch (_) { respond('load-nack', {reason: 'invalid document payload'}); return; }
	const filename = typeof payload.filename === 'string' && payload.filename.trim() ? payload.filename : 'document.md';
	if (filename.length > RAPIER_EMBED_FILENAME_MAX_CHARS || !_rapierDocumentNameIsAdmissible(filename)) { respond('load-nack', {reason: 'invalid document filename'}); return; }
	const operation = ++_rapierEmbed.loadToken;
	_rapierEmbed.loading = true;
	try {
		const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title.trim().slice(0, 240) : '';
		const shown = await readerLoad(content, filename, title);
		if (operation !== _rapierEmbed.loadToken) return;
		if (!shown) { respond('load-nack', {reason: 'a newer document replaced the host load'}); return; }
		_rapierEmbed.baseRevision = revision;
		_rapierEmbed.loaded = true;
		respond('load-ack', {revision, recoveredDraft: false, readOnly: true});
	} catch (error) {
		try { console.warn('[rapier-embed] document load failed', error); } catch (_) {}
		respond('load-nack', {reason: 'document could not be loaded'});
	} finally {
		if (operation === _rapierEmbed.loadToken) { _rapierEmbed.loading = false; readerPublishState(); }
	}
}

// `style` restyles the frame, never the document: a stylesheet placed after the reader's own, and faces for FontFace. The page
// asks the network for none; its policy admits data: faces only.
function readerHostStyle(data) {
	const payload = data.payload || {}, fonts = payload.fonts === undefined ? [] : payload.fonts;
	const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;
	const face = row => row && typeof row === 'object' && !Array.isArray(row) && Object.keys(row).every(key => ['family', 'source', 'descriptors'].includes(key)) && text(row.family, 256) &&
		(text(row.source, READER_STYLE_LIMIT) || row.source instanceof ArrayBuffer || ArrayBuffer.isView(row.source)) &&
		(row.descriptors === undefined || row.descriptors && typeof row.descriptors === 'object' && !Array.isArray(row.descriptors) && Object.values(row.descriptors).every(value => text(value, 256)));
	const valid = Object.keys(payload).every(key => ['css', 'fonts'].includes(key)) && (payload.css === undefined || typeof payload.css === 'string' && payload.css.length <= READER_STYLE_LIMIT) &&
		Array.isArray(fonts) && fonts.length <= 16 && fonts.every(face);
	if (!valid) { _rapierEmbedPost('protocol-error', {code: 'invalid_payload', reason: 'malformed style payload'}, data.requestId); return; }
	if (payload.css !== undefined) {
		let sheet = $('rapier-host-style');
		if (!sheet) { sheet = document.createElement('style'); sheet.id = 'rapier-host-style'; document.head.append(sheet); }
		sheet.textContent = payload.css;
		readerApplyView();
		readerRenderSettings();
	}
	for (const row of fonts) {
		const failed = error => _rapierEmbedPost('protocol-error', {code: 'font_invalid', reason: String(error?.message || error).slice(0, 500)}, data.requestId);
		try {
			const loaded = new FontFace(row.family, row.source, row.descriptors || {});
			document.fonts.add(loaded);
			loaded.load().catch(failed);
		} catch (error) { failed(error); }
	}
}

function _rapierEmbedStart() {
	readerEmbedListen();
	if (_rapierEmbed.refused) { $('embed-refused').hidden = false; return; }
	if (!_rapierEmbed.active) return;
	// The frame announces itself until a host connects, further apart each time; a connect held until now is taken first.
	_rapierEmbed.ready = true;
	const held = _rapierEmbed.heldConnect;
	_rapierEmbed.heldConnect = null;
	if (held) readerEmbedConnect(held);
	clearTimeout(_rapierEmbed.readyTimer);
	let delay = 250;
	const announce = () => {
		if (_rapierEmbed.connected) return;
		window.parent.postMessage({type: 'rapier-ready'}, _rapierEmbed.hostOrigin || '*');
		_rapierEmbed.readyTimer = setTimeout(announce, delay);
		delay = Math.min(delay * 2, 8000);
	};
	announce();
}
