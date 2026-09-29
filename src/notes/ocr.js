// Text in pictures, the page's side (docs/notes-architecture.md "Text in pictures"; the pins and the arithmetic are
// notes/ocr.mjs, the download, the check, the store and the status are the one plug-in loader's, shell/plugin-loader.js).
// The settings row and its prompt, the reader that goes through the notes' pictures in idle time, and the words it read
// handed to the search index (notes/library.js). Spliced into the editor's one script scope
// beside notes.js and library.js, dropped from the document profile with them. createElement/textContent only.
//
// Nothing a picture holds leaves the device: the pixels go to a worker whose network is shut, the words it read stay in
// this browser's own store (RapierStorage.optional.ocrReadingsDb), keyed by the picture's own digest, and are never synced.

const _rapierOcr = {
	provider: null, reader: null, bound: false, dismissed: false, held: false,
	// file -> the words its pictures say (search's `pictures` map; notes/search.mjs reads it live)
	words: new Map(),
	// picture digest -> its reading, this session
	readings: new Map(),
	queue: new Set(), all: false, walking: false, timer: 0, input: 0, readingsStore: null,
};
// The longest side a picture is read at: phone photos keep their small print, and the worker's memory stays bounded.
const RAPIER_OCR_MAX_SIDE = 2048;
// A picture in a note is a data URL (an inline image or an asset definition); these are the formats a browser decodes.
const RAPIER_OCR_PICTURE = /data:image\/(?:png|jpe?g|webp|gif|bmp|jxl);base64,[A-Za-z0-9+/=]+/g;

function _rapierOcrModule() { return globalThis.RapierNotesOcr; }
function _rapierOcrProvider() { _rapierOcrSetup(); return _rapierOcr.provider; }
// The search's map, while the plug-in is installed; null otherwise (library.js hands it to the index).
function _rapierOcrWords() { return _rapierOcr.provider?.status === 'ready' ? _rapierOcr.words : null; }
// Work that was pending when the reader was deleted ends at its next step: it never puts words back.
function _rapierOcrLive() { return _rapierOcr.provider?.status === 'ready'; }

// What the diagnostic facts say of the reader (rapierNotesFacts.pictures): counts, never words.
function _rapierOcrFacts() {
	const state = _rapierOcr;
	return {status: state.provider?.status || null, notes: state.words.size, pictures: state.readings.size, queued: state.queue.size, walking: state.walking};
}
function _rapierOcrHex(buffer) { return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function _rapierOcrSha256(bytes) { return _rapierOcrHex(await crypto.subtle.digest('SHA-256', bytes)); }
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
	let serial = 0;
	const fail = error => { for (const [, w] of waiting) w.reject(error); waiting.clear(); };
	worker.onmessage = event => { const w = waiting.get(event.data?.id); if (!w) return; waiting.delete(event.data.id); if (event.data.ok) w.resolve(event.data); else w.reject(new Error(event.data.error || 'The text reader failed')); };
	worker.onerror = event => { event.preventDefault?.(); fail(new Error(event.message || 'The text reader stopped')); };
	return {
		post(message, transfer) { const id = ++serial; return new Promise((resolve, reject) => { waiting.set(id, {resolve, reject}); worker.postMessage({...message, id}, transfer || []); }); },
		terminate() { fail(new Error('The text reader was closed')); worker.terminate(); },
	};
}
function _rapierOcrSetup() {
	const state = _rapierOcr, M = _rapierOcrModule();
	if (state.provider || !M || typeof _rapierProviders !== 'object' || typeof RapierBundleIO !== 'object' || !globalThis.RapierPluginLoader) return;
	if (!state.bound) {
		state.bound = true;
		// The row, the prompt and the delete are this file's; the engine's own table does not know them.
		document.addEventListener('click', event => {
			const control = event.target instanceof Element ? event.target.closest('[data-action]') : null;
			const act = control?.dataset.action;
			if (act === 'ocr-install') _rapierOcrRequest(true);
			else if (act === 'ocr-install-now') void _rapierOcrInstall();
			else if (act === 'ocr-dismiss') _rapierOcrDismiss();
		});
		// Never while the person is typing or touching: the walk waits for a quiet moment.
		for (const type of ['keydown', 'input', 'pointerdown', 'compositionupdate']) document.addEventListener(type, () => { state.input = Date.now(); }, {capture: true, passive: true});
		window.addEventListener('rapier:ocrplugin', event => _rapierOcrApply(event.detail || {}));
		const overlay = document.getElementById('ocr-plugin-overlay');
		overlay?.addEventListener('click', event => { if (event.target === overlay) _rapierOcrDismiss(); });
	}
	// The files through the one plug-in loader (it publishes _rapierProviders.ocr and says its status on rapier:ocrplugin);
	// the reader over them opens a worker the first time a picture is read.
	state.provider = RapierPluginLoader.files({key: 'ocr', noun: 'text reader', dash: ' — ', version: M.OCR_VERSION, files: M.OCR_FILES, timeoutMs: 180000, pack: _rapierOcrPack, unpack: _rapierOcrUnpack});
	state.reader = M.createOcrReader(state.provider, _rapierOcrWorker);
}
function _rapierOcrApply(detail) {
	_rapierOcrPaint();
	if (detail.status === 'ready') { _rapierOcr.held = true; closeDialog(document.getElementById('ocr-plugin-overlay')); _rapierOcrWalkAll(); }
	// Deleted (or a held file failed its check): the worker stops and the words go with the reader. A browser that never held
	// it has nothing to forget.
	if (detail.status !== 'ready') _rapierOcr.reader?.close();
	if (detail.status === 'absent' && _rapierOcr.held) { _rapierOcr.held = false; void _rapierOcrForgetWords(); }
}

