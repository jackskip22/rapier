// Text in pictures: the shared local reader, optional files and prompt for every profile.
// The worker receives verified runtime files and picture pixels. Its network is closed.
// Cached words and boxes stay on this device, addressed by the encoded picture's SHA-256.
const _rapierOcr = {
	provider: null, reader: null, cache: null, bound: false, dismissed: false,
	input: 0, pointers: new Set(), composing: false, turn: 0, readings: new Map(), readingsStore: null, clearing: Promise.resolve(),
};
const RAPIER_OCR_MAX_SIDE = 2048;
function _rapierOcrModule() { return globalThis.RapierOcr; }
function _rapierOcrProvider() { _rapierOcrSetup(); return _rapierOcr.provider; }
function _rapierOcrLive() { return _rapierOcr.provider?.status === 'ready'; }
function _rapierOcrBusy() { return _rapierOcr.composing || _rapierOcr.pointers.size > 0 || Date.now() - _rapierOcr.input < 1500; }
// A displayed SVG may be recoloured, and an unreadable JPEG XL may be a placeholder. Read the authored asset instead.
function _rapierOcrImageUrl(image, index) {
	const key = image.getAttribute('data-rapier-asset') || image.getAttribute('data-rapier-image-url');
	if (!key) return image.currentSrc || image.src || '';
	const source = _rapierEmbedAssetSource(key) || key;
	if (/^(?:data:image\/|blob:|https?:\/\/)/i.test(source)) return source;
	index ||= RapierImageAssets.documentAssets(_rapierSourceText());
	const label = RapierImageAssets.normalizeLabel(source);
	return index.assets.get(label)?.url || index.references[label]?.href || '';
}
async function _rapierOcrIdle(current) {
	while (current() && (document.hidden || _rapierOcrBusy())) await new Promise(resolve => setTimeout(resolve, 250));
	return current();
}
// The store holds each file gzip-compressed where the browser can (the device keeps about the download's size, not the
// runtime's twenty megabytes); a value that does not begin with gzip's mark is held as it came.
async function _rapierOcrStream(bytes, transform) {
	return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(transform)).arrayBuffer());
}
function _rapierOcrPack(bytes) { return typeof CompressionStream === 'function' ? _rapierOcrStream(bytes, new CompressionStream('gzip')) : bytes; }
async function _rapierOcrUnpack(value) {
	const bytes = RapierBundleIO.bytes(value);
	return bytes && bytes[0] === 0x1f && bytes[1] === 0x8b && typeof DecompressionStream === 'function' ? _rapierOcrStream(bytes, new DecompressionStream('gzip')) : bytes;
}
// The worker, from the module's own source (a blob, as the page's other workers are): its network is shut before the
// runtime loads, it takes the verified bytes and a picture's pixels by message, and gives back only lines.
function _rapierOcrWorker() {
	const url = URL.createObjectURL(new Blob([_rapierOcrModule().ocrWorkerSource()], {type: 'text/javascript'}));
	const worker = new Worker(url, {type: 'module', name: 'rapier-text-in-pictures'});
	URL.revokeObjectURL(url);
	const waiting = new Map();
	let serial = 0, stopped = null;
	const fail = error => { stopped = error; for (const [, w] of waiting) w.reject(error); waiting.clear(); worker.terminate(); };
	worker.onmessage = event => { const w = waiting.get(event.data?.id); if (!w) return; waiting.delete(event.data.id); if (event.data.ok) w.resolve(event.data); else w.reject(new Error(event.data.error || 'The text reader failed')); };
	worker.onerror = event => { event.preventDefault?.(); fail(new Error(event.message || 'The text reader stopped')); };
	worker.onmessageerror = () => fail(new Error('The text reader returned an unreadable result'));
	return {
		post(message, transfer) { const id = ++serial; return new Promise((resolve, reject) => {
			if (stopped) { reject(stopped); return; }
			waiting.set(id, {resolve, reject});
			try { worker.postMessage({...message, id}, transfer || []); } catch (error) { waiting.delete(id); reject(error); }
		}); },
		terminate() { fail(new Error('The text reader was closed')); },
	};
}
function _rapierOcrReadings() {
	return _rapierOcr.readingsStore ||= RapierBundleIO.store(RapierStorage.optional.ocrReadingsDb, 'readings');
}
function _rapierOcrSetup() {
	const state = _rapierOcr, M = _rapierOcrModule();
	if (state.provider || !M || typeof _rapierProviders !== 'object' || typeof RapierBundleIO !== 'object' || !globalThis.RapierPluginLoader) return;
	if (!state.bound) {
		state.bound = true;
		document.addEventListener('click', event => {
			const control = event.target instanceof Element ? event.target.closest('[data-action]') : null;
			const act = control?.dataset.action;
			if (act === 'ocr-install') _rapierOcrRequest(true);
			else if (act === 'ocr-install-now') void _rapierOcrInstall();
			else if (act === 'ocr-dismiss') _rapierOcrDismiss();
		});
		const touched = () => { state.input = Date.now(); };
		for (const type of ['keydown', 'input', 'wheel', 'scroll', 'compositionupdate']) document.addEventListener(type, touched, {capture: true, passive: true});
		document.addEventListener('compositionstart', () => { state.composing = true; touched(); }, {capture: true, passive: true});
		document.addEventListener('compositionend', () => { state.composing = false; touched(); }, {capture: true, passive: true});
		document.addEventListener('pointerdown', event => { state.pointers.add(event.pointerId); touched(); }, {capture: true, passive: true});
		document.addEventListener('pointermove', event => { if (event.buttons || state.pointers.has(event.pointerId)) touched(); }, {capture: true, passive: true});
		for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, event => { state.pointers.delete(event.pointerId); touched(); }, {capture: true, passive: true});
		window.addEventListener('blur', () => { state.pointers.clear(); state.composing = false; touched(); });
		window.addEventListener('rapier:ocrplugin', event => _rapierOcrApply(event.detail || {}));
		const overlay = document.getElementById('ocr-plugin-overlay');
		overlay?.addEventListener('click', event => { if (event.target === overlay) _rapierOcrDismiss(); });
	}
	state.provider = RapierPluginLoader.files({key: 'ocr', noun: 'text reader', dash: ' — ', version: M.OCR_VERSION, files: M.OCR_FILES, timeoutMs: 180000, pack: _rapierOcrPack, unpack: _rapierOcrUnpack});
	state.reader = M.createOcrReader(state.provider, _rapierOcrWorker);
	state.cache = M.createPictureReadings({
		store: {get: key => _rapierOcrReadings().get(key), put: (key, value) => _rapierOcrReadings().put(key, value),
			keys: () => _rapierOcrReadings().keys(), remove: key => _rapierOcrReadings().remove(key)},
		available: _rapierOcrLive, close: () => state.reader.close(),
		read: async (source, current) => {
			if (!await _rapierOcrIdle(current)) return null;
			const pixels = await _rapierOcrPixels(source);
			if (!await _rapierOcrIdle(current)) return null;
			let answer;
			if (pixels) answer = await state.reader.read(pixels.rgba, pixels.width, pixels.height);
			else if (source.type === 'image/jxl' || globalThis.RapierImageAssets?.isJxl(source.bytes)) answer = await state.reader.readJxl(source.bytes.slice(), RAPIER_OCR_MAX_SIDE);
			else return null;
			return {width: answer.width, height: answer.height, lines: answer.lines};
		},
	});
	state.readings = state.cache.readings;
}
function _rapierOcrApply(detail) {
	_rapierOcrPaint();
	if (detail.status === 'ready') closeDialog(document.getElementById('ocr-plugin-overlay'));
	else {
		_rapierOcr.turn++;
		if (detail.status === 'absent') {
			_rapierOcr.clearing = _rapierOcr.cache?.forget() || Promise.resolve();
			// The event has no awaiting caller; retain the rejection for delete and future reads to observe.
			void _rapierOcr.clearing.catch(() => {});
		}
		else _rapierOcr.cache?.pause();
	}
}
async function _rapierOcrForgetPlugin() {
	const provider = _rapierOcrProvider();
	if (!provider) return false;
	const removed = await provider.forget();
	if (removed) await _rapierOcr.clearing;
	return removed;
}

