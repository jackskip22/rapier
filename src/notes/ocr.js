const _rapierOcrNotes = {words: new Map(), from: null, queue: new Set(), all: false, walking: false, timer: 0, revision: new Map(), layers: new WeakMap()};
const RAPIER_OCR_PICTURE = /data:image\/(?:png|jpe?g|webp|gif|bmp|avif|jxl|svg\+xml);base64,[A-Za-z0-9+/=]+/gi;
function _rapierOcrWords() {
	if (!_rapierOcrLive()) return null;
	const state = _rapierOcrNotes;
	if (state.from !== _rapierNotes.texts) {
		state.from = _rapierNotes.texts; state.words.clear(); state.queue.clear(); state.revision.clear();
	}
	return state.words;
}
function _rapierOcrFacts() {
	const state = _rapierOcrNotes;
	return {status: _rapierOcr.provider?.status || null, notes: state.words.size, pictures: _rapierOcr.readings.size, queued: state.queue.size, walking: state.walking};
}

function _rapierOcrWalkAll() {
	_rapierOcrNotes.all = true;
	_rapierOcrWalkSoon();
}
function _rapierOcrJoined(file) {
	const state = _rapierOcrNotes;
	if (!_rapierOcrLive() || state.words.has(file) || state.queue.has(file)) return;
	const note = _rapierNotesLib.build?.index?.notes?.get(file);
	if (!note?.hasPicture && !note?.hasDrawing) return;
	state.queue.add(file);
	_rapierOcrWalkSoon();
}
function _rapierOcrTouched(file, gone) {
	_rapierOcrNotes.revision.set(file, (_rapierOcrNotes.revision.get(file) || 0) + 1);
	if (!_rapierOcrLive()) return;
	if (_rapierOcrNotes.words.delete(file) && typeof _rapierNotesLibraryPictures === 'function') _rapierNotesLibraryPictures(file, '');
	if (gone) { _rapierOcrNotes.queue.delete(file); return; }
	_rapierOcrNotes.queue.add(file);
	_rapierOcrWalkSoon();
}
function _rapierOcrWalkSoon(wait = 0) {
	const state = _rapierOcrNotes;
	if (state.timer || state.walking) return;
	state.timer = setTimeout(() => {
		state.timer = 0;
		const go = () => void _rapierOcrStep();
		if (typeof requestIdleCallback === 'function') requestIdleCallback(go, {timeout: 2000}); else go();
	}, wait);
}
async function _rapierOcrStep() {
	const state = _rapierOcrNotes, notes = typeof _rapierNotes === 'object' ? _rapierNotes : null;
	if (state.walking || !_rapierOcrLive() || (!state.queue.size && !state.all)) return;
	if (!notes?.index || typeof _rapierNotesTextsComplete !== 'function' || !_rapierNotesTextsComplete()) return;
	const sidx = typeof _rapierNotesLibrarySearchIndex === 'function' ? _rapierNotesLibrarySearchIndex() : null;
	if (!sidx || !_rapierNotesLib.build?.done) { _rapierOcrWalkSoon(1000); return; }
	if (state.all) { state.all = false; for (const [file, note] of sidx.notes) if (note.hasPicture || note.hasDrawing) state.queue.add(file); }
	if (!state.queue.size) return;
	if (document.hidden || _rapierOcrBusy()) { _rapierOcrWalkSoon(1500); return; }
	state.walking = true;
	const [file] = state.queue; state.queue.delete(file);
	try { await _rapierOcrReadNote(file); }
	catch (error) { console.warn('[rapier] text in pictures: ' + file, error); }
	finally { state.walking = false; }
	if (state.queue.size) _rapierOcrWalkSoon(50);
}
async function _rapierOcrReadNote(file) {
	const state = _rapierOcrNotes, notes = _rapierNotes;
	if (!Object.hasOwn(notes.index?.notes || {}, file)) { state.words.delete(file); return; }
	const texts = notes.texts, generation = notes.loadGen, revision = state.revision.get(file) || 0, turn = _rapierOcr.turn;
	const current = () => _rapierOcrLive() && turn === _rapierOcr.turn && notes.texts === texts && notes.loadGen === generation &&
		(state.revision.get(file) || 0) === revision && Object.hasOwn(notes.index?.notes || {}, file);
	const text = (await _rapierNotesTexts([file], {hold: false})).get(file);
	if (typeof text !== 'string' || !current()) return;
	const urls = [...new Set(text.match(RAPIER_OCR_PICTURE) || [])], said = [];
	for (const url of urls) {
		const reading = await _rapierOcrReading(url);
		if (!current()) return;
		const words = reading ? _rapierOcrModule().pictureText(reading) : '';
		if (words) said.push(words);
	}
	const words = said.join('\n');
	if ((state.words.get(file) || '') === words) return;
	if (words) state.words.set(file, words); else state.words.delete(file);
	if (typeof _rapierNotesLibraryPictures === 'function') _rapierNotesLibraryPictures(file, words);
}
function _rapierOcrForgetWords() {
	const state = _rapierOcrNotes, files = [...state.words.keys()];
	state.words.clear(); state.queue.clear(); state.revision.clear(); state.all = false;
	clearTimeout(state.timer); state.timer = 0;
	for (const file of files) if (typeof _rapierNotesLibraryPictures === 'function') _rapierNotesLibraryPictures(file, '');
	const host = document.getElementById('editor-blocks');
	if (host) _rapierOcrMarkNote(host);
}