// ---- The row and its prompt (the math prompt's shape and words) -----------------------------------------------
function _rapierOcrLabel(provider) {
	const status = provider?.status || 'checking';
	if (status === 'ready') return 'TEXT IN PICTURES PLUGIN INSTALLED';
	if (status === 'downloading') return 'DOWNLOADING TEXT IN PICTURES PLUGIN… ' + (provider.progress || 0) + '%';
	if (status === 'installing') return 'INSTALLING TEXT IN PICTURES PLUGIN…';
	if (status === 'error') return 'INSTALL TEXT IN PICTURES PLUGIN (RETRY)';
	return 'INSTALL TEXT IN PICTURES PLUGIN';
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
		: hostWords('prompt') || 'Search finds the words in your notes\' pictures. Rapier downloads the ' + (M ? M.OCR_MODEL : 'text') + ' reader (about ' +
			Math.round((M ? M.OCR_TRANSFER_BYTES : 0) / 1e6) + ' MB) from jsDelivr once. It reads your pictures on this device; they never leave it.';
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
	if (!provider || provider.status === 'ready') return;
	if (!asked && _rapierOcr.dismissed) return;
	_rapierOcrPaint();
	openDialog(document.getElementById('ocr-plugin-overlay'), {panel: '.settings-panel', onEscape: _rapierOcrDismiss});
}
async function _rapierOcrInstall() {
	const provider = _rapierOcrProvider();
	if (!provider) return;
	try { await (provider.status === 'error' ? provider.reinstall() : provider.install()); }
	catch (error) { console.warn('[rapier] text in pictures plug-in install failed', error); }
	_rapierOcrPaint();
}
function _rapierOcrDismiss() {
	_rapierOcr.dismissed = true;
	closeDialog(document.getElementById('ocr-plugin-overlay'));
}