// ---- The row and its prompt (the math prompt's shape and words) -----------------------------------------------
function _rapierOcrLabel(provider) {
	const status = provider?.status || 'checking';
	if (status === 'ready') return 'TEXT IN PICTURES INSTALLED';
	if (status === 'downloading') return 'DOWNLOADING TEXT IN PICTURES… ' + (provider.progress || 0) + '%';
	if (status === 'installing') return 'INSTALLING TEXT IN PICTURES…';
	if (status === 'error') return 'INSTALL TEXT IN PICTURES (RETRY)';
	return 'INSTALL TEXT IN PICTURES';
}
function _rapierOcrPaint() {
	const provider = _rapierOcr.provider, action = document.getElementById('ocr-plugin-action'), installed = document.getElementById('ocr-plugin-installed');
	const busy = provider?.status === 'downloading' || provider?.status === 'installing';
	if (action && installed) {
		action.hidden = provider?.status === 'ready';
		installed.hidden = provider?.status !== 'ready';
		action.disabled = busy;
		action.textContent = _rapierOcrLabel(provider);
	}
	const title = document.getElementById('ocr-plugin-title');
	if (!title) return;
	const status = provider?.status;
	title.textContent = status === 'downloading' ? 'Text in pictures plug-in downloading'
		: status === 'installing' ? 'Text in pictures plug-in installing'
		: status === 'error' ? 'Text in pictures plug-in unavailable' : 'Install text in pictures plug-in?';
	const M = _rapierOcrModule();
	// Where the app keeps the plug-ins (Android: Google Play brings them in one pack), the app says what comes, what it costs
	// and what went wrong.
	const hostWords = phase => window.RapierPlatform?.resources.installMessage?.('ocr', phase) || '';
	document.getElementById('ocr-plugin-body').textContent = status === 'error'
		? hostWords('error') || 'Rapier could not reach or verify the text reader. Check your internet connection and tap retry.'
		: hostWords('prompt') || '• Search finds words in pictures.\n• ' + Math.round((M ? M.OCR_TRANSFER_BYTES : 0) / 1e6) + ' MB, once.\n• Pictures never leave your device.';
	document.getElementById('ocr-plugin-body').style.whiteSpace = 'pre-line';
	const progress = document.getElementById('ocr-plugin-progress'), error = document.getElementById('ocr-plugin-error'), install = document.getElementById('ocr-plugin-install');
	progress.hidden = !busy;
	progress.textContent = status === 'downloading' ? 'Downloading the text reader… ' + (provider.progress || 0) + '%' : 'Installing the reader…';
	error.hidden = status !== 'error';
	error.textContent = 'Last attempt failed: ' + (provider?.error || 'unknown error');
	install.disabled = busy;
	install.textContent = status === 'downloading' ? 'downloading…' : status === 'installing' ? 'installing…' : status === 'error' ? 'retry' : 'install now';
}
function _rapierOcrRequest(asked) {
	const provider = _rapierOcrProvider();
	if (!provider || provider.status === 'ready' || provider.status === 'downloading' || provider.status === 'installing') return;
	if (!asked && _rapierOcr.dismissed) return;
	_rapierOcrPaint();
	openDialog(document.getElementById('ocr-plugin-overlay'), {panel: '.settings-panel', onEscape: _rapierOcrDismiss});
}
// The sheet gives way to the progress popup; a failure brings it back with its words.
async function _rapierOcrInstall() {
	const provider = _rapierOcrProvider();
	if (!provider) return;
	closeDialog(document.getElementById('ocr-plugin-overlay'));
	const end = _rapierPluginProgress('ocr', 'text reader');
	try { await (provider.status === 'error' ? provider.reinstall() : provider.install()); }
	catch (error) { console.warn('[rapier] text in pictures plug-in install failed', error); _rapierOcrRequest(true); }
	finally { end(); }
	_rapierOcrPaint();
}
function _rapierOcrDismiss() {
	_rapierOcr.dismissed = true;
	window.dispatchEvent(new CustomEvent('rapier:ocrdismissed'));
	closeDialog(document.getElementById('ocr-plugin-overlay'));
}