function _rapierOcrMarkNote(host) {
	for (const old of host.querySelectorAll('.rapier-ocr-marks')) {
		if (old._rapierOcrCurrent?.()) continue;
		const parent = old.parentElement;
		old._rapierOcrWatch?.disconnect(); old._rapierOcrUnbind?.();
		old.remove();
		if (!parent?.querySelector(':scope > .rapier-ocr-marks')) parent?.classList.toggle('rapier-ocr-marked', false);
	}
	const M = _rapierOcrModule(), S = globalThis.RapierNotesSearch, notes = typeof _rapierNotes === 'object' ? _rapierNotes : null;
	const query = String(notes?.query || '').trim();
	if (!M || !S || !query || !notes?.mode || !notes.current || _rapierOcr.provider?.status !== 'ready') return;
	const q = S.parseQuery(query);
	const needles = [...q.phrases, ...q.words];
	if (q.filters.pictures === 'off' || !notes.searchPictures || !needles.length) return;
	const current = notes.current, generation = notes.loadGen, turn = _rapierOcr.turn;
	for (const img of host.querySelectorAll('.block-read img')) {
		const url = _rapierOcrImageUrl(img);
		if (!/^(?:data:image\/|blob:)/i.test(url) || _rapierOcrNotes.layers.get(img)?.isConnected) continue;
		const live = () => _rapierOcrLive() && turn === _rapierOcr.turn && notes.mode && notes.searchPictures &&
			notes.current === current && notes.loadGen === generation && img.isConnected && host.contains(img) &&
			_rapierOcrImageUrl(img) === url && String(notes.query || '').trim() === query;
		void _rapierOcrCached(url).then(reading => {
			if (reading && live()) _rapierOcrMarks(img, reading, needles, live);
		}).catch(() => {});
	}
}
function _rapierOcrMarks(img, reading, needles, live) {
	const M = _rapierOcrModule(), fold = s => s.toLowerCase().normalize('NFD').replace(/\p{M}+/gu, '');
	const quads = needles.flatMap(needle => M.pictureMarks(reading, needle, fold));
	const parent = img.parentElement;
	if (!quads.length || !parent || _rapierOcrNotes.layers.get(img)?.isConnected) return;
	parent.classList.toggle('rapier-ocr-marked', true);
	const layer = document.createElement('span');
	layer.className = 'rapier-ocr-marks';
	layer.setAttribute('aria-hidden', 'true');
	layer._rapierOcrCurrent = () => img.parentElement === parent && live();
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
	layer._rapierOcrUnbind = () => img.removeEventListener('load', place);
	for (const quad of quads) {
		const mark = document.createElement('span');
		mark.className = 'rapier-ocr-mark';
		mark.style.clipPath = 'polygon(' + quad.map(([x, y]) => (x * 100).toFixed(2) + '% ' + (y * 100).toFixed(2) + '%').join(', ') + ')';
		layer.appendChild(mark);
	}
	parent.appendChild(layer);
	_rapierOcrNotes.layers.set(img, layer);
}

function _rapierOcrToggleEl(on, press) {
	const b = document.createElement('button');
	b.type = 'button'; b.className = 'rapier-search-toggle'; b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', String(!!on));
	const word = document.createElement('span'); word.className = 'rapier-search-toggle__word'; word.textContent = 'search in pictures';
	const track = document.createElement('span'); track.className = 'rapier-search-toggle__switch'; track.setAttribute('aria-hidden', 'true');
	b.append(word, track);
	b.addEventListener('click', event => { event.stopPropagation(); press(event); });
	return b;
}
window.addEventListener('rapier:ocrplugin', event => {
	if (event.detail?.status === 'ready') _rapierOcrWalkAll();
	else _rapierOcrForgetWords();
});
window.addEventListener('rapier:ocrdismissed', () => { _rapierNotes.picturesWanted = false; });