// ---- The reader, in idle time ------------------------------------------------------------------------------------
// Once the plug-in is ready and the notes folder has been read, every note the search index says holds a picture joins the
// queue (the index is begun here if no question has begun it yet, in its own slices); a note written since joins again
// (library.js's touch). One picture at a time, and only when the person has been still a moment. Called on install, on a
// boot that finds the reader held, and when the folder's read completes (notes.js), whichever comes last does the walk.
function _rapierOcrWalkAll() {
	_rapierOcr.all = true;
	_rapierOcrWalkSoon();
}
// A note joined the search index (read, or read again after a rename): queued if it holds a picture whose words it lacks.
function _rapierOcrJoined(file) {
	const state = _rapierOcr;
	if (state.provider?.status !== 'ready' || state.words.has(file) || state.queue.has(file)) return;
	if (!_rapierNotesLib.build?.index?.notes?.get(file)?.hasPicture) return;
	state.queue.add(file);
	_rapierOcrWalkSoon();
}
function _rapierOcrTouched(file, gone) {
	if (_rapierOcr.provider?.status !== 'ready') return;
	if (gone) { _rapierOcr.words.delete(file); _rapierOcr.queue.delete(file); return; }
	_rapierOcr.queue.add(file);
	_rapierOcrWalkSoon();
}
function _rapierOcrWalkSoon(wait = 0) {
	const state = _rapierOcr;
	if (state.timer || state.walking) return;
	state.timer = setTimeout(() => {
		state.timer = 0;
		const go = () => void _rapierOcrStep();
		if (typeof requestIdleCallback === 'function') requestIdleCallback(go, {timeout: 2000}); else go();
	}, wait);
}
async function _rapierOcrStep() {
	const state = _rapierOcr, notes = typeof _rapierNotes === 'object' ? _rapierNotes : null;
	if (state.walking || state.provider?.status !== 'ready' || (!state.queue.size && !state.all)) return;
	// Nothing to walk until Notes has read its folder; the read's end calls the walk again.
	if (!notes?.index || typeof _rapierNotesTextsComplete !== 'function' || !_rapierNotesTextsComplete()) return;
	// The library builds its index in slices; the walk follows it.
	const sidx = typeof _rapierNotesLibrarySearchIndex === 'function' ? _rapierNotesLibrarySearchIndex() : null;
	if (!sidx || !_rapierNotesLib.build?.done) { _rapierOcrWalkSoon(1000); return; }
	if (state.all) { state.all = false; for (const [file, note] of sidx.notes) if (note.hasPicture) state.queue.add(file); }
	if (!state.queue.size) return;
	const quiet = Date.now() - state.input;
	if (quiet < 1500) { _rapierOcrWalkSoon(1500 - quiet); return; }
	state.walking = true;
	const [file] = state.queue; state.queue.delete(file);
	try { await _rapierOcrReadNote(file); }
	catch (error) { console.warn('[rapier] text in pictures: ' + file, error); }
	finally { state.walking = false; }
	if (state.queue.size) _rapierOcrWalkSoon(50);
}
async function _rapierOcrReadNote(file) {
	const state = _rapierOcr, notes = _rapierNotes;
	if (!Object.hasOwn(notes.index?.notes || {}, file)) { state.words.delete(file); return; }
	const text = (await _rapierNotesTexts([file], {hold: false})).get(file);
	if (typeof text !== 'string' || !_rapierOcrLive()) return;
	const urls = [...new Set(text.match(RAPIER_OCR_PICTURE) || [])], said = [];
	for (const url of urls) {
		const reading = await _rapierOcrReading(url);
		if (!_rapierOcrLive()) return;
		const words = reading ? _rapierOcrModule().pictureText(reading) : '';
		if (words) said.push(words);
	}
	const words = said.join('\n');
	if ((state.words.get(file) || '') === words) return;
	if (words) state.words.set(file, words); else state.words.delete(file);
	if (typeof _rapierNotesLibraryPictures === 'function') _rapierNotesLibraryPictures(file, words);
}
function _rapierOcrReadings() {
	return _rapierOcr.readingsStore ||= RapierBundleIO.store(RapierStorage.optional.ocrReadingsDb, 'readings');
}
// One picture's reading: this session's, else the store's (the same picture in any note is read once), else read now.
async function _rapierOcrReading(url) {
	const state = _rapierOcr, M = _rapierOcrModule(), key = await _rapierOcrSha256(new TextEncoder().encode(url));
	if (state.readings.has(key)) return state.readings.get(key);
	const kept = await _rapierOcrReadings().get(key).catch(() => null);
	if (!_rapierOcrLive()) return null;
	if (kept && kept.version === M.OCR_VERSION && kept.reading) { state.readings.set(key, kept.reading); return kept.reading; }
	const pixels = await _rapierOcrPixels(url);
	if (!_rapierOcrLive()) return null;
	// A JPEG XL picture this browser cannot show is decoded by the reader's own decoder, in its worker.
	const jxl = !pixels && /^data:image\/jxl;base64,/i.test(url) ? RapierBundleIO.fromBase64(url.slice(url.indexOf(',') + 1)) : null;
	if (!pixels && !jxl) return null;
	const answer = pixels ? await state.reader.read(pixels.rgba, pixels.width, pixels.height) : await state.reader.readJxl(jxl, RAPIER_OCR_MAX_SIDE);
	if (!_rapierOcrLive()) return null;
	const reading = {width: answer.width, height: answer.height, lines: answer.lines};
	state.readings.set(key, reading);
	await _rapierOcrReadings().put(key, {version: M.OCR_VERSION, reading}).catch(() => {});
	return reading;
}
// The picture as this browser decodes it, at most RAPIER_OCR_MAX_SIDE; null where it cannot (a JPEG XL is then the reader's own).
async function _rapierOcrPixels(url) {
	const image = new Image();
	image.decoding = 'async';
	image.src = url;
	try { await image.decode(); } catch (_) { return null; }
	const w = image.naturalWidth, h = image.naturalHeight;
	if (!(w > 0 && h > 0)) return null;
	const scale = Math.min(1, RAPIER_OCR_MAX_SIDE / Math.max(w, h)), width = Math.max(1, Math.round(w * scale)), height = Math.max(1, Math.round(h * scale));
	const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
	const ctx = canvas.getContext('2d', {willReadFrequently: true});
	ctx.drawImage(image, 0, 0, width, height);
	const rgba = ctx.getImageData(0, 0, width, height).data;
	canvas.width = 0; canvas.height = 0; image.removeAttribute('src');
	return {rgba, width, height};
}
// Delete: the words leave the index and the store with the reader.
async function _rapierOcrForgetWords() {
	const state = _rapierOcr, files = [...state.words.keys()];
	state.words.clear(); state.readings.clear(); state.queue.clear();
	for (const file of files) if (typeof _rapierNotesLibraryPictures === 'function') _rapierNotesLibraryPictures(file, '');
	const store = _rapierOcrReadings();
	for (const key of await store.keys().catch(() => [])) await store.remove(key).catch(() => {});
}

