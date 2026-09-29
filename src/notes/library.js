// Notes library (docs/notes-architecture.md "The library"; docs/notes-search.md, docs/notes-links.md): search field and chips, the rename's
// link rewrite, Connections, the [[ picker, selection's top bar. Spliced into the editor's one script scope beside notes.js and todo.js
// (bare _rapierNotes, _rapierNotesStore, rapierLoad); dropped from the document profile. createElement/textContent only, never innerHTML.
const RAPIER_NOTES_LIB_LIMIT = 400, RAPIER_NOTES_LIB_RECENT = 8, RAPIER_NOTES_LIB_MENTION_MIN = 4;
const _rapierNotesLib = {
	sidx: null, lidx: null, from: null, query: null, results: null, build: null, slice: null, partial: null, painted: 0, job: null, snips: null,
	chips: null, bar: null, picker: null, renamed: null, connections: null, secs: null, trustedPaint: false,
	// A33/A48: this question's run, whether its first exact hit happened, and the run count. The run id changes with the question.
	run: null, runs: 0, hit: false, said: null,
};
function _rapierNotesSearchModule() { return globalThis.RapierNotesSearch; }
function _rapierNotesLinksModule() { return globalThis.RapierNotesLinks; }

// ---- The two derived indexes ----
// Derived, never the truth: built on first question, updated one note at a time after each write, discarded when the load hands a new texts map.
function _rapierNotesLibraryTextsComplete() {
	const lib = _rapierNotesLib, L = _rapierNotesLinksModule();
	if (lib.lidx && L && lib.from === _rapierNotes.texts) L.resolveLinkIndex(lib.lidx);
	lib.results = null; lib.query = null;
}
// #257: both indexes start empty with the load and every note read joins as it arrives, so its words can be let go.
function _rapierNotesLibraryBegin() {
	_rapierNotesLibrarySearchIndex(); _rapierNotesLibraryLinkIndex();
	// Unchanged notes join from the one cached row holding both projections, without a read (D08/D09); others take the read path.
	const state = _rapierNotes, plan = state.cachePlan;
	if (!plan || !plan.reuse?.length) return;
	const S = _rapierNotesSearchModule(), L = _rapierNotesLinksModule(), lib = _rapierNotesLib;
	// Reuse needs both owners; a missing method is a cache miss, never permission to count cached rows complete.
	if (!lib.build || !lib.lidx || typeof S?.hydrateSearchIndex !== 'function' || typeof L?.hydrateLinkIndex !== 'function') {
		state.cachePlan = null;
		return;
	}
	try {
		// Links stream in place; completion resolves them once after every note has joined.
		lib.build = S.hydrateSearchIndex(lib.build, plan.reuse, {own: true});
		lib.sidx = lib.build.index;
		lib.lidx = L.hydrateLinkIndex(lib.lidx, plan.reuse, {stream: true});
		// I06: a warm note's card title returns with its projections; an old row has none. Never read a body for it; never use search's title field.
		for (const row of plan.reuse) if (typeof row.projection?.title === 'string') state.titles.set(row.file, row.projection.title);
	} catch (_) {
		// One failed owner invalidates the whole reuse: retire both projections and the plan before ReadRest chooses bodies.
		state.cachePlan = null;
		lib.from = null;
		_rapierNotesLibrarySearchIndex(); _rapierNotesLibraryLinkIndex();
	}
}
function _rapierNotesLibraryTaken(file) {
	const lib = _rapierNotesLib;
	return lib.from === _rapierNotes.texts && !!lib.build && !!lib.lidx && !lib.build.pending.has(file) && lib.lidx.out.has(file);
}
function _rapierNotesLibraryBacklog() { const b = _rapierNotesLib.build; return b && !b.done ? b.pending.size : 0; }
function _rapierNotesLibraryFresh() {
	const state = _rapierNotes, lib = _rapierNotesLib;
	if (lib.from === state.texts) return true;
	lib.from = state.texts; lib.linksPending = null; lib.slice = null; lib.sidx = null; lib.lidx = null; lib.build = null; lib.partial = null; lib.results = null; lib.query = null; lib.job = null; lib.snips = null; lib.secs = null;
	return false;
}
// ---- The search index, in slices (A18) ----
// Built a bounded number of notes per idle slice, byte-equal to the whole build; an early answer is partial and says so. One slice per folder generation.
function _rapierNotesLibrarySearchIndex() {
	const S = _rapierNotesSearchModule(), state = _rapierNotes, lib = _rapierNotesLib;
	if (!S || !state.index) return null;
	_rapierNotesLibraryFresh();
	// The text-in-pictures plug-in's words (notes/ocr.js), a live map the index reads as each note is projected.
	if (!lib.build) { lib.build = S.beginSearchIndex(state.texts, state.index, {pictures: typeof _rapierOcrWords === 'function' ? _rapierOcrWords() : null}); if (!lib.build.done) _rapierNotesLibraryScheduleSlice(); }
	lib.sidx = lib.build.index;
	// The model returns a new index object on every sidecar change: re-point, do not rebuild.
	lib.sidx.sidecar = state.index; lib.sidx.sections = state.index.sections || [];
	return lib.sidx;
}
function _rapierNotesLibraryScheduleSlice() {
	const lib = _rapierNotesLib, state = _rapierNotes, from = state.texts;
	if (lib.slice) return;
	const run = deadline => {
		// A retired callback must not clear the replacement folder’s scheduled slice.
		if (lib.from !== from) return;
		lib.slice = null;
		if (!lib.build || lib.build.done) return;
		const S = _rapierNotesSearchModule();
		let stepped = 0;
		// The build grows in place, so the queue's keys say what a slice took.
		const queued = [...lib.build.pending.keys()];
		do { lib.build = S.stepSearchIndex(lib.build, {notes: 16, own: true}); stepped += 16; }
		while (!lib.build.done && stepped < 256 && deadline && typeof deadline.timeRemaining === 'function' && deadline.timeRemaining() > 8);
		lib.sidx = lib.build.index; lib.results = null; lib.query = null;
		// Let a slice's words go (#257) and remember the note's row here, the one moment both owners hold it. A missing or disagreeing bracket declines.
		if (typeof _rapierNotesLetGo === 'function') for (const file of queued) if (!lib.build.pending.has(file)) {
			_rapierNotesLibraryRemember(file);
			_rapierNotesLetGo(file);
		}
		if (!lib.build.done) _rapierNotesLibraryScheduleSlice();
		// A read-sized queue emptying is not completion: answer at most four times a second while reads remain, then after the final slice.
		const now = Date.now();
		// Search progress paint only: see _rapierNotesLibrarySortedSection.
		if (state.open && state.query && ((lib.build.done && (!state.reading || state.reading.complete)) || now - lib.painted > 250)) { lib.painted = now; lib.trustedPaint = true; try { _rapierNotesRender(); } finally { lib.trustedPaint = false; } }
	};
	// requestIdleCallback, else a macrotask, else (Node) run to completion now.
	if (typeof requestIdleCallback === 'function') lib.slice = requestIdleCallback(run, {timeout: 100});
	else if (typeof setTimeout === 'function') lib.slice = setTimeout(() => run(null), 0);
	else { lib.slice = true; run(null); }
}
// ---- Section order, cached for a search's own paints ----
// sortedSection walks every note per call. Every sidecar write is followed at once by its own plain render, which re-walks; only the renders this
// file schedules for search progress reuse the cache. That ordering is what keeps it honest.
function _rapierNotesLibrarySortedSection(id) {
	const lib = _rapierNotesLib, state = _rapierNotes;
	if (lib.trustedPaint && lib.secs && lib.secs.of === state.index) {
		const cached = lib.secs.by.get(id);
		if (cached) return cached;
	}
	const files = _rapierNotesModel().sortedSection(state.index, id);
	if (!lib.secs || lib.secs.of !== state.index) lib.secs = {of: state.index, by: new Map()};
	lib.secs.by.set(id, files);
	return files;
}
// A note's text arrived (#257): it joins the build and the link index.
function _rapierNotesLibraryRead(file, text = _rapierNotes.texts.get(file)) {
	const lib = _rapierNotesLib, state = _rapierNotes;
	if (lib.from !== state.texts || text == null) return false;
	const S = _rapierNotesSearchModule(), L = _rapierNotesLinksModule(), entry = (state.index && state.index.notes[file]) || {};
	// A read-back of a note both indexes hold changes nothing: every write reaches them through _rapierNotesLibraryTouch.
	let changed = false;
	if (lib.build && S && !lib.build.index.notes.has(file)) { lib.build = S.updateSearchIndex(lib.build, file, text, entry, {queue: true, own: true}); lib.sidx = lib.build.index; if (!lib.build.done) _rapierNotesLibraryScheduleSlice(); changed = true; }
	if (lib.lidx && L && !lib.lidx.out.has(file)) { lib.lidx = L.updateLinkIndex(lib.lidx, file, typeof text === 'string' ? text : text.searchText, {stream: !_rapierNotesTextsComplete(), mapLink: text.mapLink}); changed = true; }
	if (changed) { lib.results = null; if (lib.lidx?.out.has(file)) lib.linksPending?.delete(file); }
	// A note that joins the index with a picture (a read, a rename's re-read) is read by the text-in-pictures plug-in (notes/ocr.js).
	if (changed && typeof _rapierOcrJoined === 'function') _rapierOcrJoined(file);
	return !!lib.build && !!lib.lidx;
}
// One note's row, remembered only where both owners hold it; any doubt declines (costs a re-read, never a wrong answer).
// Trap: notes.js and library.js share one IIFE, so a same-named top-level function is one binding and the later file wins. Keep names distinct.
function _rapierNotesLibraryRemember(file) {
	const state = _rapierNotes, lib = _rapierNotesLib, cache = state.searchCache;
	if (!cache || !state.readBracket) return;
	const bracket = state.readBracket.get(file);
	if (!bracket) return;
	state.readBracket.delete(file);
	const search = lib.build?.index?.notes?.get(file);
	if (!search || !lib.lidx?.files?.has(file)) return;
	try {
		// I06: the retained title goes in the row; `has` separates "no title" from "not computed", and only the first may be stored empty.
		cache.remember(file, {search, links: {out: lib.lidx.out.get(file), aliases: lib.lidx.aliases.get(file)},
			...(state.titles?.has(file) ? {title: state.titles.get(file)} : {})},
			bracket.before, bracket.after, bracket.observedAt);
	} catch (_) { /* a cache that will not take a row is a cache that is not there */ }
}
// What a question on screen is still waiting for: the build's progress, or null once it is done.
function _rapierNotesLibraryPartial() { return _rapierNotesLib.partial; }
// ---- A33's status and first hit (A48) ----
// The words are layout/transient-lifecycle.mjs searchNotice's; a notice this shell cannot state truthfully is not shown. `done` counts settled
// decisions; any `unread` row makes the run end incomplete.
function _rapierNotesLibraryNoticeFacts() {
	const lib = _rapierNotesLib, state = _rapierNotes;
	const query = String(state.query || '').trim();
	if (!query || !state.index || !lib.query || lib.query !== query) return null;
	const total = Object.keys(state.index.notes).length;
	if (!total) return null;
	const job = lib.job, found = job ? job.found : lib.results;
	if (!found) return null;
	// A retired job has no queue but is not complete: `partial` keeps unresolved decisions; subtract candidates from the whole folder.
	const coverage = job ? job.coverage : lib.partial;
	const uncovered = coverage ? Math.max(0, coverage.total - coverage.done) : 0;
	const outstanding = job ? new Set(job.answers.flatMap(a => a.confirm)).size : 0;
	const waiting = (job ? job.confirm.size : 0) + (coverage && !coverage.unread ? uncovered : 0);
	const unread = outstanding - (job ? job.confirm.size : 0) + (coverage?.unread ? uncovered : 0);
	const done = Math.max(0, total - waiting - unread);
	const stage = waiting ? lib.hit ? 'first-hit' : 'searching' : unread ? 'incomplete' : 'complete';
	return {id: lib.run || 'search', stage, done, total, confirmed: found.size, unread};
}
function _rapierNotesLibraryNotice() {
	const T = globalThis.RapierTransientLifecycle, lib = _rapierNotesLib, state = _rapierNotes;
	if (!T || typeof T.searchNotice !== 'function') return null;
	// One computation per change, not per ask: every input to the sentence is in the signature; none is a walk.
	const job = lib.job, found = job ? job.found : lib.results;
	const sign = lib.run + '|' + lib.query + '|' + String(state.query || '').trim() + '|' + (lib.hit ? 1 : 0) +
		'|' + (job ? job.confirm.size : -1) + '|' + (found ? found.size : -1) +
		'|' + (lib.partial ? lib.partial.done + '/' + lib.partial.total + (lib.partial.unread ? 'u' : '') : '');
	if (lib.said && lib.said.sign === sign) return lib.said.notice;
	const facts = _rapierNotesLibraryNoticeFacts();
	let notice = null;
	if (facts) { try { notice = T.searchNotice(facts); } catch (_) { notice = null; } }
	lib.said = {sign, notice};
	return notice;
}
// The cards on screen, in order: the confirmation order the read plan wants first.
function _rapierNotesLibraryVisible() {
	const state = _rapierNotes;
	if (!state.surface) return [];
	return [...state.surface.querySelectorAll('.rapier-notes-card[data-notes-file]')].map(el => el.dataset.notesFile);
}
function _rapierNotesLibraryLinkIndex() {
	const L = _rapierNotesLinksModule(), lib = _rapierNotesLib;
	if (!L) return null;
	_rapierNotesLibraryFresh();
	if (!lib.lidx) lib.lidx = L.buildLinkIndex(_rapierNotes.texts);
	return lib.lidx;
}
// One note changed; `gone` drops it. No index is built here.
function _rapierNotesLibraryTouch(file, gone) {
	const lib = _rapierNotesLib, state = _rapierNotes;
	if (lib.from !== state.texts) return; // a load is replacing everything; the next question rebuilds
	const text = gone ? null : state.texts.get(file);
	if (text == null && !gone) return;
	const S = _rapierNotesSearchModule(), L = _rapierNotesLinksModule();
	if (lib.build && S) { lib.build = S.updateSearchIndex(lib.build, file, text, (state.index && state.index.notes[file]) || {}, {own: true}); lib.sidx = lib.build.index; if (!lib.build.done) _rapierNotesLibraryScheduleSlice(); }
	if (lib.lidx && L) lib.lidx = L.updateLinkIndex(lib.lidx, file, text);
	lib.results = null; lib.job = null; if (lib.snips) lib.snips.delete(file);
	// A note written since its pictures were read is read again, in idle time.
	if (typeof _rapierOcrTouched === 'function') _rapierOcrTouched(file, gone);
}
// The words of one note's pictures changed (read, read again, or deleted with the plug-in): the index's record takes them
// in place, and a question on screen is asked again.
function _rapierNotesLibraryPictures(file, words) {
	const lib = _rapierNotesLib, S = _rapierNotesSearchModule(), state = _rapierNotes;
	if (!lib.build || !S || typeof S.updateSearchPictures !== 'function' || lib.from !== state.texts) return;
	// The plug-in installed after the index was begun: the index takes the map now, for the notes still to come.
	if (!lib.build.index.pictures && typeof _rapierOcrWords === 'function' && _rapierOcrWords()) lib.build.index.pictures = _rapierOcrWords();
	lib.build = S.updateSearchPictures(lib.build, file, words, {own: true});
	lib.sidx = lib.build.index;
	lib.results = null; lib.job = null; if (lib.snips) lib.snips.delete(file);
	if (state.open && state.query) { lib.trustedPaint = true; try { _rapierNotesRender(); } finally { lib.trustedPaint = false; } }
}

