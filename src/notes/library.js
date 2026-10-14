const RAPIER_NOTES_LIB_RECENT = 8, RAPIER_NOTES_LIB_MENTION_MIN = 4;
const _rapierNotesLib = {
	sidx: null, lidx: null, from: null, generation: null, sidecar: null, query: null, results: null, build: null, slice: null, runner: null, hydrate: null, partial: null, painted: 0, job: null, snips: null,
	chips: null, bar: null, picker: null, renamed: null, connections: null, secs: null, trustedPaint: false,
	run: null, runs: 0, hit: false, said: null,
};
function _rapierNotesSearchModule() { return globalThis.RapierNotesSearch; }
function _rapierNotesLinksModule() { return globalThis.RapierNotesLinks; }

function _rapierNotesLibrarySearchList(texts, index, query) {
	const S = _rapierNotesSearchModule();
	if (!S) return null;
	const built = S.buildSearchIndex(texts, index, {pictures: typeof _rapierOcrWords === 'function' ? _rapierOcrWords() : null});
	const found = S.confirmSearch(S.search(built, query, {limit: Object.keys(index.notes).length}), texts);
	return found.confirm.length ? null : new Set(found.results.map(row => row.file));
}

function _rapierNotesLibraryTextsComplete() {
	const lib = _rapierNotesLib, L = _rapierNotesLinksModule();
	if (lib.lidx && L && lib.from === _rapierNotes.texts) _rapierNotesLibraryRunner().resolve();
	lib.results = null; lib.query = null;
}
function _rapierNotesLibraryBegin() {
	_rapierNotesLibrarySearchIndex(); _rapierNotesLibraryLinkIndex();
	const state = _rapierNotes, plan = state.cachePlan;
	if (!plan || !plan.reuse?.length) return Promise.resolve(true);
	const S = _rapierNotesSearchModule(), L = _rapierNotesLinksModule(), lib = _rapierNotesLib;
	if (!lib.build || !lib.lidx || typeof S?.hydrateSearchIndex !== 'function' || typeof L?.hydrateLinkIndex !== 'function' || typeof state.searchCache?.take !== 'function') {
		state.cachePlan = null;
		return Promise.resolve(true);
	}
	if (lib.hydrate?.plan === plan) return lib.hydrate.promise;
	lib.hydrate?.stop();
	const from = state.texts, gen = state.loadGen, large = plan.total > 200;
	const task = {plan, cancel: null, stop: null, promise: null};
	let at = 0, resolve, settled = false;
	task.promise = new Promise(done => { resolve = done; });
	const finish = ok => {
		if (settled) return; settled = true;
		task.cancel?.(); task.cancel = null;
		if (ok) {
			const notes = state.index?.notes || {};
			for (const file of plan.ready) if (!notes[file]) plan.ready.delete(file);
			plan.reused = plan.ready.size;
			plan.reread = Object.keys(notes).filter(file => !plan.ready.has(file));
		} else plan.ready.clear();
		plan.reuse = [];
		if (lib.hydrate === task) lib.hydrate = null;
		resolve(ok);
	};
	task.stop = () => finish(false);
	lib.hydrate = task; plan.reused = 0; plan.ready = new Set();
	const live = () => lib.hydrate === task && lib.from === from && state.texts === from && state.loadGen === gen;
	const arm = () => { task.cancel = _rapierNotesLibraryIdle(run); };
	const run = deadline => {
		if (!live()) { finish(false); return; }
		task.cancel = null;
		if (large && typeof _rapierNotesBackgroundBlocked === 'function' && _rapierNotesBackgroundBlocked()) { arm(); return; }
		const started = globalThis.performance?.now() ?? Date.now();
		let taken = 0;
		try {
			do {
				const row = plan.reuse[at]; plan.reuse[at++] = null;
				const present = !!state.index?.notes?.[row.file];
				const projection = present && state.searchCache.take(row);
				if (projection) {
					const admitted = [{...row, projection}];
					lib.build = S.hydrateSearchIndex(lib.build, admitted, {own: true});
					lib.sidx = lib.build.index;
					lib.lidx = L.hydrateLinkIndex(lib.lidx, admitted, {stream: true, pending: lib.build.pending});
					plan.ready.add(row.file); plan.reused++;
				} else if (present) plan.reread.push(row.file);
				taken++;
			} while (at < plan.reuse.length && (!large || taken < 64 &&
				(globalThis.performance?.now() ?? Date.now()) - started < 4 &&
				(!deadline || deadline.timeRemaining() > 1) &&
				!(typeof _rapierNotesBackgroundBlocked === 'function' && _rapierNotesBackgroundBlocked())));
		} catch (_) {
			state.cachePlan = null; finish(true); lib.from = null;
			_rapierNotesLibrarySearchIndex(); _rapierNotesLibraryLinkIndex();
			return;
		}
		lib.results = null; lib.query = null;
		if (state.open && state.query && Date.now() - lib.painted > 250 &&
			!(typeof _rapierNotesBackgroundBlocked === 'function' && _rapierNotesBackgroundBlocked())) {
			lib.painted = Date.now(); lib.trustedPaint = true;
			try { _rapierNotesRender(); } finally { lib.trustedPaint = false; }
		}
		if (at < plan.reuse.length) arm(); else finish(true);
	};
	if (large) arm(); else run(null);
	return task.promise;
}
function _rapierNotesLibraryTaken(file) {
	const lib = _rapierNotesLib;
	return lib.from === _rapierNotes.texts && !!lib.build && !!lib.lidx && !lib.build.pending.has(file) && lib.lidx.out.has(file);
}
function _rapierNotesLibraryBacklog() { const b = _rapierNotesLib.build; return b && !b.done ? b.pending.size : 0; }
function _rapierNotesLibraryFresh() {
	const state = _rapierNotes, lib = _rapierNotesLib;
	if (lib.from === state.texts && lib.generation === state.loadGen) return true;
	lib.slice?.cancel?.(); lib.runner?.cancel(); lib.hydrate?.stop();
	lib.from = state.texts; lib.generation = state.loadGen; lib.sidecar = null; lib.linksPending = null; lib.slice = null; lib.runner = null; lib.sidx = null; lib.lidx = null; lib.build = null; lib.partial = null; lib.results = null; lib.query = null; lib.job = null; lib.snips = null; lib.secs = null;
	return false;
}
function _rapierNotesLibraryIdle(run) {
	if (typeof requestIdleCallback === 'function') { const id = requestIdleCallback(run, {timeout: 100}); return () => globalThis.cancelIdleCallback?.(id); }
	if (typeof setTimeout === 'function') { const id = setTimeout(() => run(null), 0); return () => globalThis.clearTimeout?.(id); }
	run(null); return null;
}
function _rapierNotesLibrarySearchIndex() {
	const S = _rapierNotesSearchModule(), state = _rapierNotes, lib = _rapierNotesLib;
	if (!S || !state.index) return null;
	_rapierNotesLibraryFresh();
	if (!lib.build) { lib.build = S.beginSearchIndex(state.texts, state.index, {pictures: typeof _rapierOcrWords === 'function' ? _rapierOcrWords() : null}); if (!lib.build.done) _rapierNotesLibraryScheduleSlice(); }
	lib.sidx = lib.build.index;
	lib.sidx.sidecar = state.index; lib.sidx.sections = state.index.sections || [];
	return lib.sidx;
}
function _rapierNotesLibraryWorker() {
	const S = _rapierNotesSearchModule(), parser = typeof _rapierParseRuntime !== 'undefined' && _rapierParseRuntime.markdownSource;
	if (typeof Worker !== 'function' || typeof S?.workerSource !== 'function' || !parser) throw new Error('Search worker is unavailable');
	const url = URL.createObjectURL(new Blob([parser, '\n', S.workerSource()], {type: 'text/javascript'}));
	try { return new Worker(url, {name: 'rapier-notes-search'}); }
	finally { URL.revokeObjectURL(url); }
}
function _rapierNotesLibraryRunner() {
	const lib = _rapierNotesLib, state = _rapierNotes, from = state.texts, gen = state.loadGen;
	if (!lib.runner) lib.runner = _rapierNotesSearchModule().createSearchIndexRunner({
		getState: () => lib.build,
		setState: build => { lib.build = build; lib.sidx = build.index; lib.results = null; lib.query = null; },
		getLinks: () => lib.lidx,
		setLinks: index => { lib.lidx = index; lib.results = null; },
		createWorker: _rapierNotesLibraryWorker,
		live: () => lib.from === from && state.texts === from && state.loadGen === gen,
		wake: _rapierNotesLibraryScheduleSlice,
		streaming: () => typeof _rapierNotesTextsComplete === 'function' && !_rapierNotesTextsComplete(),
		completed: (file, prepared) => {
			if (prepared) { state.titles?.set(file, prepared.title); state.readFailed?.delete(file); }
			lib.linksPending?.delete(file);
			_rapierNotesLibraryRemember(file, prepared);
			if (typeof _rapierNotesLetGo === 'function') _rapierNotesLetGo(file);
		},
		unreadable: file => {
			lib.linksPending?.delete(file);
			if (typeof _rapierNotesHold === 'function') _rapierNotesHold(file, '');
			state.unreadable?.add(file);
		},
	});
	return lib.runner;
}
function _rapierNotesLibraryChange(file, text, entry) {
	const lib = _rapierNotesLib, S = _rapierNotesSearchModule(), old = lib.build.index.notes.get(file);
	const size = typeof text === 'string' ? text.length : text?.searchText?.length || 0;
	const words = old?.bag ? Object.values(old.bag).reduce((sum, field) => sum + field.size, 0) : 0;
	const links = lib.lidx?.out.get(file)?.length || 0;
	const deferred = lib.build.pending.has(file) || lib.runner?.owns(file) || size > S.SEARCH_WORKER_CHARS || words > S.SEARCH_WORKER_WORDS || links > S.SEARCH_WORKER_LINKS;
	if (!deferred) {
		lib.build = S.updateSearchIndex(lib.build, file, text, entry, {own: true}); lib.sidx = lib.build.index;
	} else _rapierNotesLibraryRunner().queue(file, text, entry);
	if (!lib.build.done) _rapierNotesLibraryScheduleSlice();
	return deferred;
}
function _rapierNotesLibraryScheduleSlice() {
	const lib = _rapierNotesLib, state = _rapierNotes, from = state.texts, gen = state.loadGen;
	if (lib.slice) return;
	const task = lib.slice = {cancel: null};
	const run = deadline => {
		if (lib.slice !== task || lib.from !== from || state.loadGen !== gen) return;
		lib.slice = null;
		if (!lib.build) return;
		if (typeof _rapierNotesBackgroundBlocked === 'function' && _rapierNotesBackgroundBlocked()) { _rapierNotesLibraryScheduleSlice(); return; }
		const runner = _rapierNotesLibraryRunner(), large = state.sizes?.size > 200, began = globalThis.performance?.now() ?? Date.now();
		const timed = !!deadline && typeof deadline.timeRemaining === 'function';
		const young = () => (globalThis.performance?.now() ?? Date.now()) - began < 4 && !(typeof _rapierNotesBackgroundBlocked === 'function' && _rapierNotesBackgroundBlocked());
		let more = runner.step(), kind;
		for (let steps = 1; more && (kind = runner.cheap) && steps < (timed ? 256 : large ? 1 : 16); steps++) {
			const bounded = large || kind === 'short';
			if (timed ? (bounded || steps % 16 === 0) && !(deadline.timeRemaining() > (large ? 1 : 8) && (!bounded || young())) : kind === 'short' && !young()) break;
			more = runner.step();
		}
		if (more) _rapierNotesLibraryScheduleSlice();
		const now = Date.now();
		if (state.open && state.query && ((lib.build.done && (!state.reading || state.reading.complete)) || now - lib.painted > 250) &&
			!(typeof _rapierNotesBackgroundBlocked === 'function' && _rapierNotesBackgroundBlocked())) { lib.painted = now; lib.trustedPaint = true; try { _rapierNotesRender(); } finally { lib.trustedPaint = false; } }
	};
	task.cancel = _rapierNotesLibraryIdle(run);
}
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
function _rapierNotesLibraryRead(file, text = _rapierNotes.texts.get(file)) {
	const lib = _rapierNotesLib, state = _rapierNotes;
	if (lib.from !== state.texts || text == null) return false;
	const S = _rapierNotesSearchModule(), L = _rapierNotesLinksModule(), entry = (state.index && state.index.notes[file]) || {};
	let changed = false;
	const deferred = lib.runner?.owns(file);
	if (lib.build && S && !lib.build.index.notes.has(file)) {
		if (deferred) lib.runner.queue(file, text, entry);
		else lib.build = S.updateSearchIndex(lib.build, file, text, entry, {queue: true, own: true});
		lib.sidx = lib.build.index; if (!lib.build.done) _rapierNotesLibraryScheduleSlice(); changed = true;
	}
	const large = deferred || !!text?.searchBytes || (typeof text === 'string' ? text.length : text.searchText.length) > S.SEARCH_WORKER_CHARS;
	if (lib.lidx && L && !lib.lidx.out.has(file) && !large) { lib.lidx = L.updateLinkIndex(lib.lidx, file, typeof text === 'string' ? text : text.searchText, {stream: !_rapierNotesTextsComplete(), mapLink: text.mapLink}); changed = true; }
	if (changed) { lib.results = null; if (!lib.build?.pending.has(file) && lib.lidx?.out.has(file)) lib.linksPending?.delete(file); }
	if (changed && typeof _rapierOcrJoined === 'function') _rapierOcrJoined(file);
	return !!lib.build && !!lib.lidx;
}
function _rapierNotesLibraryRemember(file, prepared) {
	const state = _rapierNotes, lib = _rapierNotesLib, cache = state.searchCache;
	if (!cache || !state.readBracket) return;
	const bracket = state.readBracket.get(file);
	if (!bracket) return;
	state.readBracket.delete(file);
	const search = lib.build?.index?.notes?.get(file);
	if (!search || !lib.lidx?.files?.has(file)) return;
	try {
		cache.remember(file, {...(prepared?.encoded ? {encoded: prepared.encoded} : {search, links: {out: lib.lidx.out.get(file), aliases: lib.lidx.aliases.get(file)}}),
			...(state.titles?.has(file) ? {title: state.titles.get(file)} : {})},
			bracket.before, bracket.after, bracket.observedAt);
	} catch (_) {  }
}
function _rapierNotesLibraryPartial() { return _rapierNotesLib.partial; }
function _rapierNotesLibraryNoticeFacts() {
	const lib = _rapierNotesLib, state = _rapierNotes;
	const query = String(state.query || '').trim();
	if (!query || !state.index || !lib.query || lib.query !== query) return null;
	const total = Object.keys(state.index.notes).length;
	if (!total) return null;
	const job = lib.job, found = job ? job.found : lib.results;
	if (!found) return null;
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
function _rapierNotesLibraryVisible() {
	const state = _rapierNotes;
	if (!state.surface) return [];
	return [...state.surface.querySelectorAll('.rapier-notes-card[data-notes-file]')].map(el => el.dataset.notesFile);
}
function _rapierNotesLibraryLinkIndex() {
	const L = _rapierNotesLinksModule(), lib = _rapierNotesLib;
	if (!L) return null;
	_rapierNotesLibraryFresh();
	if (!lib.lidx) lib.lidx = L.buildLinkIndex(new Map([..._rapierNotes.texts].filter(([file, text]) => !_rapierNotesModel().isCodeFile(file) && text.length <= _rapierNotesSearchModule().SEARCH_WORKER_CHARS)));
	return lib.lidx;
}
function _rapierNotesLibraryTouch(file, gone) {
	if (typeof _rapierSwitcherForget === 'function') _rapierSwitcherForget();
	const lib = _rapierNotesLib, state = _rapierNotes;
	if (lib.from !== state.texts) return;
	const text = gone ? null : state.texts.get(file);
	if (text == null && !gone) return;
	const S = _rapierNotesSearchModule(), L = _rapierNotesLinksModule();
	const deferred = lib.build && S && _rapierNotesLibraryChange(file, text, (state.index && state.index.notes[file]) || {});
	if (lib.lidx && L && !_rapierNotesModel().isCodeFile(file) && !deferred) lib.lidx = L.updateLinkIndex(lib.lidx, file, text);
	lib.results = null; lib.job = null; if (lib.snips) lib.snips.delete(file);
	if (typeof _rapierOcrTouched === 'function') _rapierOcrTouched(file, gone);
}
function _rapierNotesLibraryPictures(file, words) {
	const lib = _rapierNotesLib, S = _rapierNotesSearchModule(), state = _rapierNotes;
	if (!lib.build || !S || typeof S.updateSearchPictures !== 'function' || lib.from !== state.texts) return;
	if (!lib.build.index.pictures && typeof _rapierOcrWords === 'function' && _rapierOcrWords()) lib.build.index.pictures = _rapierOcrWords();
	if (lib.build.pending.has(file)) _rapierNotesLibraryRunner().queue(file, lib.build.pending.get(file), state.index.notes?.[file]);
	lib.build = S.updateSearchPictures(lib.build, file, words, {own: true});
	lib.sidx = lib.build.index;
	lib.results = null; lib.job = null; if (lib.snips) lib.snips.delete(file);
	if (state.open && state.query) { lib.trustedPaint = true; try { _rapierNotesRender(); } finally { lib.trustedPaint = false; } }
}

function _rapierNotesLibraryRun() {
	_rapierNotesLibraryFresh();
	const state = _rapierNotes, S = _rapierNotesSearchModule(), lib = _rapierNotesLib;
	const query = String(state.query || '').trim();
	if (lib.sidecar !== state.index) { lib.sidecar = state.index; lib.results = null; lib.job = null; lib.snips = null; }
	if (lib.results && lib.query === query) return lib.results;
	if (lib.job && lib.job.query === query) return lib.job.found;
	if (lib.query !== query) lib.snips = null;
	lib.query = query; lib.job = null; lib.hit = false; lib.run = 'q' + (++lib.runs) + ':' + state.loadGen;
	if (!query) { lib.results = null; lib.partial = null; lib.run = null; return null; }
	const sidx = _rapierNotesLibrarySearchIndex();
	if (!sidx) { lib.results = null; return null; }
	const asked = state.searchPictures ? query : query + ' pictures:off';
	const total = Object.keys(state.index.notes).length;
	const answers = [S.search(sidx, asked, {limit: total, candidateOrder: true})];
	if (!S.parseQuery(query).filters.is.some(is => is === 'archived' || is === 'trash' || is === 'trashed')) for (const also of ['is:archived', 'is:trash']) answers.push(S.search(sidx, asked + ' ' + also, {limit: total, candidateOrder: true}));
	const found = _rapierNotesLibraryCompose(answers);
	const confirm = new Set(answers.flatMap(a => a.confirm));
	lib.partial = state.reading && (!state.reading.complete || sidx.notes.size < total) ? {done: sidx.notes.size, total, ...(state.reading.complete && (lib.build.done || sidx.progress?.unread) ? {unread: true} : {})} : answers[0].partial ? answers[0].progress : null;
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
function _rapierNotesLibraryBatch(job) {
	const state = _rapierNotes, pass = state.reads?.read;
	const pending = [...job.confirm];
	if (typeof pass?.plan !== 'function' || typeof _rapierNotesReadRow !== 'function') return pending.slice(0, 16);
	const candidates = new Set(job.answers.flatMap(answer => answer.candidates || []));
	const ordered = [...candidates].filter(file => job.confirm.has(file)).concat(pending.filter(file => !candidates.has(file)));
	try {
		const rows = ordered.map(file => ({..._rapierNotesReadRow(file), priority: candidates.has(file)}));
		const arrived = pending.filter(file => state.texts.has(file));
		const plan = pass.plan(rows, {visible: job.visible || [], arrived, limit: 16});
		const order = plan.map(row => row.key);
		for (const file of pending) { if (order.length === 16) break; if (!order.includes(file)) order.push(file); }
		return order;
	} catch (_) { return pending.slice(0, 16); }
}
async function _rapierNotesLibraryConfirm(job) {
	const state = _rapierNotes, S = _rapierNotesSearchModule(), lib = _rapierNotesLib;
	const live = () => lib.job === job && lib.sidecar === state.index && String(state.query || '').trim() === job.query && lib.from === state.texts && state.loadGen === job.gen;
	while (job.confirm.size && live()) {
		const batch = _rapierNotesLibraryBatch(job);
		const texts = await _rapierNotesTexts(batch, {hold: false});
		if (!live()) return;
		job.answers = job.answers.map(a => S.confirmSearch(a, texts));
		for (const f of batch) job.confirm.delete(f);
		const before = job.found.size;
		job.found = _rapierNotesLibraryCompose(job.answers);
		if (!lib.hit && job.found.size > before) lib.hit = true;
		const unresolved = new Set(job.answers.flatMap(a => a.confirm)).size;
		lib.partial = job.coverage ? {...job.coverage, done: job.coverage.done - unresolved} : unresolved ? {done: job.total - unresolved, total: job.total, ...(!job.confirm.size ? {unread: true} : {})} : null;
		if (!job.confirm.size) { lib.results = job.found; lib.job = null; }
		if (state.open) { lib.trustedPaint = true; try { _rapierNotesRender(); } finally { lib.trustedPaint = false; } }
	}
}
function _rapierNotesLibraryMatches(file) {
	const found = _rapierNotesLibraryRun();
	return !found || found.has(file);
}
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
function _rapierNotesLibraryHit(file) {
	const found = _rapierNotesLibraryRun();
	if (!found || !found.has(file) || !_rapierNotesLibraryWordy()) return null;
	const lib = _rapierNotesLib, S = _rapierNotesSearchModule(), text = _rapierNotes.texts.get(file), note = lib.sidx && lib.sidx.notes.get(file);
	if (typeof text !== 'string' || !note) return null;
	if (!lib.snips) lib.snips = new Map();
	let snip = lib.snips.get(file);
	if (snip === undefined) { snip = S.snippetFor(note, lib.query, text); if (lib.snips.size >= 64) lib.snips.delete(lib.snips.keys().next().value); lib.snips.set(file, snip); }
	return snip && snip.text ? snip : null;
}
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
	if (snip.text.trim() === _rapierNotesLibraryTitle(file).trim()) return null;
	const p = _rapierNotesEl('p', 'rapier-notes-snippet' + (snip.picture ? ' rapier-notes-snippet--picture' : ''));
	if (snip.picture) { const glyph = _rapierNotesGlyph('image'); glyph.setAttribute('aria-hidden', 'true'); p.appendChild(glyph); p.setAttribute('aria-label', 'in a picture: ' + snip.text); }
	const to = Math.max(snip.from, Math.min(snip.to, snip.text.length));
	p.append(_rapierNotesLibraryPlain(snip.text.slice(0, snip.from), true, false));
	if (to > snip.from) p.appendChild(_rapierNotesEl('mark', '', snip.text.slice(snip.from, to)));
	p.append(_rapierNotesLibraryPlain(snip.text.slice(to), false, true));
	return p;
}
function _rapierNotesLibraryMarkTitle(el, file) {
	const snip = _rapierNotesLibraryHit(file);
	if (!snip || snip.to <= snip.from) return;
	const words = snip.text.slice(snip.from, snip.to), title = el.textContent;
	const at = title.toLowerCase().indexOf(words.toLowerCase());
	if (at < 0) return;
	if (el.querySelector('span.rapier-ink-mark')) {
		const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), nodes = [];
		for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
		let offset = 0;
		for (const node of nodes) {
			const length = node.nodeValue.length, from = Math.max(0, at - offset), to = Math.min(length, at + words.length - offset);
			offset += length;
			if (to <= from) continue;
			if (to < length) node.splitText(to);
			const hit = from ? node.splitText(from) : node, mark = _rapierNotesEl('mark');
			hit.replaceWith(mark); mark.appendChild(hit);
		}
		return;
	}
	el.textContent = '';
	el.append(title.slice(0, at));
	el.appendChild(_rapierNotesEl('mark', '', title.slice(at, at + words.length)));
	el.append(title.slice(at + words.length));
}

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
	const open = !!state.find && !state.find.hidden, focused = el.contains(document.activeElement), keepFocus = _rapierNotesKeepFocus(el);
	el.hidden = !open;
	if (!open) { el.replaceChildren(); if (focused) state.surface.querySelector('[data-notes-act="search"]')?.focus({preventScroll: true}); return; }
	_rapierNotesLibrarySearchIndex();
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
	const kinds = _rapierNotesEl('div', 'rapier-notes-filter-row rapier-notes-filter-row--kinds');
	for (const [term, word] of [['has:remind', 'Reminders'], ['has:list', 'Lists'], ['has:picture', 'Pictures'], ['has:drawing', 'Drawings']]) {
		if (term !== 'has:remind' || _rapierNotesIsApp()) kinds.appendChild(chip(term, word));
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
	el.replaceChildren(...[kinds, own.childElementCount ? own : null, colours, _rapierNotesLibraryPicturesRow()].filter(Boolean));
	keepFocus();
}

