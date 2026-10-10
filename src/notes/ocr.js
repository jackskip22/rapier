// Notes' adapter over the shared text-in-pictures reader (images/ocr.js).
// It feeds the library's sparse picture field and marks a note opened from its search.
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

// ---- The reader, in idle time ------------------------------------------------------------------------------------
// Once the plug-in is ready and the notes folder has been read, every note the search index says holds a picture joins the
// queue (the index is begun here if no question has begun it yet, in its own slices); a note written since joins again
// (library.js's touch). One picture at a time, and only when the person has been still a moment. Called on install, on a
// boot that finds the reader held, and when the folder's read completes (notes.js), whichever comes last does the walk.
function _rapierOcrWalkAll() {
	_rapierOcrNotes.all = true;
	_rapierOcrWalkSoon();
}
// A note joined the search index (read, or read again after a rename): queued if it holds a picture whose words it lacks.
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
	// Nothing to walk until Notes has read its folder; the read's end calls the walk again.
	if (!notes?.index || typeof _rapierNotesTextsComplete !== 'function' || !_rapierNotesTextsComplete()) return;
	// The library builds its index in slices; the walk follows it.
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
// The provider's deletion clears the Notes projection as the shared cache is discarded.
function _rapierOcrForgetWords() {
	const state = _rapierOcrNotes, files = [...state.words.keys()];
	state.words.clear(); state.queue.clear(); state.revision.clear(); state.all = false;
	clearTimeout(state.timer); state.timer = 0;
	for (const file of files) if (typeof _rapierNotesLibraryPictures === 'function') _rapierNotesLibraryPictures(file, '');
	const host = document.getElementById('editor-blocks');
	if (host) _rapierOcrMarkNote(host);
}

// ---- What a person meets in the picture itself --------------------------------------------------------------------
// A search hit in a picture is said on its card (the snippet is what the picture says, under the picture's own glyph);
// the note opened from that search shows the picture with the found words marked over it, where the reader saw them
// (pictureMarks: each line's quad, cut by its characters' places). notes.js calls this after every re-render of the open
// note's blocks, as it lays its pictures; the marks go the moment the question does.
function _rapierOcrMarkNote(host) {
	for (const old of host.querySelectorAll('.rapier-ocr-marks')) {
		old._rapierOcrWatch?.disconnect(); old._rapierOcrUnbind?.();
		old.parentElement?.classList.remove('rapier-ocr-marked'); old.remove();
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
		if (!/^(?:data:image\/|blob:)/i.test(url)) continue;
		void _rapierOcrCached(url).then(reading => {
			if (reading && _rapierOcrLive() && turn === _rapierOcr.turn && notes.current === current && notes.loadGen === generation &&
				img.isConnected && host.contains(img) && _rapierOcrImageUrl(img) === url && String(notes.query || '').trim() === query)
				_rapierOcrMarks(img, reading, needles);
		}).catch(() => {});
	}
}
function _rapierOcrMarks(img, reading, needles) {
	const M = _rapierOcrModule(), fold = s => s.toLowerCase().normalize('NFD').replace(/\p{M}+/gu, '');
	const quads = needles.flatMap(needle => M.pictureMarks(reading, needle, fold));
	const parent = img.parentElement;
	if (!quads.length || !parent || _rapierOcrNotes.layers.get(img)?.isConnected) return;
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

// Notes' picture-search switch uses the shared installation prompt.
function _rapierOcrToggleEl(on, press) {
	const b = document.createElement('button');
	b.type = 'button'; b.className = 'rapier-search-toggle'; b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', String(!!on));
	const word = document.createElement('span'); word.className = 'rapier-search-toggle__word'; word.textContent = 'search in pictures';
	const track = document.createElement('span'); track.className = 'rapier-search-toggle__switch'; track.setAttribute('aria-hidden', 'true');
	b.append(word, track);
	// A press stays the row's: the editor's page-wide click that puts the find bar away must not take it.
	b.addEventListener('click', event => { event.stopPropagation(); press(event); });
	return b;
}
window.addEventListener('rapier:ocrplugin', event => {
	if (event.detail?.status === 'ready') _rapierOcrWalkAll();
	else _rapierOcrForgetWords();
});
window.addEventListener('rapier:ocrdismissed', () => { _rapierNotes.picturesWanted = false; });