// ---- The search field ----
// The field's words are the query (search.mjs parses them; a chip writes the same syntax). Archive and Trash ask for their own.
function _rapierNotesLibraryRun() {
	// Freshness first: a reloaded folder is a new texts map and must not be answered from the old one.
	_rapierNotesLibraryFresh();
	const state = _rapierNotes, S = _rapierNotesSearchModule(), lib = _rapierNotesLib;
	const query = String(state.query || '').trim();
	if (lib.results && lib.query === query) return lib.results;
	// A question a read-back is still confirming (A21) answers with what is established so far.
	if (lib.job && lib.job.query === query) return lib.job.found;
	// A new run gets a new id (A48): an old receipt must never publish into a newer question.
	if (lib.query !== query) lib.snips = null;
	lib.query = query; lib.job = null; lib.hit = false; lib.run = 'q' + (++lib.runs) + ':' + state.loadGen;
	if (!query) { lib.results = null; lib.partial = null; lib.run = null; return null; }
	const sidx = _rapierNotesLibrarySearchIndex();
	if (!sidx) { lib.results = null; return null; }
	// A21: the index holds no body; phrases and punctuated exclusions are confirmed by exact reads in bounded batches once the build is done.
	const answers = [S.search(sidx, query, {limit: RAPIER_NOTES_LIB_LIMIT, candidateOrder: true})];
	// Only a positive facet chooses these sections. A literal or -is:trash is not is:trash.
	if (!S.parseQuery(query).filters.is.some(is => is === 'archived' || is === 'trash' || is === 'trashed')) for (const also of ['is:archived', 'is:trash']) answers.push(S.search(sidx, query + ' ' + also, {limit: RAPIER_NOTES_LIB_LIMIT, candidateOrder: true}));
	const found = _rapierNotesLibraryCompose(answers);
	const confirm = new Set(answers.flatMap(a => a.confirm));
	// Coverage belongs to the folder, not just the texts that have arrived in the current slice.
	const total = Object.keys(state.index.notes).length;
	lib.partial = state.reading && (!state.reading.complete || sidx.notes.size < total) ? {done: sidx.notes.size, total, ...(state.reading.complete && lib.build.done ? {unread: true} : {})} : answers[0].partial ? answers[0].progress : null;
	lib.hit = found.size > 0;
	if (confirm.size && (!lib.partial || lib.partial.unread)) {
		const job = lib.job = {query, id: lib.run, gen: state.loadGen, answers, confirm, total: confirm.size, found, coverage: lib.partial,
			visible: _rapierNotesLibraryVisible()};
		lib.partial = job.coverage || {done: 0, total: job.total};
		void _rapierNotesLibraryConfirm(job);
		return found;
	}
	lib.results = found;
	return found;
}
function _rapierNotesLibraryCompose(answers) {
	const found = new Map();
	for (const answer of answers) for (const row of answer.results) if (!found.has(row.file)) found.set(row.file, {...row, rank: found.size});
	return found;
}
// The sixteen this turn asks for, in the planner's order over _rapierNotesReadRow identities, so a card's read is joined, not repeated.
// With no read pass, the set's own order stands.
function _rapierNotesLibraryBatch(job) {
	const state = _rapierNotes, pass = state.reads?.read;
	const pending = [...job.confirm];
	if (typeof pass?.plan !== 'function' || typeof _rapierNotesReadRow !== 'function') return pending.slice(0, 16);
	// Provisional rank is already owned by the index, including pending phrases. It is read
	// priority only: no candidate becomes a displayed hit without exact confirmation.
	const candidates = new Set(job.answers.flatMap(answer => answer.candidates || []));
	const ordered = [...candidates].filter(file => job.confirm.has(file)).concat(pending.filter(file => !candidates.has(file)));
	try {
		const rows = ordered.map(file => ({..._rapierNotesReadRow(file), priority: candidates.has(file)}));
		// `arrived` includes what the rest-pass reached before this question, so a batch limit strands nothing.
		const arrived = pending.filter(file => state.texts.has(file));
		const plan = pass.plan(rows, {visible: job.visible || [], arrived, limit: 16});
		const order = plan.map(row => row.key);
		// A short plan is topped up from the set's own order.
		for (const file of pending) { if (order.length === 16) break; if (!order.includes(file)) order.push(file); }
		return order;
	} catch (_) { return pending.slice(0, 16); }
}
// A21's confirmation job: sixteen exact reads a turn, strings released after; stops when the question, folder or index changes.
async function _rapierNotesLibraryConfirm(job) {
	const state = _rapierNotes, S = _rapierNotesSearchModule(), lib = _rapierNotesLib;
	const live = () => lib.job === job && String(state.query || '').trim() === job.query && lib.from === state.texts && state.loadGen === job.gen;
	while (job.confirm.size && live()) {
		// A33/A48: which sixteen: notes/library-reads.mjs plan orders visible cards, then ranked candidates, then what the rest-pass reached. Ordering only.
		const batch = _rapierNotesLibraryBatch(job);
		// The returned batch owns its temporary exact strings. It takes no action hold that a
		// cancelled query could accidentally release from a newer query or folder.
		const texts = await _rapierNotesTexts(batch, {hold: false});
		if (!live()) return;
		job.answers = job.answers.map(a => S.confirmSearch(a, texts));
		// A file that could not be read stays unresolved in the answer and is not asked for again.
		for (const f of batch) job.confirm.delete(f);
		const before = job.found.size;
		job.found = _rapierNotesLibraryCompose(job.answers);
		// The first exact hit of this run, once. It is a confirmed result, never an index candidate.
		if (!lib.hit && job.found.size > before) lib.hit = true;
		const unresolved = new Set(job.answers.flatMap(a => a.confirm)).size;
		lib.partial = job.coverage ? {...job.coverage, done: job.coverage.done - unresolved} : unresolved ? {done: job.total - unresolved, total: job.total, ...(!job.confirm.size ? {unread: true} : {})} : null;
		if (!job.confirm.size) { lib.results = job.found; lib.job = null; }
		// Search progress paint too: this job never writes the sidecar.
		if (state.open) { lib.trustedPaint = true; try { _rapierNotesRender(); } finally { lib.trustedPaint = false; } }
	}
}
function _rapierNotesLibraryMatches(file) {
	const found = _rapierNotesLibraryRun();
	return !found || found.has(file);
}
// Ranked order only for a question with words; a chip alone is a browse and keeps the person's order.
function _rapierNotesLibraryWordy() {
	const S = _rapierNotesSearchModule(), query = String(_rapierNotes.query || '').trim();
	if (!S || !query) return false;
	const q = S.parseQuery(query);
	return !!(q.words.length || q.phrases.length);
}
function _rapierNotesLibraryRanked(files) {
	const found = _rapierNotesLibraryRun();
	if (!found || !_rapierNotesLibraryWordy()) return files;
	return files.slice().sort((a, b) => (found.get(a)?.rank ?? 1e9) - (found.get(b)?.rank ?? 1e9));
}
// The module's snippet with its own offsets, never the file's (docs/notes-search.md "Projection").
function _rapierNotesLibraryHit(file) {
	const found = _rapierNotesLibraryRun();
	if (!found || !found.has(file) || !_rapierNotesLibraryWordy()) return null;
	// A21: the snippet is cut from the card's exact text, once per question and file.
	const lib = _rapierNotesLib, S = _rapierNotesSearchModule(), text = _rapierNotes.texts.get(file), note = lib.sidx && lib.sidx.notes.get(file);
	if (typeof text !== 'string' || !note) return null;
	if (!lib.snips) lib.snips = new Map();
	let snip = lib.snips.get(file);
	if (snip === undefined) { snip = S.snippetFor(note, lib.query, text); if (lib.snips.size >= 64) lib.snips.delete(lib.snips.keys().next().value); lib.snips.set(file, snip); }
	return snip && snip.text ? snip : null;
}
// Tidy around the match only, so the mark still lands on what was matched; separators trimmed only at the snippet's ends.
function _rapierNotesLibraryPlain(s, head, tail) {
	let text = String(s).replace(/(^|\n)[ \t]*(?:[-*]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]*)?/g, (marker, lead, at) => head || at ? lead : marker)
		.replace(/[ \t]*\n[ \t\n]*/g, ' \u00b7 ').replace(/[ \t]+/g, ' ');
	if (head) text = text.replace(/^ ?\u00b7 /, '');
	if (tail) text = text.replace(/ \u00b7 ?$/, '');
	return text;
}
function _rapierNotesLibrarySnippet(file) {
	const snip = _rapierNotesLibraryHit(file);
	if (!snip) return null;
	// A snippet that only repeats the title: the title carries the mark instead.
	if (snip.text.trim() === _rapierNotesLibraryTitle(file).trim()) return null;
	const p = _rapierNotesEl('p', 'rapier-notes-snippet' + (snip.picture ? ' rapier-notes-snippet--picture' : ''));
	// A hit in a picture's words says so: the picture's own glyph, then what the picture says.
	if (snip.picture) { const glyph = _rapierNotesGlyph('image'); glyph.setAttribute('aria-hidden', 'true'); p.appendChild(glyph); p.setAttribute('aria-label', 'in a picture: ' + snip.text); }
	const to = Math.max(snip.from, Math.min(snip.to, snip.text.length));
	p.append(_rapierNotesLibraryPlain(snip.text.slice(0, snip.from), true, false));
	if (to > snip.from) p.appendChild(_rapierNotesEl('mark', '', snip.text.slice(snip.from, to)));
	p.append(_rapierNotesLibraryPlain(snip.text.slice(to), false, true));
	return p;
}
// A match in the card's own title is marked where it is.
function _rapierNotesLibraryMarkTitle(el, file) {
	const snip = _rapierNotesLibraryHit(file);
	if (!snip || snip.to <= snip.from) return;
	const words = snip.text.slice(snip.from, snip.to), title = el.textContent;
	const at = title.toLowerCase().indexOf(words.toLowerCase());
	if (at < 0) return;
	el.textContent = '';
	el.append(title.slice(0, at));
	el.appendChild(_rapierNotesEl('mark', '', title.slice(at, at + words.length)));
	el.append(title.slice(at + words.length));
}