function _rapierNotesLibraryPicturesRow() {
	const state = _rapierNotes;
	if (typeof _rapierOcrToggleEl !== 'function') return null;
	const row = _rapierNotesEl('div', 'rapier-notes-filter-row rapier-notes-filter-row--toggle');
	const toggle = _rapierOcrToggleEl(!!state.searchPictures, () => _rapierNotesLibraryPicturesToggle());
	toggle.id = 'rapier-notes-pictures-toggle';
	row.appendChild(toggle);
	return row;
}
function _rapierNotesLibraryPicturesSet(on) {
	const state = _rapierNotes, lib = _rapierNotesLib;
	state.searchPictures = !!on; state.picturesWanted = false;
	lib.results = null; lib.job = null; lib.snips = null;
	_rapierNotesLibraryChips();
	if (state.query) _rapierNotesRender();
}
function _rapierNotesLibraryPicturesToggle() {
	const state = _rapierNotes;
	if (state.searchPictures) { _rapierNotesLibraryPicturesSet(false); return; }
	if (typeof _rapierOcrWords === 'function' && _rapierOcrWords()) { _rapierNotesLibraryPicturesSet(true); return; }
	state.picturesWanted = true;
	if (typeof _rapierOcrRequest === 'function') _rapierOcrRequest(true);
}
window.addEventListener('rapier:ocrplugin', event => {
	if (event.detail?.status === 'ready' && _rapierNotes.picturesWanted) _rapierNotesLibraryPicturesSet(true);
});

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
		if (act !== 'pin') { b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-controls', 'rapier-notes-sheet'); b.setAttribute('aria-expanded', 'false'); }
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
	if (head) { head.inert = !!n; _rapierIsolationFence([head], !!n); }
	for (const button of bar.querySelectorAll('[aria-controls="rapier-notes-sheet"]')) {
		const face = {'remind-face': 'remind', colour: 'colour', 'section-face': 'section', 'sheet-actions': 'actions'}[button.dataset.notesAct];
		button.setAttribute('aria-expanded', String(!!state.sheetRelease && state.sheetMode === face));
	}
	if (!n) return;
	const count = bar.querySelector('.rapier-notes-selcount'); count.textContent = String(n);
	count.appendChild(_rapierNotesEl('span', 'sr-only', n === 1 ? ' note selected' : ' notes selected'));
	const pin = bar.querySelector('[data-notes-act="pin"]');
	const entries = [...state.selected].map(f => state.index && state.index.notes[f]).filter(Boolean);
	const pinned = entries.length && entries.every(e => e.pinned);
	if (pin) { pin.setAttribute('aria-pressed', String(!!pinned)); pin.setAttribute('aria-label', pinned ? 'unpin' : 'pin'); if (pinned) pin.dataset.active = 'true'; else delete pin.dataset.active; }
}