// ---- What a person meets in the picture itself --------------------------------------------------------------------
// A search hit in a picture is said on its card (the snippet is what the picture says, under the picture's own glyph);
// the note opened from that search shows the picture with the found words marked over it, where the reader saw them
// (pictureMarks: each line's quad, cut by its characters' places). notes.js calls this after every re-render of the open
// note's blocks, as it lays its pictures; the marks go the moment the question does.
function _rapierOcrMarkNote(host) {
	for (const old of host.querySelectorAll('.rapier-ocr-marks')) { old._rapierOcrWatch?.disconnect(); old.parentElement?.classList.remove('rapier-ocr-marked'); old.remove(); }
	const M = _rapierOcrModule(), S = globalThis.RapierNotesSearch, notes = typeof _rapierNotes === 'object' ? _rapierNotes : null;
	const query = String(notes?.query || '').trim();
	if (!M || !S || !query || !notes?.mode || !notes.current || _rapierOcr.provider?.status !== 'ready') return;
	const q = S.parseQuery(query);
	const needles = [...q.phrases, ...q.words];
	if (q.filters.pictures === 'off' || !needles.length) return;
	for (const img of host.querySelectorAll('.block-read img')) {
		const url = img.currentSrc || img.src || '';
		if (!/^data:image\//.test(url)) continue;
		void _rapierOcrSha256(new TextEncoder().encode(url)).then(async key => {
			const reading = _rapierOcr.readings.get(key) || (await _rapierOcrReadings().get(key).catch(() => null))?.reading;
			if (reading && _rapierOcrLive() && img.isConnected && String(notes.query || '').trim() === query) _rapierOcrMarks(img, reading, needles);
		});
	}
}
function _rapierOcrMarks(img, reading, needles) {
	const M = _rapierOcrModule(), fold = s => s.toLowerCase().normalize('NFD').replace(/\p{M}+/gu, '');
	const quads = needles.flatMap(needle => M.pictureMarks(reading, needle, fold));
	const parent = img.parentElement;
	if (!quads.length || !parent || parent.querySelector(':scope > .rapier-ocr-marks')) return;
	// The picture's own box stands the marks: its parent anchors them before the picture's place is read.
	parent.classList.add('rapier-ocr-marked');
	const layer = document.createElement('span');
	layer.className = 'rapier-ocr-marks';
	layer.setAttribute('aria-hidden', 'true');
	// The layer stands on the picture's own box, and stands there again whenever the picture or its holder changes size (a
	// picture decoding late, the pictures' flow laying it out, a turn of the phone).
	// Measured as drawn (a picture the flow places by transform is where its box is drawn, not where its offsets say).
	const place = () => {
		const a = img.getBoundingClientRect(), b = parent.getBoundingClientRect();
		layer.style.left = (a.left - b.left - parent.clientLeft) + 'px'; layer.style.top = (a.top - b.top - parent.clientTop) + 'px';
		layer.style.width = a.width + 'px'; layer.style.height = a.height + 'px';
	};
	place();
	requestAnimationFrame(() => requestAnimationFrame(() => { if (layer.isConnected) place(); }));
	if (typeof ResizeObserver === 'function') {
		const watch = new ResizeObserver(() => { if (layer.isConnected && img.isConnected) place(); else watch.disconnect(); });
		watch.observe(img); watch.observe(parent);
		layer._rapierOcrWatch = watch;
	}
	img.addEventListener('load', place, {once: true});
	for (const quad of quads) {
		const mark = document.createElement('span');
		mark.className = 'rapier-ocr-mark';
		mark.style.clipPath = 'polygon(' + quad.map(([x, y]) => (x * 100).toFixed(2) + '% ' + (y * 100).toFixed(2) + '%').join(', ') + ')';
		layer.appendChild(mark);
	}
	parent.appendChild(layer);
}

setTimeout(_rapierOcrSetup, 0);