// ---- The filter chips ----
// Kinds, the person's sections, then the eleven colours. Every chip writes a term into the field; nothing filters beside the query.
function _rapierNotesLibraryTerms(text) {
	const s = String(text || ''), out = [];
	let i = 0;
	while (i < s.length) {
		while (s[i] === ' ' || s[i] === '\t') i++;
		if (i >= s.length) break;
		let j = i, quoted = false;
		while (j < s.length && (quoted || (s[j] !== ' ' && s[j] !== '\t'))) { if (s[j] === '"') quoted = !quoted; j++; }
		out.push(s.slice(i, j));
		i = j;
	}
	return out;
}
function _rapierNotesLibraryChipTerm(term) {
	const state = _rapierNotes, terms = _rapierNotesLibraryTerms(state.search ? state.search.value : state.query);
	const want = term.toLowerCase();
	const kept = terms.filter(t => t.toLowerCase() !== want);
	if (kept.length === terms.length) kept.push(term);
	const next = kept.join(' ');
	if (state.search) state.search.value = next;
	state.query = next;
	_rapierNotesRender();
	if (state.search) state.search.focus({preventScroll: true});
}
function _rapierNotesLibraryChipsEl() {
	const state = _rapierNotes, lib = _rapierNotesLib;
	if (lib.chips && lib.chips.isConnected) return lib.chips;
	if (!state.surface || !state.find) return null;
	const el = _rapierNotesEl('div', 'rapier-notes-filters');
	el.id = 'rapier-notes-filters';
	el.hidden = true;
	state.surface.insertBefore(el, state.find.nextSibling);
	lib.chips = el;
	return el;
}
function _rapierNotesLibraryChips() {
	const state = _rapierNotes, el = _rapierNotesLibraryChipsEl();
	if (!el) return;
	const open = !!state.find && !state.find.hidden;
	el.hidden = !open;
	if (!open) { el.replaceChildren(); return; }
	_rapierNotesLibrarySearchIndex(); // warmed here, before the first keystroke asks it anything
	const M = _rapierNotesModel(), on = new Set(_rapierNotesLibraryTerms(state.search ? state.search.value : state.query).map(t => t.toLowerCase()));
	const chip = (term, word, className) => {
		const b = _rapierNotesEl('button', 'rapier-notes-chip' + (className || '') + (on.has(term.toLowerCase()) ? ' rapier-notes-chip--worn' : ''));
		b.type = 'button';
		b.dataset.notesTerm = term;
		b.setAttribute('aria-pressed', String(on.has(term.toLowerCase())));
		if (word != null) b.textContent = word;
		b.onclick = () => _rapierNotesLibraryChipTerm(term);
		return b;
	};
	// The four kinds take a quarter of the row each (--kinds grid); sections keep their own scrolling row.
	const kinds = _rapierNotesEl('div', 'rapier-notes-filter-row rapier-notes-filter-row--kinds');
	// The kinds Keep's search offers (docs/notes-search.md).
	for (const [term, word] of [['has:remind', 'Reminders'], ['has:list', 'Lists'], ['has:picture', 'Pictures'], ['has:drawing', 'Drawings']]) {
		if (term !== 'has:remind' || _rapierNotesIsApp()) kinds.appendChild(chip(term, word));
	}
	// Text in pictures: one chip, on while the plug-in is installed. It is worn while the question includes the pictures'
	// words, and a tap writes `pictures:off` (search.mjs's own term) into the field to leave them out, as every chip writes its term.
	const seen = typeof _rapierOcrWords === 'function' && _rapierOcrWords() ? _rapierNotesEl('div', 'rapier-notes-filter-row') : null;
	if (seen) {
		const b = chip('pictures:off', 'Text in pictures');
		b.classList.toggle('rapier-notes-chip--worn', !on.has('pictures:off'));
		b.setAttribute('aria-pressed', String(!on.has('pictures:off')));
		seen.appendChild(b);
	}
	const own = _rapierNotesEl('div', 'rapier-notes-filter-row');
	for (const section of (state.index && state.index.sections) || []) {
		const name = section.name;
		own.appendChild(chip('in:' + (/[\s"]/.test(name) ? '"' + name.replace(/"/g, '') + '"' : name), name));
	}
	const colours = _rapierNotesEl('div', 'rapier-notes-filter-row rapier-notes-filter-row--colours');
	for (const colour of (M && M.NOTE_COLOURS) || []) {
		if (!colour) continue;
		const b = chip('colour:' + colour, null, ' rapier-notes-swatch-chip rapier-notes-tint-' + colour);
		b.setAttribute('aria-label', colour);
		colours.appendChild(b);
	}
	el.replaceChildren(...[kinds, seen, own.childElementCount ? own : null, colours].filter(Boolean));
}

// ---- Selection mode's top bar ----
// Over the head, not in it; the head's controls go inert. Every control is an existing act. Law 3: glyphs from _rapierNotesGlyph; the kebab is
// #btn-overflow. Law 4: the bell only in the app (_rapierNotesIsApp); on the page the pin takes its place.
function _rapierNotesLibraryBarEl() {
	const state = _rapierNotes, lib = _rapierNotesLib;
	if (lib.bar && lib.bar.isConnected) return lib.bar;
	if (!state.surface) return null;
	const head = state.surface.querySelector('.rapier-notes-head');
	if (!head) return null;
	const bar = _rapierNotesEl('div', 'rapier-notes-selbar');
	bar.id = 'rapier-notes-selbar'; bar.hidden = true;
	bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'selected notes');
	const close = _rapierNotesEl('button', 'rapier-notes-btn'); close.type = 'button'; close.dataset.notesAct = 'select-clear';
	close.setAttribute('aria-label', 'clear the selection');
	close.appendChild(_rapierNotesGlyph('close'));
	const count = _rapierNotesEl('div', 'rapier-notes-selcount', ''); count.setAttribute('role', 'status');
	bar.append(close, count);
	for (const [act, label, glyph] of [['pin', 'pin', 'pin'], ['remind-face', 'remind', 'bell'], ['colour', 'colour', 'palette'], ['section-face', 'section', 'folder'], ['sheet-actions', 'more', 'kebab']]) {
		const b = _rapierNotesEl('button', 'rapier-notes-btn'); b.type = 'button'; b.dataset.notesAct = act;
		b.setAttribute('aria-label', label); b.appendChild(_rapierNotesGlyph(glyph));
		bar.appendChild(b);
	}
	head.parentElement.insertBefore(bar, head.nextSibling);
	lib.bar = bar;
	return bar;
}
function _rapierNotesLibraryBarPaint() {
	const state = _rapierNotes;
	const bar = _rapierNotesLibraryBarEl();
	if (!bar) return;
	const n = state.open && !state.compose ? state.selected.size : 0;
	bar.hidden = !n;
	const bell = bar.querySelector('[data-notes-act="remind-face"]'); if (bell) bell.hidden = !_rapierNotesIsApp();
	const head = state.surface.querySelector('.rapier-notes-head');
	if (head) { if (n) head.setAttribute('inert', ''); else head.removeAttribute('inert'); }
	if (!n) return;
	bar.querySelector('.rapier-notes-selcount').textContent = String(n);
	const pin = bar.querySelector('[data-notes-act="pin"]');
	const entries = [...state.selected].map(f => state.index && state.index.notes[f]).filter(Boolean);
	const pinned = entries.length && entries.every(e => e.pinned);
	if (pin) { pin.setAttribute('aria-pressed', String(!!pinned)); pin.setAttribute('aria-label', pinned ? 'unpin' : 'pin'); if (pinned) pin.dataset.active = 'true'; else delete pin.dataset.active; }
}

// ---- The rename's link rewrite (R85b; docs/notes-links.md "Rename") ----
// renameLinks plans, the shell applies: one queued write per touched note after the rename certifies, never a byte the module did not name.
// A patch that no longer fits is dropped and said.
function _rapierNotesLibraryRenameWho(oldFile) {
	const index = _rapierNotesLibraryLinkIndex();
	// A partial projection cannot authorize a narrowed rewrite: the full read stays the authority until every file has rejoined.
	if (!index || _rapierNotesLib.linksPending?.size || Object.keys(_rapierNotes.index?.notes || {}).some(file => !index.files.has(file))) return undefined;
	const who = new Set((index.in.get(oldFile) || []).map(r => r.from));
	for (const L of index.out.get(oldFile) || []) if (L.resolved && L.resolved.file === oldFile) who.add(oldFile);
	return [...who];
}
// Every `was` must still sit where the module said, or the patch is refused whole.
function _rapierNotesLibraryRefit(text, changed) {
	let next = String(text);
	for (const span of changed) {
		if (next.slice(span.start, span.end) !== span.was) return null;
		next = next.slice(0, span.start) + span.now + next.slice(span.end);
	}
	return next;
}
// The rename is notes/folder.mjs's; the shell reports what it rewrote and dropped.
async function _rapierNotesLibraryRenamed(report) {
	const lib = _rapierNotesLib, state = _rapierNotes, L = _rapierNotesLinksModule();
	lib.renamed = report; lib.results = null; lib.job = null;
	// The old name's picture words go; the new name's are read again when it rejoins (cheaply: a reading is kept by its picture).
	if (typeof _rapierOcrTouched === 'function') _rapierOcrTouched(report.from, true);
	if (!lib.lidx || !L || lib.from !== state.texts) return;
	// Re-read the possible writers one at a time, dropped writes included: the folder's current bytes decide the edges.
	const before = lib.lidx, from = state.texts, gen = state.loadGen;
	const affected = new Set([report.to, ...((report.linking || Object.keys(state.index.notes)).filter(file => file !== report.from))]);
	lib.linksPending = affected;
	for (const file of [report.from, ...affected]) {
		lib.lidx = L.updateLinkIndex(lib.lidx, file, null);
		const S = _rapierNotesSearchModule();
		if (lib.build && S) { lib.build = S.updateSearchIndex(lib.build, file, null, undefined, {own: true}); lib.sidx = lib.build.index; }
	}
	// Knowing all filenames is necessary even while their changed links are being reacquired.
	lib.lidx.files = new Set([...before.files].filter(file => file !== report.from).concat(report.to));
	for (const file of [...affected]) {
		if (state.texts !== from || state.loadGen !== gen || lib.linksPending !== affected) return;
		state.texts.delete(file); state.readFailed.delete(file);
		await _rapierNotesReadOne(file, {search: true});
		if (state.texts !== from || state.loadGen !== gen || lib.linksPending !== affected) return;
		if (lib.lidx.out.has(file) && !state.readFailed.has(file) && !state.unreadable?.has(file)) affected.delete(file);
		_rapierNotesLetGo(file);
	}
	L.resolveLinkIndex(lib.lidx);
	lib.results = null; lib.query = null;
}
// ---- The Connections sheet (docs/notes-links.md) ----
// Outgoing, incoming and unlinked mentions; "link it" rewrites the one named span. Row text is the title with link syntax read as words.
function _rapierNotesLibraryTitle(file) {
	const M = _rapierNotesModel(), state = _rapierNotes;
	const plain = String(file).replace(/\.md$/i, '');
	// The retained title first (I06); `has` separates uncomputed from empty; only empty falls back to the filename.
	const kept = state.titles?.has(file) ? state.titles.get(file) : null;
	if (kept == null && !M) return plain;
	const title = kept == null ? M.projectCard(file, state.texts.get(file) || '').title || '' : kept;
	return title.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim() || plain;
}
function _rapierNotesLibraryConnections(file) {
	const L = _rapierNotesLinksModule(), index = _rapierNotesLibraryLinkIndex();
	if (!L || !index) return null;
	const out = [], seen = new Set();
	for (const link of index.out.get(file) || []) {
		const to = link.resolved && link.resolved.file;
		if (!to || to === file || seen.has(to)) continue;
		seen.add(to); out.push(to);
	}
	const back = [], from = new Set();
	for (const rec of index.in.get(file) || []) {
		if (rec.from === file || from.has(rec.from)) continue;
		from.add(rec.from); back.push(rec.from);
	}
	let mentions = [];
	try { mentions = L.unlinkedMentions(index, _rapierNotes.texts, file, {titles: [_rapierNotesLibraryTitle(file)], minLength: RAPIER_NOTES_LIB_MENTION_MIN}); }
	catch (_) { mentions = []; }
	return {file, out, back, mentions: mentions.slice(0, 20), incomplete: !!_rapierNotesLib.linksPending?.size};
}
function _rapierNotesLibraryConnectionsFace(sheet, file) {
	const lib = _rapierNotesLib, found = _rapierNotesLibraryConnections(file);
	lib.connections = found;
	if (!found) { sheet.appendChild(_rapierNotesEl('div', 'rapier-notes-remind-label', 'Connections need the notes library, which this build did not load.')); return; }
	const title = word => _rapierNotesEl('div', 'rapier-notes-popup-title', word);
	const row = (to, extra) => {
		const b = _rapierNotesEl('button', 'rapier-notes-btn'); b.type = 'button'; b.dataset.notesConn = 'open'; b.dataset.notesConnFile = to;
		b.appendChild(_rapierNotesEl('span', 'rapier-notes-conn-title', _rapierNotesLibraryTitle(to)));
		if (extra) b.appendChild(extra);
		b.onclick = () => { _rapierNotesCloseSheet(); void _rapierNotesOpenNote(to); };
		return b;
	};
	sheet.appendChild(title('links to'));
	if (found.out.length) for (const to of found.out) sheet.appendChild(row(to));
	else sheet.appendChild(_rapierNotesEl('div', 'rapier-notes-conn-none', found.incomplete ? 'Some links have not been read back yet. Open Notes again to retry.' : 'This note links to nothing yet. Type [[ in it to link another.'));
	sheet.appendChild(title('linked from'));
	if (found.back.length) for (const to of found.back) sheet.appendChild(row(to));
	else sheet.appendChild(_rapierNotesEl('div', 'rapier-notes-conn-none', found.incomplete ? 'Some backlinks have not been read back yet. Open Notes again to retry.' : 'No note links here yet.'));
	if (found.mentions.length) {
		sheet.appendChild(title('mentioned in'));
		for (const hit of found.mentions) {
			const line = _rapierNotesEl('div', 'rapier-notes-conn-row');
			const open = row(hit.file);
			const link = _rapierNotesEl('button', 'rapier-notes-btn rapier-notes-btn--accent', 'link it');
			link.type = 'button'; link.dataset.notesConn = 'link'; link.dataset.notesConnFile = hit.file;
			link.onclick = () => { void _rapierNotesLibraryLinkMention(file, hit); };
			line.append(open, link);
			sheet.appendChild(line);
		}
	}
}
// R85b: only the named span, and only while its words are unchanged. The link is a standard relative Markdown link.
async function _rapierNotesLibraryLinkMention(target, hit) {
	const state = _rapierNotes, L = _rapierNotesLinksModule();
	if (!L || typeof L.markdownLink !== 'function') return;
	const text = state.texts.get(hit.file);
	if (text == null) return;
	const was = text.slice(hit.start, hit.end);
	const now = L.markdownLink(was, target);
	const next = _rapierNotesLibraryRefit(text, [{start: hit.start, end: hit.end, was, now}]);
	if (next == null) { if (typeof showToast === 'function') showToast('That mention has changed since it was read; nothing was written.', 'info'); return; }
	if (hit.file === state.current) { if (typeof showToast === 'function') showToast('That note is open: close it first and the mention can be linked.', 'info'); return; }
	try { await _rapierNotesStore.write(hit.file, next); }
	catch (error) { if (typeof showToast === 'function') showToast('The link was not written to the notes folder: ' + String((error && error.message) || error), 'error'); return; }
	state.texts.set(hit.file, next);
	const entry = state.index && state.index.notes[hit.file];
	if (entry) entry.modified = Date.now();
	_rapierNotesLibraryTouch(hit.file);
	try { await _rapierNotesWriteIndex(); } catch (_) {}
	_rapierNotesOpenSheet(null, 'connections');
}

// ---- The [[ picker ----
// Offers notes ranked by rankTargets; inserts a standard relative Markdown link, never a wikilink. Goes in as typing does (execCommand).
const RAPIER_NOTES_PICKER_MAX = 6;
function _rapierNotesPickerCaret() {
	const sel = window.getSelection();
	if (!sel || !sel.rangeCount || !sel.isCollapsed) return null;
	const node = sel.focusNode;
	if (!node || node.nodeType !== Node.TEXT_NODE) return null;
	const host = node.parentElement && node.parentElement.closest ? node.parentElement.closest('.block-edit') : null;
	if (!host || !host.isContentEditable) return null;
	const before = String(node.nodeValue || '').slice(0, sel.focusOffset);
	const m = /\[\[([^[\]\n]*)$/.exec(before);
	if (!m) return null;
	return {node, offset: sel.focusOffset, query: m[1], span: m[0].length};
}
// Recent means the sidecar's modified stamps. Aliases from the link index (A17). An unread note is offered by its name.
function _rapierNotesPickerCandidates(current) {
	const state = _rapierNotes, files = Object.keys((state.index && state.index.notes) || {}).filter(f => f !== current && !state.index.notes[f].trashed);
	const stamp = f => Number(state.index.notes[f].modified || state.index.notes[f].created || 0);
	const recent = files.slice().sort((a, b) => stamp(b) - stamp(a)).slice(0, RAPIER_NOTES_LIB_RECENT);
	_rapierNotesLibraryFresh();
	return _rapierNotesLinksModule().pickerCandidates({files, aliases: _rapierNotesLib.lidx?.aliases}, state.texts, {current, recent, titles: state.titles});
}
// §12: the toolbar's link popup offers the same notes, same ranker, same dest. null also means "no open note".
function _rapierNotesLinkChoices(query, max = RAPIER_NOTES_PICKER_MAX) {
	const L = _rapierNotesLinksModule(), current = _rapierNotesCurrentFile();
	if (!L || !current || typeof L.rankTargets !== 'function') return null;
	const {candidates, recent} = _rapierNotesPickerCandidates(current);
	return L.rankTargets(String(query || ''), candidates, {recent}).slice(0, max).map(row => ({
		file: row.file,
		title: _rapierNotesLibraryTitle(row.file),
		dest: typeof L.linkDest === 'function' ? L.linkDest(row.file) : row.file,
	}));
}
function _rapierNotesPickerEl() {
	const lib = _rapierNotesLib;
	if (lib.picker && lib.picker.el.isConnected) return lib.picker;
	const el = _rapierNotesEl('div', 'rapier-notes-picker');
	el.id = 'rapier-notes-picker'; el.hidden = true;
	el.setAttribute('role', 'listbox'); el.setAttribute('aria-label', 'link a note');
	document.body.appendChild(el);
	// Outside the hidden listbox: the live region exists before the first option is announced.
	const status = _rapierNotesEl('div', 'sr-only');
	status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
	document.body.appendChild(status);
	lib.picker = {el, status, rows: [], at: 0, caret: null};
	return lib.picker;
}
function _rapierNotesPickerClose() {
	const lib = _rapierNotesLib;
	if (!lib.picker) return;
	lib.picker.el.hidden = true;
	lib.picker.status.textContent = '';
	lib.picker.el.replaceChildren();
	lib.picker.rows = []; lib.picker.caret = null;
}
function _rapierNotesPickerOpen() {
	const L = _rapierNotesLinksModule(), current = _rapierNotesCurrentFile();
	if (!L || !current) { _rapierNotesPickerClose(); return; }
	const caret = _rapierNotesPickerCaret();
	if (!caret) { _rapierNotesPickerClose(); return; }
	const {candidates, recent} = _rapierNotesPickerCandidates(current);
	const ranked = L.rankTargets(caret.query, candidates, {recent}).slice(0, RAPIER_NOTES_PICKER_MAX);
	const picker = _rapierNotesPickerEl();
	picker.caret = caret;
	picker.rows = ranked.map(r => r.file);
	// The alias that found each note (docs/notes-frontmatter.md, "Alias picker"): shown under its title,
	// and the words of the link it inserts; the destination is always the note itself.
	picker.aliases = ranked.map(r => r.alias || null);
	picker.at = 0;
	picker.el.replaceChildren();
	if (!ranked.length) {
		picker.el.appendChild(_rapierNotesEl('div', 'rapier-notes-picker-empty', candidates.length ? 'No note by that name' : 'No other note to link yet'));
	} else ranked.forEach((row, i) => {
		const b = _rapierNotesEl('button', 'rapier-notes-picker-row'); b.type = 'button';
		b.dataset.notesPick = row.file; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(i === 0));
		b.appendChild(_rapierNotesEl('span', '', _rapierNotesLibraryTitle(row.file)));
		if (row.alias) b.appendChild(_rapierNotesEl('span', 'rapier-notes-picker-alias', row.alias));
		b.onmousedown = evt => evt.preventDefault(); // the caret stays in the block the link goes into
		b.onclick = evt => { evt.preventDefault(); _rapierNotesPickerChoose(i); };
		picker.el.appendChild(b);
	});
	picker.el.hidden = false;
	_rapierNotesPickerPlace(picker);
	_rapierNotesPickerAnnounce(picker);
}
// Follows the caret's rect; flips above where the keyboard leaves no room.
function _rapierNotesPickerPlace(picker) {
	const sel = window.getSelection();
	if (!sel || !sel.rangeCount) return;
	const rect = sel.getRangeAt(0).getBoundingClientRect();
	const box = picker.el.getBoundingClientRect();
	const width = box.width || 240, height = box.height || 44;
	const left = Math.max(8, Math.min(window.innerWidth - width - 8, (rect.left || 8) - 8));
	const below = (rect.bottom || 0) + 6;
	const room = window.innerHeight - below - 8;
	picker.el.style.left = Math.round(left) + 'px';
	picker.el.style.top = Math.round(room >= height ? below : Math.max(8, (rect.top || 0) - height - 6)) + 'px';
}
function _rapierNotesPickerAnnounce(picker) {
	const file = picker.rows[picker.at];
	const alias = picker.aliases?.[picker.at];
	const message = file ? 'Link to ' + _rapierNotesLibraryTitle(file) + (alias ? ', as ' + alias : '') + '. ' + (picker.at + 1) + ' of ' + picker.rows.length + '.'
		: picker.el.firstChild?.textContent || '';
	if (picker.status.textContent !== message) picker.status.textContent = message;
}
function _rapierNotesPickerMove(step) {
	const picker = _rapierNotesPickerEl();
	if (!picker.rows.length) return;
	picker.at = (picker.at + step + picker.rows.length) % picker.rows.length;
	[...picker.el.children].forEach((row, i) => { row.setAttribute('aria-selected', String(i === picker.at)); if (i === picker.at) row.scrollIntoView({block: 'nearest'}); });
	_rapierNotesPickerAnnounce(picker);
}
function _rapierNotesPickerChoose(index) {
	const lib = _rapierNotesLib, L = _rapierNotesLinksModule();
	const picker = lib.picker;
	if (!picker || !L || typeof L.markdownLink !== 'function') return;
	const at = index == null ? picker.at : index, file = picker.rows[at], alias = picker.aliases?.[at] || null;
	const caret = _rapierNotesPickerCaret() || picker.caret;
	if (!file || !caret || !caret.node.isConnected) { _rapierNotesPickerClose(); return; }
	// execCommand acts on the focused editable: refocus first.
	const host = caret.node.parentElement && caret.node.parentElement.closest ? caret.node.parentElement.closest('.block-edit') : null;
	if (host && document.activeElement !== host) host.focus({preventScroll: true});
	const range = document.createRange();
	const start = Math.max(0, caret.offset - caret.span);
	range.setStart(caret.node, start);
	range.setEnd(caret.node, Math.min(caret.offset, String(caret.node.nodeValue || '').length));
	const sel = window.getSelection();
	sel.removeAllRanges(); sel.addRange(range);
	_rapierNotesPickerClose();
	// Insert via _insertLink/_rangeInsertHTML: typed text would be escaped to \[words\](dest).
	const title = alias || _rapierNotesLibraryTitle(file);
	const dest = typeof L.linkDest === 'function' ? L.linkDest(file) : file;
	const escape = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	if (typeof _rangeInsertHTML === 'function') _rangeInsertHTML('<a href="' + escape(dest) + '">' + escape(title) + '</a>');
	else document.execCommand('insertText', false, L.markdownLink(title, file));
}
function _rapierNotesPickerKey(evt) {
	if (evt.isComposing || evt.keyCode === 229) return;
	const lib = _rapierNotesLib;
	if (!lib.picker || lib.picker.el.hidden) return;
	if (evt.key === 'Escape') { evt.preventDefault(); evt.stopPropagation(); _rapierNotesPickerClose(); return; }
	if (!lib.picker.rows.length) { if (evt.key === 'Enter') _rapierNotesPickerClose(); return; }
	if (evt.key === 'ArrowDown' || evt.key === 'ArrowUp') { evt.preventDefault(); evt.stopPropagation(); _rapierNotesPickerMove(evt.key === 'ArrowDown' ? 1 : -1); return; }
	if (evt.key === 'Enter' || evt.key === 'Tab') { evt.preventDefault(); evt.stopPropagation(); _rapierNotesPickerChoose(); }
}
function _rapierNotesPickerInstall() {
	_rapierNotesPickerEl();
	let composing = false;
	const refresh = () => { if (!composing && _rapierNotesCurrentFile()) _rapierNotesPickerOpen(); else _rapierNotesPickerClose(); };
	document.addEventListener('compositionstart', () => { composing = true; _rapierNotesPickerClose(); }, true);
	document.addEventListener('compositionend', () => { composing = false; queueMicrotask(refresh); }, true);
	document.addEventListener('input', evt => { if (evt.isComposing) _rapierNotesPickerClose(); else refresh(); }, true);
	// Window capture: the editor takes Enter on its own document-capture listener.
	window.addEventListener('keydown', _rapierNotesPickerKey, true);
	document.addEventListener('pointerdown', evt => { if (!evt.target.closest || !evt.target.closest('.rapier-notes-picker')) _rapierNotesPickerClose(); }, true);
	window.addEventListener('resize', () => { if (_rapierNotesLib.picker && !_rapierNotesLib.picker.el.hidden) _rapierNotesPickerOpen(); });
}

// Read-only facts for witnesses via rapierNotesFacts.library.
function _rapierNotesLibraryFacts() {
	const lib = _rapierNotesLib, found = lib.results;
	return {
		query: _rapierNotes.query || '',
		partial: lib.partial || (_rapierNotes.reading && !_rapierNotes.reading.complete ? {reading: true} : null),
		// A33's targets as facts: notice sentence, stage, first hit; `run` changes with the question.
		notice: _rapierNotesLibraryNotice(), run: lib.run, hit: lib.hit,
		built: lib.build ? lib.build.done : null,
		held: _rapierNotes.texts.size, titles: _rapierNotes.titles ? _rapierNotes.titles.size : null, backlog: _rapierNotesLibraryBacklog(),
		results: found ? [...found.keys()] : null,
		ranked: found ? [...found.entries()].sort((a, b) => a[1].rank - b[1].rank).map(([f]) => f) : null,
		indexed: lib.sidx ? lib.sidx.notes.size : 0,
		links: lib.lidx ? lib.lidx.files.size : 0,
		renamed: lib.renamed,
		connections: lib.connections,
		picker: lib.picker && !lib.picker.el.hidden ? lib.picker.rows : null,
	};
}
if (document.readyState === 'complete') _rapierNotesPickerInstall(); else window.addEventListener('load', _rapierNotesPickerInstall, {once: true});