function _rapierNotesLibraryRenameWho(oldFile) {
	const index = _rapierNotesLibraryLinkIndex();
	if (!index || _rapierNotesLib.linksPending?.size || _rapierNotesLib.runner?.linksPending || _rapierNotesLib.build?.pending.size || Object.keys(_rapierNotes.index?.notes || {}).some(file => !index.files.has(file))) return undefined;
	const who = new Set((index.in.get(oldFile) || []).map(r => r.from));
	for (const L of index.out.get(oldFile) || []) if (L.resolved && L.resolved.file === oldFile) who.add(oldFile);
	return [...who];
}
function _rapierNotesLibraryLinksReady() {
	const lib = _rapierNotesLib;
	return lib.from === _rapierNotes.texts && lib.generation === _rapierNotes.loadGen &&
		!lib.linksPending?.size && !lib.runner?.linksPending && !lib.build?.pending.size;
}
function _rapierNotesLibraryRefit(text, changed) {
	let next = String(text);
	for (const span of changed) {
		if (next.slice(span.start, span.end) !== span.was) return null;
		next = next.slice(0, span.start) + span.now + next.slice(span.end);
	}
	return next;
}
async function _rapierNotesLibraryRenamed(report) {
	const lib = _rapierNotesLib, state = _rapierNotes, L = _rapierNotesLinksModule();
	lib.renamed = report; lib.results = null; lib.job = null;
	if (typeof _rapierOcrTouched === 'function') _rapierOcrTouched(report.from, true);
	if (!lib.lidx || !L || lib.from !== state.texts) return;
	const from = state.texts, gen = state.loadGen;
	const affected = new Set([report.to, ...((report.linking || Object.keys(state.index.notes)).filter(file => file !== report.from))]);
	lib.linksPending = affected;
	for (const file of [report.from, ...affected]) {
		const S = _rapierNotesSearchModule();
		if (lib.build && S) _rapierNotesLibraryRunner().queue(file, null, undefined);
	}
	for (const file of [...affected]) {
		if (state.texts !== from || state.loadGen !== gen || lib.linksPending !== affected) return;
		state.texts.delete(file); state.readFailed.delete(file);
		await _rapierNotesReadOne(file, {search: true});
		if (state.texts !== from || state.loadGen !== gen || lib.linksPending !== affected) return;
		if (!lib.build?.pending.has(file) && lib.lidx.out.has(file) && !state.readFailed.has(file) && !state.unreadable?.has(file)) affected.delete(file);
		_rapierNotesLetGo(file);
	}
	_rapierNotesLibraryRunner().resolve();
	lib.results = null; lib.query = null;
}
function _rapierNotesLibraryTitle(file) {
	const M = _rapierNotesModel(), state = _rapierNotes;
	const plain = String(file).replace(/\.md$/i, '');
	const kept = state.titles?.has(file) ? state.titles.get(file) : null;
	if (kept == null && !M) return plain;
	const title = kept == null ? M.projectCard(file, state.texts.get(file) || '').title || '' : kept;
	const text = state.texts?.get(file);
	return title.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').trim() || (text != null && M ? M.noteTitle(text) : '') || plain;
}
function _rapierNotesLibraryConnections(file) {
	const L = _rapierNotesLinksModule(), index = _rapierNotesLibraryLinkIndex();
	if (!L || !index) return null;
	const out = [], seen = new Set();
	for (const link of index.out.get(file) || []) {
		const to = link.resolved && link.resolved.file;
		if (!to || to === file || seen.has(to) || _rapierNotes.index?.notes[to]?.trashed) continue;
		seen.add(to); out.push(to);
	}
	const back = [], from = new Set();
	for (const rec of index.in.get(file) || []) {
		if (rec.from === file || from.has(rec.from) || _rapierNotes.index?.notes[rec.from]?.trashed) continue;
		from.add(rec.from); back.push(rec.from);
	}
	let mentions = [];
	try { if (_rapierNotesLibraryLinksReady()) {
		const title = _rapierNotesLibraryTitle(file);
		mentions = L.unlinkedMentions(index, _rapierNotes.texts, file, {titles: [title], minLength: RAPIER_NOTES_LIB_MENTION_MIN})
			.slice(0, 20).map(hit => { const row = _rapierNotesReadRow(hit.file); return {...hit, was: title, revision: row.revision, bytes: row.bytes, generation: _rapierNotes.loadGen}; });
	} }
	catch (_) { mentions = []; }
	return {file, out, back, mentions: mentions.slice(0, 20), incomplete: !!_rapierNotesLib.linksPending?.size || !!_rapierNotesLib.runner?.linksPending || !!_rapierNotesLib.build?.pending.size};
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
			link.setAttribute('aria-label', 'Link it: ' + _rapierNotesLibraryTitle(hit.file));
			link.onclick = () => { void _rapierNotesLibraryLinkMention(file, hit); };
			line.append(open, link);
			sheet.appendChild(line);
		}
	}
}
function _rapierNotesFollowLink(href) {
	const state = _rapierNotes, L = _rapierNotesLinksModule(), current = _rapierNotesCurrentFile();
	if (!L || !current) return false;
	const link = L.scanLinks('[x](' + String(href).replace(/[()\s<>]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')) + ')')[0];
	_rapierNotesLibraryFresh();
	const files = Object.keys(state.index?.notes || {});
	const found = link ? L.resolveLink(link, {from: current, files: new Set(files), aliases: _rapierNotesLib.lidx?.aliases}) : null;
	if (!found || !found.file) return false;
	if (state.index.notes[found.file]?.trashed) { showToast('That note is in the recycle bin.', 'info'); return true; }
	if (found.file === current) return true;
	const trail = state.noteTrail || [];
	state.noteTrail = [...trail, current]; state.trailKeep = true;
	void _rapierNotesOpenNote(found.file).then(opened => { if (opened !== true && state.current === current) state.noteTrail = trail; }, () => { state.noteTrail = trail; });
	return true;
}
async function _rapierNotesLibraryLinkMention(target, hit) {
	const state = _rapierNotes, L = _rapierNotesLinksModule();
	if (!L || typeof L.markdownLink !== 'function') return;
	const text = state.texts.get(hit.file);
	if (text == null) return;
	const row = _rapierNotesReadRow(hit.file);
	if (!_rapierNotesLibraryLinksReady() || state.loadGen !== hit.generation || row.revision !== hit.revision || row.bytes !== hit.bytes || text.slice(hit.start, hit.end) !== hit.was) return;
	const was = hit.was;
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
function _rapierNotesPickerCandidates(current) {
	const state = _rapierNotes, files = Object.keys((state.index && state.index.notes) || {}).filter(f => f !== current && !state.index.notes[f].trashed);
	const stamp = f => Number(state.index.notes[f].modified || state.index.notes[f].created || 0);
	const recent = files.slice().sort((a, b) => stamp(b) - stamp(a)).slice(0, RAPIER_NOTES_LIB_RECENT);
	_rapierNotesLibraryFresh();
	return _rapierNotesLinksModule().pickerCandidates({files, aliases: _rapierNotesLib.lidx?.aliases}, state.texts, {current, recent, titles: state.titles});
}
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
	const status = _rapierNotesEl('div', 'sr-only');
	status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
	document.body.appendChild(status);
	lib.picker = {el, status, rows: [], at: 0, caret: null};
	return lib.picker;
}
function _rapierNotesPickerReleaseHost(picker) {
	if (picker.host) for (const [name, value] of picker.hostAttributes || []) {
		if (value == null) picker.host.removeAttribute(name); else picker.host.setAttribute(name, value);
	}
	picker.host = null; picker.hostAttributes = null;
}
function _rapierNotesPickerClose() {
	const lib = _rapierNotesLib;
	if (!lib.picker) return;
	const {host, el} = lib.picker, focused = el.contains(document.activeElement);
	_rapierNotesPickerReleaseHost(lib.picker);
	lib.picker.el.hidden = true;
	lib.picker.status.textContent = '';
	lib.picker.el.replaceChildren();
	lib.picker.rows = []; lib.picker.caret = null;
	if (focused && host?.isConnected && !host.closest('[inert]') && host.getClientRects().length) host.focus({preventScroll: true});
}
function _rapierNotesPickerOpen() {
	const L = _rapierNotesLinksModule(), current = _rapierNotesCurrentFile();
	if (!L || !current) { _rapierNotesPickerClose(); return; }
	const caret = _rapierNotesPickerCaret();
	if (!caret) { _rapierNotesPickerClose(); return; }
	const {candidates, recent} = _rapierNotesPickerCandidates(current);
	const ranked = L.rankTargets(caret.query, candidates, {recent}).slice(0, RAPIER_NOTES_PICKER_MAX);
	const picker = _rapierNotesPickerEl(), active = document.activeElement;
	const host = active?.isContentEditable && active.contains(caret.node) ? active
		: picker.el.contains(active) && picker.host?.isContentEditable && picker.host.contains(caret.node) ? picker.host : null;
	if (!host) { _rapierNotesPickerClose(); return; }
	if (picker.host !== host) {
		_rapierNotesPickerReleaseHost(picker); picker.host = host;
		picker.hostAttributes = ['role', 'aria-label', 'aria-multiline', 'aria-controls', 'aria-expanded', 'aria-autocomplete', 'aria-haspopup', 'aria-activedescendant'].map(name => [name, host.getAttribute(name)]);
	}
	if (!host.hasAttribute('aria-label') && !host.hasAttribute('aria-labelledby')) host.setAttribute('aria-label', 'Link a note');
	host.removeAttribute('aria-multiline');
	host.setAttribute('role', 'combobox'); host.setAttribute('aria-controls', picker.el.id); host.setAttribute('aria-expanded', 'true'); host.setAttribute('aria-autocomplete', 'list'); host.setAttribute('aria-haspopup', 'listbox');
	picker.caret = caret;
	picker.rows = ranked.map(r => r.file);
	picker.aliases = ranked.map(r => r.alias || null);
	picker.at = 0;
	picker.el.replaceChildren();
	if (!ranked.length) {
		const empty = _rapierNotesEl('div', 'rapier-notes-picker-empty', candidates.length ? 'No note by that name' : 'No other note to link yet');
		empty.setAttribute('role', 'option'); empty.setAttribute('aria-disabled', 'true'); picker.el.appendChild(empty);
	} else ranked.forEach((row, i) => {
		const b = _rapierNotesEl('button', 'rapier-notes-picker-row'); b.type = 'button';
		b.id = 'rapier-notes-pick-' + i; b.tabIndex = -1;
		b.dataset.notesPick = row.file; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(i === 0));
		b.appendChild(_rapierNotesEl('span', '', _rapierNotesLibraryTitle(row.file)));
		if (row.alias) b.appendChild(_rapierNotesEl('span', 'rapier-notes-picker-alias', row.alias));
		b.onmousedown = evt => evt.preventDefault();
		b.onclick = evt => { evt.preventDefault(); _rapierNotesPickerChoose(i); };
		picker.el.appendChild(b);
	});
	picker.el.hidden = false;
	_rapierNotesPickerPlace(picker);
	_rapierNotesPickerAnnounce(picker);
}
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
	const file = picker.rows[picker.at], option = picker.el.querySelector('[aria-selected="true"]');
	if (picker.host) { if (option?.id) picker.host.setAttribute('aria-activedescendant', option.id); else picker.host.removeAttribute('aria-activedescendant'); }
	const alias = picker.aliases?.[picker.at];
	const message = file ? 'Link to ' + _rapierNotesLibraryTitle(file) + (alias ? ', as ' + alias : '') + '. ' + (picker.at + 1) + ' of ' + picker.rows.length + '.'
		: picker.el.firstChild?.textContent || '';
	if (picker.status.textContent !== message) picker.status.textContent = message;
}
function _rapierNotesPickerMove(step) {
	const picker = _rapierNotesPickerEl();
	if (!picker.rows.length) return;
	picker.at = (picker.at + step + picker.rows.length) % picker.rows.length;
	const focused = picker.el.contains(document.activeElement);
	[...picker.el.children].forEach((row, i) => { row.setAttribute('aria-selected', String(i === picker.at)); if (i === picker.at) { row.scrollIntoView({block: 'nearest'}); if (focused) row.focus({preventScroll: true}); } });
	_rapierNotesPickerAnnounce(picker);
}
async function _rapierNotesPickerChoose(index) {
	const lib = _rapierNotesLib, L = _rapierNotesLinksModule();
	const picker = lib.picker;
	if (!picker || !L || typeof L.markdownLink !== 'function') return;
	const at = index == null ? picker.at : index, file = picker.rows[at], alias = picker.aliases?.[at] || null;
	if (file && !alias && !_rapierNotes.texts.has(file)) {
		try { await _rapierNotesTexts([file]); } catch (_) {  }
		if (lib.picker !== picker || picker.rows[at] !== file) return;
	}
	const caret = _rapierNotesPickerCaret() || picker.caret;
	if (!file || !caret || !caret.node.isConnected) { _rapierNotesPickerClose(); return; }
	const host = picker.host?.isContentEditable && picker.host.contains(caret.node) ? picker.host : null;
	if (!host || host.closest('[inert]')) { _rapierNotesPickerClose(); return; }
	if (document.activeElement !== host) host.focus({preventScroll: true});
	const range = document.createRange();
	const start = Math.max(0, caret.offset - caret.span);
	range.setStart(caret.node, start);
	range.setEnd(caret.node, Math.min(caret.offset, String(caret.node.nodeValue || '').length));
	const sel = window.getSelection();
	sel.removeAllRanges(); sel.addRange(range);
	_rapierNotesPickerClose();
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
	if (evt.target !== lib.picker.host && !lib.picker.el.contains(evt.target)) { _rapierNotesPickerClose(); return; }
	if (evt.ctrlKey || evt.metaKey || evt.altKey) return;
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
	window.addEventListener('keydown', _rapierNotesPickerKey, true);
	document.addEventListener('pointerdown', evt => { if (!evt.target.closest || !evt.target.closest('.rapier-notes-picker')) _rapierNotesPickerClose(); }, true);
	window.addEventListener('resize', () => { if (_rapierNotesLib.picker && !_rapierNotesLib.picker.el.hidden) _rapierNotesPickerOpen(); });
}

function _rapierNotesLibraryFacts() {
	const lib = _rapierNotesLib, found = lib.results;
	return {
		query: _rapierNotes.query || '',
		partial: lib.partial || (_rapierNotes.reading && !_rapierNotes.reading.complete ? {reading: true} : null),
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
_rapierBootFactsPublished.then(_rapierNotesPickerInstall);