// Only local sources are read by default. The document index may admit an already displayed linked picture;
// its GET keeps the page's existing CORS and CSP rules and sends no image data or cross-origin credentials.
async function _rapierOcrSource(url, {linked = false} = {}) {
	if (typeof url !== 'string') return null;
	if (/^data:image\//i.test(url)) {
		const comma = url.indexOf(',');
		if (comma < 0) return null;
		const header = url.slice(5, comma), type = header.split(';', 1)[0].toLowerCase(), body = url.slice(comma + 1);
		if (/;base64(?:;|$)/i.test(header)) return {type, bytes: RapierBundleIO.fromBase64(body.includes('%') ? decodeURIComponent(body) : body)};
		const bytes = new TextEncoder().encode(body), hex = byte => byte >= 48 && byte <= 57 ? byte - 48 :
			byte >= 65 && byte <= 70 ? byte - 55 : byte >= 97 && byte <= 102 ? byte - 87 : -1;
		let length = 0;
		for (let at = 0; at < bytes.length; at++) {
			const high = hex(bytes[at + 1]), low = hex(bytes[at + 2]);
			if (bytes[at] === 37 && high >= 0 && low >= 0) { bytes[length++] = high * 16 + low; at += 2; }
			else bytes[length++] = bytes[at];
		}
		return {type, bytes: bytes.subarray(0, length)};
	}
	const local = /^blob:/i.test(url);
	if (!local && !(linked && /^https?:/i.test(url))) return null;
	const response = await fetch(url, {mode: 'cors', credentials: local || new URL(url).origin === location.origin ? 'same-origin' : 'omit',
		referrerPolicy: 'no-referrer', redirect: 'error', signal: AbortSignal.timeout(15000)});
	if (!response.ok) return null;
	const blob = await response.blob(), type = blob.type.split(';', 1)[0].toLowerCase();
	return {type, bytes: new Uint8Array(await blob.arrayBuffer())};
}
async function _rapierOcrReading(url, options) {
	_rapierOcrSetup();
	if (!_rapierOcrLive()) return null;
	const turn = _rapierOcr.turn;
	const source = await _rapierOcrSource(url, options);
	return source && _rapierOcrLive() && turn === _rapierOcr.turn ? _rapierOcr.cache.reading(source) : null;
}
async function _rapierOcrCached(url) {
	if (!_rapierOcrLive()) return null;
	const turn = _rapierOcr.turn;
	const source = await _rapierOcrSource(url);
	return source && _rapierOcrLive() && turn === _rapierOcr.turn ? _rapierOcr.cache.cached(source) : null;
}
// A private white canvas makes transparent lettering readable without changing the picture or the document.
async function _rapierOcrPixels(source) {
	const image = new Image(), canvas = document.createElement('canvas');
	const bytes = source.type === 'image/svg+xml' ? globalThis.RapierImageAssets.normalizeSVG(source.bytes) : source.bytes;
	const url = URL.createObjectURL(new Blob([bytes], {type: source.type}));
	image.decoding = 'async'; image.src = url;
	try {
		await image.decode();
		const w = image.naturalWidth, h = image.naturalHeight;
		if (!(w > 0 && h > 0)) return null;
		const scale = Math.min(1, RAPIER_OCR_MAX_SIDE / Math.max(w, h));
		const width = Math.max(1, Math.round(w * scale)), height = Math.max(1, Math.round(h * scale));
		canvas.width = width; canvas.height = height;
		const ctx = canvas.getContext('2d', {willReadFrequently: true});
		if (!ctx) return null;
		ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); ctx.drawImage(image, 0, 0, width, height);
		return {rgba: ctx.getImageData(0, 0, width, height).data, width, height};
	} catch (_) { return null; }
	finally { canvas.width = 0; canvas.height = 0; image.removeAttribute('src'); URL.revokeObjectURL(url); }
}

setTimeout(_rapierOcrSetup, 0);
