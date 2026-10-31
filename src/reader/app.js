// SPDX-License-Identifier: AGPL-3.0-only

const {PREFERENCE_ACCENTS, PREFERENCE_DEFINITIONS} = globalThis.RapierPreferenceDefinitions;
const $ = id => document.getElementById(id);
$('editor-blocks').addEventListener('load', event => {
	if ($('editor-blocks').contains(event.target)) _rapierRenderModule('render-markdown')._rapierApplyImageGeometry(event.target);
}, true);
globalThis.RapierBundleIO = RapierBundleIO;
const READER_VERSION = document.querySelector('meta[name="rapier-version"]')?.content || '';

const reader = {
	source: '', filename: 'untitled.md', docKind: 'markdown', codeLang: '', title: '', bom: false,
	loaded: false, unshown: false, generation: 0, render: 0, flowchartTried: -1, layout: null, hostTheme: '', hostAccent: '',
	folded: new Set(), allowedRemote: false,
	base: '',
	find: {ranges: [], current: 0, overflow: false},
	place: null, placeHold: 0,
	parts: null,
};


function readerPreference(name) {
	const spec = PREFERENCE_DEFINITIONS[name];
	try {
		const stored = localStorage.getItem(spec.key);
		if (stored !== null) {
			const value = JSON.parse(stored);
			if (typeof value === typeof spec.fallback && (!spec.values || spec.values.includes(value))) return value;
		}
	} catch (_) {}
	return spec.fallback;
}

function readerSetPreference(name, value) {
	if (typeof PREFERENCE_DEFINITIONS[name].fallback === 'boolean') value = value === true || value === 'true';
	if (name === 'theme') reader.hostTheme = '';
	if (name === 'accent') reader.hostAccent = '';
	try { localStorage.setItem(PREFERENCE_DEFINITIONS[name].key, JSON.stringify(value)); } catch (_) {}
	readerApplyView();
	readerRenderSettings();
	if (name === 'layout') void readerRenderDocument();
	if (name === 'headings') readerResetFolds();
	if (name === 'showPlayButton') readerRenderReadAloud();
}

function readerApplyView() {
	const root = document.documentElement, host = $('editor-blocks');
	const theme = reader.hostTheme || readerPreference('theme');
	const light = theme === 'light' || theme === 'system' && matchMedia('(prefers-color-scheme: light)').matches;
	root.classList.remove('rapier-boot-light');
	document.body.classList.toggle('light', light);
	root.style.colorScheme = light ? 'light' : 'dark';
	document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#ffffff' : '#000000');
	const accent = reader.hostAccent ? PREFERENCE_ACCENTS.find(row => row.name === reader.hostAccent) : null;
	const preset = accent || PREFERENCE_ACCENTS.find(row => row.accent === readerPreference('accent')) || PREFERENCE_ACCENTS[0];
	root.style.setProperty('--rapier-person-accent', preset.accent);
	root.style.setProperty('--color-accent-foreground', preset.fg || '#000000');
	const size = readerPreference('fontSize');
	if (size === 'md') host.style.removeProperty('--rapier-step');
	else host.style.setProperty('--rapier-step', String(parseFloat(FONT_SIZES[size]) / parseFloat(FONT_SIZES.md)));
	root.dataset.headings = readerPreference('headings');
	root.dataset.layout = readerPreference('layout');
	root.dataset.invertImageAlpha = readerPreference('invertImageAlpha') ? 'on' : 'off';
	root.dataset.highlights = readerPreference('highlights');
	if (root.dataset.rapierHostAccent !== String(!!accent)) root.dataset.rapierHostAccent = String(!!accent);
	readerAccentOwner();
}

function readerAccentOwner() {
	const owned = getComputedStyle(document.documentElement).getPropertyValue('--rapier-accent').trim() !== '';
	document.documentElement.classList.toggle('rapier-host-accent', owned);
}


async function readerLoad(source, filename, title, kind) {
	const generation = ++reader.generation;
	const before = {source: reader.source, filename: reader.filename, title: reader.title, docKind: reader.docKind, codeLang: reader.codeLang, bom: reader.bom};
	reader.bom = source.charCodeAt(0) === 0xFEFF;
	reader.source = reader.bom ? source.slice(1) : source;
	reader.filename = filename || 'untitled.md';
	reader.title = title || '';
	reader.docKind = kind || _classifyDocKind(reader.filename);
	reader.codeLang = reader.docKind === 'code' ? _langForExt(reader.filename) : '';
	reader.folded.clear();
	reader.allowedRemote = false;
	_rapierRemoteContent.allowed = false;
	const shown = await readerRenderDocument();
	if (generation !== reader.generation) return false;
	if (reader.unshown) {
		Object.assign(reader, reader.shown || before);
		readerRenderFilename();
		throw Object.assign(new Error('This document could not be shown'), {code: 'document_unshowable'});
	}
	reader.loaded = true;
	reader.shown = {source: reader.source, filename: reader.filename, title: reader.title, docKind: reader.docKind, codeLang: reader.codeLang, bom: reader.bom};
	readerRenderFilename();
	readerRenderEmpty();
	readerRenderSettings();
	if (shown) $('editor-blocks').scrollTop = 0;
	readerFindRun();
	readerPublishState();
	readerFragment();
	return true;
}

const readerAnchorBase = () => reader.filename.replace(/\.[^.]*$/, '') || 'document';
function readerFragment() {
	let id = location.hash.slice(1);
	try { id = decodeURIComponent(id); } catch (_) {}
	if (!id || !reader.loaded) return;
	const host = $('editor-blocks'), portable = _rapierRenderModule('render')._rapierPortableAnchorId(readerAnchorBase(), id);
	const element = host.querySelector('[id="' + CSS.escape(portable) + '"]') || host.querySelector('[id="' + CSS.escape(id) + '"]');
	if (element) readerScrollTo(element);
	else if (readerPartsPending()) void readerPartsAll().then(readerFragment);
}

function readerMissingPicture(image) {
	const note = image.ownerDocument.createElement('span'), words = (image.getAttribute('alt') || '').trim();
	note.className = 'rapier-image-missing';
	note.textContent = 'image not found' + (words ? ': ' + words : '');
	image.replaceWith(note);
}

const READER_MAX_NESTING = 400;
async function readerRenderDocument() {
	const progress = reader.source.length > READER_STREAM_CHARS ? _rapierProgressOpen({label: 'Opening', after: 300}) : null;
	try { return await readerRenderDocumentRun(progress); } finally { if (!progress || reader.parts?.progress !== progress) progress?.end(); }
}
async function readerRenderDocumentRun(progress) {
	const generation = ++reader.render;
	const host = $('editor-blocks');
	if (reader.parts) readerPartsRetire(reader.parts);
	reader.parts = null;
	if (readerSpeech.active) readerStopReading();
	const metadata = readerMetadata();
	if (reader.docKind === 'markdown' && READER_FLOWCHART.test(reader.source)) await readerFlowchart();
	if (generation !== reader.render) return false;
	readerParser();
	const markdownRender = _rapierRenderModule('render-markdown'), renderer = _rapierRenderModule('render');
	let styled = null;
	reader.unshown = false;
	const streaming = reader.source.length > READER_STREAM_CHARS;
	const plan = streaming && reader.docKind === 'markdown' ? readerPartPlan(reader.source) : null;
	if (plan) return readerRenderParts(plan, progress, generation);
	const work = streaming ? {yield: readerTurn, onProgress: fraction => progress?.set(fraction * .5), check() { if (generation !== reader.render) throw Object.assign(new Error('replaced'), {name: 'AbortError'}); }} : null;
	try {
		const semantic = streaming ? await markdownRender._rapierRenderSemanticRootAsync(reader.source, metadata, {imagePresentation: true, maxNesting: READER_MAX_NESTING, closeDetails: true, codeBudget: READER_CODE_COLOR_CHARS, work})
			: markdownRender._rapierRenderSemanticRoot(reader.source, metadata, {imagePresentation: true, maxNesting: READER_MAX_NESTING, closeDetails: true, codeBudget: READER_CODE_COLOR_CHARS});
		if (_rapierPlainLayout()) _rapierStripPlainLayoutFacts(semantic);
		for (const diagram of semantic.querySelectorAll('.diagram-block[data-diagram-src]')) await _rapierFillDiagram(diagram, true);
		if (generation !== reader.render) return false;
		progress?.set(.35);
		const options = {metadata, print: false, sourceCode: false, baseName: readerAnchorBase(), codeBudget: READER_CODE_COLOR_CHARS, sanitized: true};
		styled = streaming ? await renderer._rapierProjectStyledRootAsync(semantic, {...options, work}) : renderer._rapierProjectStyledRoot(semantic, options);
		renderer._rapierAnnotateExportBoxPolygons(styled);
		readerHoldRemoteMedia(styled);
		readerInertControls(styled);
		readerPlaceRelativePictures(styled);
	} catch (error) {
		if (generation !== reader.render) return false;
		try { console.error('[rapier-reader] could not show the document', error); } catch (_) {}
		readerToast('Couldn’t show this document.', 'error');
		reader.unshown = true;
		return false;
	}
	if (generation !== reader.render) return false;
	const focusInside = host.contains(document.activeElement);
	reader.layout?.destroy({documentChanged: true});
	reader.layout = null;
	const blocks = [...styled.childNodes];
	let at = streaming ? readerFirstScreen(blocks) : blocks.length;
	const first = document.createDocumentFragment();
	for (let index = 0; index < at; index++) first.append(blocks[index]);
	host.replaceChildren(first);
	readerPrepareBlocks(host);
	readerDocumentStyle();
	readerShapeOverflow(host);
	readerFoldControls();
	for (let size = READER_STREAM_PART * 4; at < blocks.length; size *= 2) {
		await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
		if (generation !== reader.render) return false;
		progress?.set(.6 + .4 * at / blocks.length);
		const part = document.createDocumentFragment();
		for (let chars = 0; at < blocks.length && chars < size;) { chars += blocks[at].textContent.length; part.append(blocks[at++]); }
		readerPrepareBlocks(part);
		readerWrapOverflow(part, true);
		globalThis.RapierMath?.observe(part);
		host.append(part);
		if (reader.folded.size) readerApplyFolds();
	}
	if (streaming) readerFoldControls();
	if (!_rapierPlainLayout()) {
		const wraps = [...host.querySelectorAll('p[data-md-layout]')].some(element => ['around', 'beside', 'box', 'behind', 'front'].includes(globalThis.RapierMarkdownLayout.parseLayoutAttribute(element.getAttribute('data-md-layout'))?.wrap)) ||
			[...host.querySelectorAll('img[data-rapier-image-layout]')].some(image => globalThis.RapierMarkdownLayout.parseLayoutAttribute(image.getAttribute('data-rapier-image-layout'))?.rotate);
		if (wraps) reader.layout = renderer._rapierProjectArtifactLayout(host, modules['spec/md-layout.mjs'], modules['layout/model.mjs'], modules['layout/preparation.mjs']);
	}
	readerPictureFind.documentShown();
	readerFindRun(true);
	if (focusInside) readerRecoverFocus();
	return true;
}

const READER_PART_FIRST = 16384, READER_PART = 49152, READER_PART_LEAST = 3;
const READER_PART_GATES = [/^ {0,3}\[(?!\^)[^\]\n]+\]:/m, /^\*\[/m, /^[ \t]*</m, /<[a-z][^>\n]*\b(?:id|name)\s*=/i, /\{#[^}\n]+\}/,
	/^ {0,3}(?:`{3,}|~{3,})[^\S\r\n]*(?:math|latex|tex|katex)\b/im, /^(?: {100,}|\t{25,}|(?:>[ \t]?){50,})/m];
function readerPartPlan(source) {
	if (READER_PART_GATES.some(gate => gate.test(source))) return null;
	const byHeading = !/^ {0,3}\d{1,9}[.)](?:[ \t]|$)/m.test(source);
	const parts = [];
	let start = 0, stateful = false, codeOnly = true, fence = null, previous = '', at = 0, outer = 0, prefixEnd = 0;
	let codeCuts = [], notes = null, noteNext = 0, whole = false;
	const cut = to => {
		if (outer && !codeOnly && prefixEnd > (codeCuts.at(-1) ?? start)) codeCuts.push(prefixEnd);
		let from = start;
		for (const end of codeCuts) { parts.push({start: from, end, stateful: false, codeOnly: true}); from = end; }
		if (from < to) parts.push({start: from, end: to, stateful, codeOnly});
		start = to; stateful = false; codeOnly = true; codeCuts = []; prefixEnd = to; outer++;
	};
	const wanted = at => at - start >= (outer ? READER_PART : READER_PART_FIRST);
	const opening = /^---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(source.slice(0, 65536));
	if (opening) { at = opening[0].length; codeOnly = false; }
	while (at < source.length) {
		let end = source.indexOf('\n', at);
		if (end < 0) end = source.length;
		const line = source.slice(at, end).replace(/\r$/, '');
		if (fence) {
			const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
			if (close && close[1][0] === fence.mark && close[1].length >= fence.length) {
				fence = null; previous = 'fence';
				if (codeOnly) prefixEnd = Math.min(end + 1, source.length);
			}
		} else {
			const open = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
			if (open && !(open[2][0] === '`' && open[3].includes('`'))) {
				if (!open[1] && previous === 'fence') {
					if (wanted(at)) cut(at);
					else if (outer && codeOnly && at - (codeCuts.at(-1) ?? start) >= READER_PART_FIRST) codeCuts.push(at);
				}
				fence = {mark: open[2][0], length: open[2].length};
			} else if (line.trim()) {
				const note = /^\[\^([^\]\s]+)\]:/.exec(line);
				if (noteNext && !note && (noteNext === 1 || /^[ \t]/.test(line))) whole = true;
				noteNext = 0;
				if (note) {
					if (line.includes('[^', note[0].length)) whole = true;
					notes ||= new Map();
					const at0 = notes.get(note[1]);
					notes.set(note[1], {text: line, places: at0 ? [...at0.places, at] : [at]});
					noteNext = 1;
				} else if (/\[\^[^\]\s]+\]:/.test(line)) whole = true;
				if (/^#{1,6}(?:[ \t]|$)/.test(line) && byHeading && wanted(at)) cut(at);
				else if (/^ {0,3}[-*+][ \t]/.test(line) && wanted(at)) cut(at);
				stateful = true;
				codeOnly = false;
				previous = 'other';
			} else if (noteNext) noteNext = 2;
		}
		at = end + 1;
	}
	cut(source.length);
	if (whole || notes && (fence || /\^\[/.test(source))) return null;
	if (parts.length < READER_PART_LEAST) return null;
	if (notes) { parts.notes = notes; parts.push({start: source.length, end: source.length, stateful: false, codeOnly: false, footnotes: true}); }
	return parts;
}

let readerFootnoteSeed = null;
function readerFootnoteRules(parser) {
	parser.core.ruler.after('block', 'rapier_reader_footnote_seed', state => {
		const seed = readerFootnoteSeed;
		if (!seed) return;
		const notes = state.env.footnotes ||= {};
		notes.refs ||= {};
		notes.list = [];
		for (let id = 0; id < seed.base; id++) {
			const label = seed.labels[id];
			notes.list.push({label, count: seed.count(label)});
			notes.refs[':' + label] = id;
		}
	});
	parser.core.ruler.before('footnote_tail', 'rapier_reader_footnote_hold', state => {
		if (!readerFootnoteSeed || !state.env.footnotes) return;
		state.env.rapierFootnoteList = state.env.footnotes.list || [];
		delete state.env.footnotes.list;
	});
	parser.core.ruler.after('footnote_tail', 'rapier_reader_footnote_give', state => {
		const list = state.env.rapierFootnoteList;
		if (!readerFootnoteSeed || !list) return;
		state.env.footnotes.list = list;
		delete state.env.rapierFootnoteList;
		readerFootnoteSeed.read?.(list);
	});
}
function readerFootnoteSeeded(parts, index, run, reading = false) {
	const part = parts.list[index], named = parts.notes && parts.source.indexOf('[^', part.start);
	if (!parts.notes || part.footnotes || part.noteBase === undefined || named < 0 || named >= part.end) return run();
	const before = reading ? parts.noteCounts : part.noteBefore;
	readerFootnoteSeed = {labels: parts.noteLabels, base: part.noteBase, count: label => before.get(label) || 0,
		read: reading ? list => { part.noteRead = list.map(item => [item.label, item.count]); } : null};
	try { return run(); } finally { readerFootnoteSeed = null; }
}
function readerFootnoteRecord(parts, part) {
	const read = part.noteRead;
	part.noteRead = null;
	if (!read) return;
	read.forEach(([label, count], id) => {
		const had = id < part.noteBase ? parts.noteCounts.get(label) || 0 : 0;
		if (id >= part.noteBase) parts.noteLabels.push(label);
		if (count !== had) { part.noteBefore.set(label, had); parts.noteCounts.set(label, count); }
	});
}
function readerPartSource(parts, index) {
	const part = parts.list[index];
	if (part.footnotes) {
		if (parts.factsNext < index) return '';
		const named = [], words = [];
		for (const label of parts.noteLabels) { named.push(('[^' + label + '] ').repeat(parts.noteCounts.get(label))); words.push(parts.notes.get(label).text); }
		return named.join('') + '\n\n' + words.join('\n') + '\n';
	}
	const own = parts.source.slice(part.start, part.end);
	if (!parts.notes || !own.includes('[^')) return own;
	const more = [], seen = new Set();
	for (const [, label] of own.matchAll(/\[\^([^\]\s]+)\]/g)) {
		if (seen.has(label)) continue;
		seen.add(label);
		const note = parts.notes.get(label);
		if (note && !note.places.some(place => place >= part.start && place < part.end)) more.push(note.text);
	}
	return more.length ? own + (own.endsWith('\n') ? '\n' : '\n\n') + more.join('\n') + '\n' : own;
}
function readerFootnoteLinks(parts, index, styled) {
	if (!parts.notes) return styled;
	if (parts.list[index].footnotes) return readerFootnotesOnly(styled);
	const anchor = _rapierRenderModule('render')._rapierPortableAnchorId, base = readerAnchorBase();
	for (const link of styled.querySelectorAll('sup.footnote-ref > a[href^="#fn-"]')) link.setAttribute('href', '#' + anchor(base, link.getAttribute('href').slice(1)));
	return styled;
}
function readerFootnotesOnly(styled) {
	const sep = styled.querySelector(':scope > hr.footnotes-sep, :scope > section.footnotes');
	while (sep && styled.firstChild && styled.firstChild !== sep) styled.firstChild.remove();
	return styled;
}

function readerPartFactsNext(parts) {
	const index = parts.factsNext, part = parts.list[index];
	if (parts.notes) { part.noteBase = parts.noteLabels.length; part.noteBefore = new Map(); }
	part.facts = part.stateful ? readerFootnoteSeeded(parts, index, () => _rapierRenderModule('render-markdown')._rapierReadPartDecorations(
		readerPartSource(parts, index), parts.metadata,
		{imagePresentation: true, maxNesting: READER_MAX_NESTING, closeDetails: true, carry: parts.carry}), true)
		: {headingIds: null, captionStart: 0};
	if (parts.notes) {
		const parser = readerParser(), saved = parser.options.maxNesting;
		try {
			parser.options.maxNesting = READER_MAX_NESTING;
			readerFootnoteSeeded(parts, index, () => parser.parse(_rapierSplitOpeningFrontmatter(readerPartSource(parts, index)).body, {rapierImagePresentation: true, rapierPassive: true}), true);
		} finally { parser.options.maxNesting = saved; }
		readerFootnoteRecord(parts, part);
	}
	parts.factsNext++;
}
async function readerPartFacts(parts, index) {
	let began = performance.now();
	while (parts.factsNext <= index) {
		if (parts !== reader.parts) return false;
		readerPartFactsNext(parts);
		if (parts.factsNext <= index && performance.now() - began >= 8) { await readerTurn(); began = performance.now(); }
	}
	return parts === reader.parts;
}

function readerPartInputs(parts, index) {
	const part = parts.list[index], budget = index ? 0 : READER_CODE_COLOR_CHARS, metadata = parts.metadata;
	const carry = {headingIds: part.facts.headingIds, slugs: parts.carry.slugs, captions: part.facts.captionStart, continued: true};
	return {source: readerPartSource(parts, index), metadata, budget,
		given: {imagePresentation: true, maxNesting: READER_MAX_NESTING, closeDetails: true, codeBudget: budget, carry},
		options: {metadata, print: false, sourceCode: false, baseName: readerAnchorBase(), codeBudget: budget, sanitized: true}};
}
function readerPartDress(styled) {
	_rapierRenderModule('render')._rapierAnnotateExportBoxPolygons(styled);
	readerHoldRemoteMedia(styled);
	readerInertControls(styled);
	readerPlaceRelativePictures(styled);
	return styled;
}
async function readerPartBuild(parts, index) {
	if (!await readerPartFacts(parts, index) || parts.list[index].drawn) return null;
	const {source, metadata, given, options} = readerPartInputs(parts, index), markdownRender = _rapierRenderModule('render-markdown'), renderer = _rapierRenderModule('render');
	const work = {yield: readerTurn, check() { if (parts !== reader.parts) throw Object.assign(new Error('replaced'), {name: 'AbortError'}); }};
	const semantic = await readerFootnoteSeeded(parts, index, () => markdownRender._rapierRenderSemanticRootAsync(source, metadata, {...given, work}));
	if (_rapierPlainLayout()) _rapierStripPlainLayoutFacts(semantic);
	for (const diagram of semantic.querySelectorAll('.diagram-block[data-diagram-src]')) await _rapierFillDiagram(diagram, true);
	const styled = readerPartDress(await renderer._rapierProjectStyledRootAsync(semantic, {...options, work}));
	return readerFootnoteLinks(parts, index, styled);
}
function readerPartBuildSync(parts, index) {
	while (parts.factsNext <= index) readerPartFactsNext(parts);
	const {source, metadata, given, options} = readerPartInputs(parts, index), semantic = readerFootnoteSeeded(parts, index, () => _rapierRenderModule('render-markdown')._rapierRenderSemanticRoot(source, metadata, given));
	if (_rapierPlainLayout()) _rapierStripPlainLayoutFacts(semantic);
	const styled = readerPartDress(_rapierRenderModule('render')._rapierProjectStyledRoot(semantic, options));
	return readerFootnoteLinks(parts, index, styled);
}

function readerPartAttach(parts, index, styled) {
	const host = $('editor-blocks'), part = parts.list[index], fragment = document.createDocumentFragment();
	while (styled.firstChild) fragment.append(styled.firstChild);
	if (!index) {
		const focusInside = host.contains(document.activeElement);
		host.replaceChildren(fragment);
		readerPrepareBlocks(host);
		readerDocumentStyle();
		readerShapeOverflow(host);
		readerFoldControls();
		part.firstNode = host.firstChild; part.lastNode = host.lastChild;
		part.first = host.firstElementChild; part.last = host.lastElementChild;
		if (focusInside) readerRecoverFocus();
	} else {
		const holder = part.el, back = holder.previousElementSibling;
		readerPrepareBlocks(fragment);
		readerWrapOverflow(fragment, true);
		readerMarkContinuedList(parts, index, fragment);
		globalThis.RapierMath?.observe(fragment);
		const headings = [...fragment.children].filter(block => /^H[1-6]$/.test(block.tagName));
		if (back && /^H[1-6]$/.test(back.tagName)) headings.unshift(back);
		part.firstNode = fragment.firstChild; part.lastNode = fragment.lastChild;
		part.first = fragment.firstElementChild; part.last = fragment.lastElementChild;
		holder.replaceWith(fragment);
		parts.observer.unobserve(holder);
		part.el = null;
		if (headings.length) readerFoldControls(headings, false);
		parts.folds ||= headings.length > 0;
	}
	part.done = true;
	parts.chars += part.end - part.start;
	for (const resolve of part.waiting?.splice(0) || []) resolve(true);
}

function readerMarkContinuedList(parts, index, fragment) {
	const list = fragment.firstElementChild;
	if (!index || !list || list.tagName !== 'UL') return;
	const part = parts.list[index], prev = parts.list[index - 1];
	const starts = /^ {0,3}[-*+][ \t]/.test(parts.source.slice(part.start, part.start + 16));
	const prevEnd = parts.source.slice(Math.max(prev.start, prev.end - 120), prev.end);
	if (starts && /(?:^|\n) {0,3}[-*+][ \t][^\n]*\n?$/.test(prevEnd)) list.classList.add('reader-list-continued');
}

function readerPartsRetire(parts) {
	parts.observer?.disconnect();
	parts.progress?.end();
	for (const resolve of parts.waiting.splice(0)) resolve(false);
	for (const part of parts.list) for (const resolve of part.waiting?.splice(0) || []) resolve(false);
}

function readerAnchorCapture(host) {
	if (!host.scrollTop) return null;
	const box = host.getBoundingClientRect();
	for (let drop = 4; drop < Math.min(box.height, 240); drop += 8) {
		let at = document.elementFromPoint(box.left + box.width / 2, box.top + drop);
		while (at && at.parentElement !== host) at = at.parentElement;
		if (!at) continue;
		const rect = at.getBoundingClientRect(), index = at.classList.contains('reader-part') ? Number(at.dataset.part) : -1;
		return {block: at, index, offset: rect.top - box.top, share: Math.min(1, Math.max(0, (box.top - rect.top) / (rect.height || 1)))};
	}
	return null;
}
function readerAnchorRestore(parts, host, anchor) {
	if (!anchor) return;
	const box = host.getBoundingClientRect(), part = anchor.index >= 0 ? parts.list[anchor.index] : null;
	let moved = 0;
	if (part?.done && part.first?.isConnected && part.last?.isConnected) {
		const top = part.first.getBoundingClientRect().top, bottom = part.last.getBoundingClientRect().bottom;
		moved = top + anchor.share * (bottom - top) - box.top;
	} else if (anchor.block.isConnected) moved = anchor.block.getBoundingClientRect().top - box.top - anchor.offset;
	if (Math.abs(moved) > 0.5) host.scrollTop += moved;
}

function readerPartsFlush(parts) {
	const batch = parts.batch.splice(0);
	parts.batchChars = 0;
	if (!batch.length) return;
	const host = $('editor-blocks'), anchor = readerAnchorCapture(host);
	for (const {index, styled} of batch) readerPartAttach(parts, index, styled);
	if (!reader.find.source || parts.all) readerPartsEstimate(parts);
	if (parts.folds || reader.folded.size) { readerApplyFolds(); parts.folds = false; }
	readerAnchorRestore(parts, host, anchor);
	parts.progress?.set(parts.chars / parts.source.length);
	if (parts.pinEnd && parts.list.at(-1).done) host.scrollTop = host.scrollHeight;
}

function readerPartsEstimate(parts) {
	const open = parts.list.filter(part => !part.done && part.el);
	if (!open.length) return;
	const rate = Math.max(.01, ($('editor-blocks').scrollHeight - open.reduce((sum, part) => sum + part.height, 0)) / (parts.chars || 1));
	for (const part of open) {
		const next = Math.max(1, Math.round((part.end - part.start) * rate));
		if (next !== part.height) { part.el.style.height = next + 'px'; part.height = next; }
	}
}

function readerPartsRequest(parts, index, priority = false) {
	if (parts !== reader.parts || !parts.list[index]) return Promise.resolve(false);
	const part = parts.list[index];
	if (part.done) return Promise.resolve(!part.failed);
	const ready = new Promise(resolve => (part.waiting ||= []).push(resolve));
	if (part.drawn) { readerPartsFlush(parts); return ready; }
	const queued = parts.queue.indexOf(index);
	if (priority) {
		if (queued >= 0) parts.queue.splice(queued, 1);
		parts.queue.unshift(index);
	} else if (queued < 0) parts.queue.push(index);
	part.urgent = true;
	void readerPartsDrive(parts);
	return ready;
}

async function readerPartsDrive(parts) {
	if (parts.running) return;
	parts.running = true;
	try {
		for (;;) {
			if (parts !== reader.parts) return;
			let index = parts.queue.shift();
			if (index === undefined) index = parts.all || !reader.find.source ? parts.list.findIndex(part => !part.done && !part.drawn) : -1;
			if (index < 0) break;
			if (parts.list[index].done || parts.list[index].drawn) continue;
			let styled;
			try { styled = await readerPartBuild(parts, index); }
			catch (error) {
				if (parts !== reader.parts) return;
				try { console.error('[rapier-reader] could not show a part of the document', error); } catch (_) {}
				readerToast('Couldn’t show all of this document.', 'error');
				parts.list.forEach(part => {
					if (!part.done) part.failed = true;
					part.done = true; part.drawn = true; part.el?.remove();
					for (const resolve of part.waiting?.splice(0) || []) resolve(false);
				});
				parts.batch.length = 0;
				break;
			}
			if (parts !== reader.parts) return;
			const part = parts.list[index];
			if (!styled || part.drawn) continue;
			part.drawn = true;
			parts.batch.push({index, styled});
			parts.batchChars += part.end - part.start;
			if (part.urgent || parts.batchChars >= parts.target || !parts.list.some(other => !other.drawn)) {
				readerPartsFlush(parts);
				parts.target = Math.min(parts.target * 2, READER_PART * 32);
			}
			await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
		}
		readerPartsFlush(parts);
		readerPartsFinish(parts);
	} finally { parts.running = false; }
}

function readerPartsFinish(parts) {
	if (parts !== reader.parts || parts.complete || parts.list.some(part => !part.done)) return;
	parts.complete = true;
	parts.observer.disconnect();
	parts.progress?.end();
	const host = $('editor-blocks'), base = readerAnchorBase(), portable = _rapierRenderModule('render')._rapierPortableAnchorId;
	const ids = new Set([...host.querySelectorAll('[id]')].map(element => element.id));
	for (const link of host.querySelectorAll('a[href^="#"]')) {
		const fragment = link.getAttribute('href').slice(1);
		if (ids.has(fragment)) continue;
		let decoded = fragment;
		try { decoded = decodeURIComponent(fragment); } catch (_) {}
		const next = [fragment, decoded].map(name => portable(base, name)).find(name => ids.has(name));
		if (next) link.setAttribute('href', '#' + next);
	}
	readerFoldControls();
	if (!_rapierPlainLayout()) {
		const wraps = [...host.querySelectorAll('p[data-md-layout]')].some(element => ['around', 'beside', 'box', 'behind', 'front'].includes(globalThis.RapierMarkdownLayout.parseLayoutAttribute(element.getAttribute('data-md-layout'))?.wrap)) ||
			[...host.querySelectorAll('img[data-rapier-image-layout]')].some(image => globalThis.RapierMarkdownLayout.parseLayoutAttribute(image.getAttribute('data-rapier-image-layout'))?.rotate);
		if (wraps) reader.layout = _rapierRenderModule('render')._rapierProjectArtifactLayout(host, modules['spec/md-layout.mjs'], modules['layout/model.mjs'], modules['layout/preparation.mjs']);
	}
	readerPictureFind.documentShown();
	for (const resolve of parts.waiting.splice(0)) resolve(true);
	readerFindRun(true);
}

function readerPartsAll() {
	const parts = reader.parts;
	if (!parts || parts.complete) return Promise.resolve();
	return new Promise(resolve => {
		parts.all = true;
		parts.waiting.push(resolve);
		parts.list.forEach((part, index) => { if (!part.done && !parts.queue.includes(index)) parts.queue.push(index); });
		void readerPartsDrive(parts);
	});
}
const readerPartsPending = () => !!reader.parts && !reader.parts.complete;
function readerPartsNow() {
	const parts = reader.parts;
	if (!parts || parts.complete) return;
	parts.all = true;
	parts.list.forEach((part, index) => {
		if (part.done || part.drawn) return;
		part.drawn = true;
		parts.batch.push({index, styled: readerPartBuildSync(parts, index)});
	});
	readerPartsFlush(parts);
	readerPartsFinish(parts);
}

async function readerRenderParts(plan, progress, generation) {
	const host = $('editor-blocks');
	const parts = reader.parts = {source: reader.source, metadata: readerMetadata(), list: plan.map(part => ({...part, done: false, drawn: false, urgent: false, height: 0, el: null})), carry: {slugs: Object.create(null), captions: 0, continued: true}, factsNext: 0, notes: plan.notes || null, noteLabels: [], noteCounts: new Map(), queue: [], running: false, all: false,
		complete: false, chars: 0, progress, pinEnd: false, waiting: [], observer: null, batch: [], batchChars: 0, target: READER_PART * 2, folds: false};
	parts.observer = new IntersectionObserver(entries => { for (const {target, isIntersecting} of entries) if (isIntersecting) readerPartsRequest(parts, Number(target.dataset.part)); }, {rootMargin: '2400px 0px'});
	let styled;
	try { styled = await readerPartBuild(parts, 0); }
	catch (error) {
		if (generation !== reader.render || parts !== reader.parts) return false;
		try { console.error('[rapier-reader] could not show the document', error); } catch (_) {}
		readerToast('Couldn’t show this document.', 'error');
		reader.unshown = true;
		readerPartsRetire(parts);
		reader.parts = null;
		return false;
	}
	if (generation !== reader.render || parts !== reader.parts) return false;
	reader.layout?.destroy({documentChanged: true});
	reader.layout = null;
	parts.list[0].drawn = true;
	readerPartAttach(parts, 0, styled);
	const holders = document.createDocumentFragment();
	parts.list.forEach((part, index) => {
		if (!index) return;
		const holder = document.createElement('div');
		holder.className = 'reader-part';
		holder.dataset.part = String(index);
		holder.setAttribute('aria-hidden', 'true');
		part.el = holder;
		holders.append(holder);
		parts.observer.observe(holder);
	});
	host.append(holders);
	readerPartsEstimate(parts);
	readerPictureFind.documentShown();
	readerFindRun(true);
	void readerPartsDrive(parts);
	return true;
}

const READER_LAZY_CODE_BLOCKS = 400, READER_CODE_COLOR_CHARS = 1 << 16, READER_STREAM_CHARS = 1 << 20, READER_STREAM_PART = 16384;
const readerTurns = new MessageChannel();
const readerTurn = () => new Promise(resolve => { readerTurns.port1.addEventListener('message', resolve, {once: true}); readerTurns.port1.start(); readerTurns.port2.postMessage(0); });
function readerFirstScreen(blocks) {
	let at = 0;
	for (let chars = 0; at < blocks.length && chars < READER_STREAM_PART; at++) chars += blocks[at].textContent.length;
	return Math.max(1, at);
}
const readerRelativeAddress = value => { const address = String(value || '').trim(); return !!address && !/^[a-z][a-z0-9+.-]*:/i.test(address) && !/^[\\/]{2}/.test(address) && !address.startsWith('#'); };
function readerPlaceRelativePictures(root) {
	if (!reader.base && location.protocol === 'file:') return;
	for (const image of root.querySelectorAll('img[src]')) {
		const src = image.getAttribute('src').trim();
		if (!readerRelativeAddress(src)) continue;
		if (!reader.base) { readerMissingPicture(image); continue; }
		image.setAttribute('src', new URL(src, reader.base).href);
		image.removeAttribute('srcset');
	}
}
function readerInertControls(root) {
	for (const control of root.querySelectorAll('button,select,textarea,input:not([type="checkbox"])'))
		if (![...control.attributes].some(attribute => attribute.name.startsWith('data-rapier')) && !/\brapier-/.test(control.className)) control.inert = true;
}
function readerHoldRemoteMedia(root) {
	if (_rapierRemoteContent.allowed || !root?.querySelectorAll) return;
	const originOf = _rapierRenderModule('render-sanitize')._rapierRemoteSubresourceOrigin;
	const local = value => {
		const raw = String(value || '').trim();
		return !!raw && !originOf(raw);
	};
	const remote = value => {
		const raw = String(value || '').trim();
		return !!raw && !!originOf(raw);
	};
	for (const media of [...root.querySelectorAll('video[data-rapier-remote-src],audio[data-rapier-remote-src]')]) {
		if (local(media.getAttribute('src')) || [...media.querySelectorAll('source[src]')].some(source => local(source.getAttribute('src')))) continue;
		for (const name of ['src', 'poster']) if (remote(media.getAttribute(name))) media.removeAttribute(name);
		for (const child of media.querySelectorAll('source,track')) {
			for (const name of ['src', 'srcset']) if (remote(child.getAttribute(name))) child.removeAttribute(name);
		}
		media.removeAttribute('autoplay');
		media.inert = true;
		const button = media.ownerDocument.createElement('button');
		button.type = 'button';
		button.className = 'rapier-remote-image__allow';
		button.setAttribute('data-rapier-remote-allow', '1');
		button.textContent = 'Load all remote content';
		media.after(button);
	}
}

function readerPrepareBlocks(root) {
	for (const image of root.querySelectorAll('img[data-rapier-image-geometry]')) _rapierRenderModule('render-markdown')._rapierApplyImageGeometry(image);
	for (const input of root.querySelectorAll('input[type="checkbox"]')) { input.disabled = true; input.removeAttribute('title'); }
	for (const link of root.querySelectorAll('a[href]')) if (/^https?:/i.test(link.getAttribute('href'))) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
}

const READER_FLOWCHART = /^ {0,3}(?:`{3,}|~{3,})[ \t]*mermaid[^\n]*\n(?:[ \t]*(?:%%[^\n]*)?\n)*[ \t]*(?:flowchart|graph)\b/im;
async function readerFlowchart() {
	const plugin = _rapierProviders.flowchart;
	if (!plugin || plugin.status === 'ready' || reader.flowchartTried === reader.generation) return;
	reader.flowchartTried = reader.generation;
	try { await plugin.install(); } catch (_) {  }
}

function readerDocumentStyle() {
	let sheet = $('rapier-document-style');
	if (!sheet) {
		sheet = document.createElement('style');
		sheet.id = 'rapier-document-style';
		document.head.append(sheet);
	}
	const renderer = _rapierRenderModule('render');
	const settings = reader.docKind === 'markdown' ? renderer._rapierDocumentSettingsOf(reader.source) : null;
	sheet.textContent = renderer._rapierDocumentSettingsCss(settings);
	const host = $('editor-blocks');
	if (settings?.mainfont?.css) host.style.setProperty('--rapier-doc-face', settings.mainfont.css);
	else host.style.removeProperty('--rapier-doc-face');
	host.lang = globalThis.RapierMarkdownSpec.documentLanguage(settings, navigator.language);
}

function readerRenderFilename() {
	const name = reader.filename, dot = name.lastIndexOf('.'), embedded = _rapierEmbed.active, shown = embedded ? reader.title || name : dot > 0 ? name.slice(0, dot) : name;
	$('filename-btn').textContent = shown;
	$('filename-ext-text').textContent = dot > 0 ? name.slice(dot + 1).toUpperCase() : '';
	$('filename-ext-btn').hidden = embedded || dot <= 0;
	const settings = reader.docKind === 'markdown' ? _rapierRenderModule('render')._rapierDocumentSettingsOf(reader.source) : null;
	document.title = settings && settings.title ? globalThis.RapierMarkdownSpec.documentTitle(settings) + ' \u2014 Rapier' : 'Rapier \u2014 ' + (embedded ? shown : name);
}

function readerRenderEmpty() {
	const host = $('editor-blocks');
	let prompt = $('reader-open-prompt');
	if (reader.loaded) { prompt?.remove(); return; }
	if (prompt) return;
	prompt = document.createElement('div');
	prompt.id = 'reader-open-prompt';
	prompt.className = 'reader-open-prompt visible';
	if (_rapierEmbed.active) { prompt.textContent = 'No document is loaded.'; host.append(prompt); return; }
	const open = document.createElement('button');
	open.type = 'button';
	open.className = 'settings-action-btn';
	open.dataset.action = 'open-document';
	open.textContent = 'open a markdown file';
	prompt.append(open);
	host.append(prompt);
}

const readerOverflow = new ResizeObserver(entries => { for (const {target} of entries) readerUpdateOverflow(target); });
function readerUpdateOverflow(shell) {
	const surface = shell.firstElementChild;
	if (!surface?.isConnected) return;
	const max = Math.max(0, surface.scrollWidth - surface.clientWidth);
	const right = max > 2 && surface.scrollLeft < max - 2 ? 'true' : 'false', left = max > 2 && surface.scrollLeft > 2 ? 'true' : 'false';
	if (shell.dataset.overflowRight !== right) shell.dataset.overflowRight = right;
	if (shell.dataset.overflowLeft !== left) shell.dataset.overflowLeft = left;
	if (max > 2) {
		surface.setAttribute('role', 'region');
		surface.setAttribute('aria-label', 'scrollable ' + (shell.classList.contains('rapier-hscroll--table') ? 'table' : shell.classList.contains('rapier-hscroll--math') ? 'equation' : 'code'));
		surface.tabIndex = 0;
	} else for (const name of ['role', 'aria-label', 'tabindex']) surface.removeAttribute(name);
}

function readerFenceControl() {
	const svg = (name, child) => {
		const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		for (const [key, value] of [['class', name], ['viewBox', '0 0 24 24'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['aria-hidden', 'true']]) node.setAttribute(key, value);
		node.append(child);
		return node;
	};
	const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'), check = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
	use.setAttribute('href', '#i-copy');
	check.setAttribute('points', '20 6 9 17 4 12');
	const control = document.createElement('button');
	control.type = 'button';
	control.className = 'fence-copy';
	control.setAttribute('aria-label', 'copy the code');
	control.title = 'copy the code';
	control.append(svg('fence-copy__copy', use), svg('fence-copy__done', check));
	return control;
}

async function readerCopyFence(button) {
	const code = button.parentElement.querySelector('pre > code');
	if (!code) return;
	try { await navigator.clipboard.writeText((code.textContent || '').replace(/\n$/, '')); } catch (_) { readerToast('Couldn’t copy.', 'error'); return; }
	button.setAttribute('data-copied', '');
	clearTimeout(button._copied);
	button._copied = setTimeout(() => button.removeAttribute('data-copied'), 1500);
}

function readerShapeOverflow(host) {
	readerOverflow.disconnect();
	readerCodeSeen.disconnect();
	readerWrapOverflow(host, host.querySelectorAll('pre').length > READER_LAZY_CODE_BLOCKS);
	globalThis.RapierMath?.observe(host);
}
function readerWrapOverflow(host, lazy = false) {
	for (const surface of host.querySelectorAll('.table-scroll-wrap, pre, .math-display-wrap, .diagram-block')) {
		if (surface.closest('.rapier-hscroll') || surface.tagName === 'PRE' && surface.closest('.diagram-block')) continue;
		if (lazy && surface.tagName === 'PRE' && surface.querySelector(':scope > code')) { readerCodeSeen.observe(surface); continue; }
		readerWrapSurface(surface);
	}
	for (const shell of host.querySelectorAll('.rapier-hscroll')) { readerOverflow.observe(shell); readerUpdateOverflow(shell); }
}
function readerWrapSurface(surface) {
	const kind = surface.classList.contains('table-scroll-wrap') ? 'table' : surface.classList.contains('math-display-wrap') ? 'math' : surface.classList.contains('diagram-block') ? 'diagram' : 'code';
	if (kind === 'math' && surface.querySelector('svg[data-rapier-math]')) return null;
	const shell = document.createElement(kind === 'math' ? 'span' : 'div');
	shell.className = 'rapier-hscroll rapier-hscroll--' + kind;
	surface.parentNode.insertBefore(shell, surface);
	shell.append(surface);
	surface.classList.add('rapier-hscroll__surface');
	if (kind === 'code' && surface.querySelector(':scope > code')) shell.append(readerFenceControl());
	return shell;
}
function readerOverflowScrolled(event) {
	const surface = event.target, shell = surface?.parentElement;
	if (surface?.classList?.contains('rapier-hscroll__surface') && shell?.classList.contains('rapier-hscroll')) requestAnimationFrame(() => readerUpdateOverflow(shell));
}
const readerCodeSeen = new IntersectionObserver(entries => {
	for (const {target, isIntersecting} of entries) if (isIntersecting) readerCodeNear(target);
}, {rootMargin: '1600px 0px'});
function readerCodeNear(surface) {
	readerCodeSeen.unobserve(surface);
	if (!surface.isConnected || surface.closest('.rapier-hscroll')) return;
	const code = surface.querySelector(':scope > code');
	if (code && !code.classList.contains('tok')) {
		const text = code.textContent;
		_rapierRenderModule('render')._rapierPaintCode(code, _rapierRenderModule('render-sanitize').sanitizeRapierHtml(_rapierArtifactHighlight(text, _rapierRenderModule('render-markdown')._rapierLanguageClass(code) || 'text'), 'export'));
	}
	const shell = readerWrapSurface(surface);
	if (shell) { readerOverflow.observe(shell); readerUpdateOverflow(shell); }
}
function readerCodeAll() {
	readerCodeSeen.takeRecords();
	for (const surface of $('editor-blocks').querySelectorAll('pre')) if (!surface.closest('.rapier-hscroll') && surface.querySelector(':scope > code')) readerCodeNear(surface);
}


const READER_HEADINGS = 'h1,h2,h3,h4,h5,h6';
function readerHeadings() { return [...$('editor-blocks').querySelectorAll(':scope > ' + READER_HEADINGS.replaceAll(',', ',:scope > '))]; }
const readerLevel = heading => Number(heading.tagName.slice(1));

function readerFoldControls(headings = readerHeadings(), apply = true) {
	const folding = readerPreference('headings') === 'collapsed';
	headings.forEach(heading => {
		let next = heading.nextElementSibling;
		const level = readerLevel(heading);
		while (next && next.classList.contains('rapier-ink-layer')) next = next.nextElementSibling;
		const collapsible = !!next && !(/^H[1-6]$/.test(next.tagName) && readerLevel(next) <= level);
		heading.querySelector(':scope > .section-fold-btn')?.remove();
		if (!collapsible) return;
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'section-fold-btn';
		button.setAttribute('contenteditable', 'false');
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		for (const [key, value] of [['width', '18'], ['height', '18'], ['viewBox', '0 0 24 24'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['aria-hidden', 'true']]) svg.setAttribute(key, value);
		const points = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
		points.setAttribute('points', '6 9 12 15 18 9');
		svg.append(points);
		button.append(svg);
		heading.append(button);
		if (folding) reader.folded.add(heading);
	});
	if (apply) readerApplyFolds();
}

function readerResetFolds() {
	reader.folded.clear();
	if (readerPreference('headings') === 'collapsed') for (const heading of readerHeadings()) if (heading.querySelector(':scope > .section-fold-btn')) reader.folded.add(heading);
	readerApplyFolds();
	readerFindRun(true);
}

function readerApplyFolds() {
	readerQuietFab();
	const host = $('editor-blocks'), folded = [];
	const active = document.activeElement;
	for (const block of host.children) {
		if (/^H[1-6]$/.test(block.tagName)) {
			const level = readerLevel(block);
			while (folded.length && level <= folded.at(-1).level) folded.pop();
			const isFolded = reader.folded.has(block) && !!block.querySelector(':scope > .section-fold-btn');
			block.dataset.folded = String(isFolded);
			const button = block.querySelector(':scope > .section-fold-btn');
			if (button) {
				const title = readerHeadingLabel(block);
				button.setAttribute('aria-expanded', String(!isFolded));
				button.setAttribute('aria-label', (isFolded ? 'expand section: ' : 'collapse section: ') + title.slice(0, 100));
				block.setAttribute('aria-label', title);
			}
			block.hidden = folded.length > 0;
			if (isFolded) folded.push({level});
		} else block.hidden = folded.length > 0 && !block.matches('.rapier-ink-layer');
	}
	if (active instanceof HTMLElement && host.contains(active) && active.closest('[hidden]')) {
		let block = active;
		while (block && block.parentElement !== host) block = block.parentElement;
		for (let at = block; at; at = at.previousElementSibling) {
			if (/^H[1-6]$/.test(at.tagName) && !at.hidden) {
				if (readerFocusHere(at.querySelector(':scope > .section-fold-btn') || at)) return;
			}
		}
		readerRecoverFocus();
	}
}

function readerHeadingLabel(heading) {
	const authored = heading.getAttribute('aria-label');
	if (authored?.trim()) return authored;
	const label = heading.cloneNode(true);
	label.querySelectorAll('.section-fold-btn').forEach(button => button.remove());
	label.querySelectorAll('img').forEach(image => image.replaceWith(document.createTextNode(image.alt)));
	return (label.textContent || '').trim().replace(/\s+/g, ' ') || 'untitled heading';
}

function readerToggleFold(heading) {
	if (reader.folded.has(heading)) reader.folded.delete(heading); else reader.folded.add(heading);
	readerApplyFolds();
	readerFindRun(true);
}

function readerReveal(element) {
	let block = element;
	while (block && block.parentElement !== $('editor-blocks')) block = block.parentElement;
	if (!block || !block.hidden) return;
	let at = block.previousElementSibling, level = 7;
	while (at) {
		if (/^H[1-6]$/.test(at.tagName) && readerLevel(at) < level) {
			level = readerLevel(at);
			if (reader.folded.delete(at) && level === 1) break;
		}
		at = at.previousElementSibling;
	}
	readerApplyFolds();
}

function readerPlaceNote() {
	const host = $('editor-blocks'), box = host.getBoundingClientRect();
	if (performance.now() < reader.placeHold) return;
	if (!host.scrollTop || !reader.loaded) { reader.place = null; return; }
	for (let drop = 4; drop < Math.min(box.height, 240); drop += 8) {
		let at = document.elementFromPoint(box.left + box.width / 2, box.top + drop);
		while (at && at.parentElement !== host) at = at.parentElement;
		if (!at) continue;
		const rect = at.getBoundingClientRect();
		reader.place = {block: at, share: Math.min(1, Math.max(0, (box.top - rect.top) / (rect.height || 1))), width: host.clientWidth, height: host.clientHeight};
		return;
	}
}
function readerPlaceKeep() {
	const host = $('editor-blocks'), place = reader.place;
	if (!place?.block.isConnected || place.block.hidden || host.clientWidth === place.width && host.clientHeight === place.height) return;
	const rect = place.block.getBoundingClientRect(), moved = rect.top + place.share * rect.height - host.getBoundingClientRect().top;
	if (Math.abs(moved) > 1) host.scrollTop += moved;
	place.width = host.clientWidth; place.height = host.clientHeight;
	readerPlaceNote();
}
function readerScrollTo(element) {
	if (!element?.isConnected) return;
	readerReveal(element);
	for (let details = element.closest('details:not([open])'); details; details = details.parentElement?.closest('details:not([open])')) details.open = true;
	element.scrollIntoView({block: 'start'});
	if (!readerFocusHere(element, true)) readerRecoverFocus();
}

function readerFocusHere(target, announce = false) {
	if (!(target instanceof HTMLElement) || !target.isConnected) return false;
	const ownership = target.tabIndex < 0 ? _rapierOwnTemporaryTabIndex(target, '-1') : null;
	try { target.focus({preventScroll: true}); } catch (_) {}
	if (document.activeElement !== target) { ownership?.release(); return false; }
	if (ownership) target.addEventListener('blur', ownership.release, {once: true});
	if (!announce) return true;
	const label = String(target.getAttribute('aria-label') || target.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 140);
	if (label) srAnnounce('Moved to ' + label);
	return true;
}

function readerRecoverFocus() {
	const active = document.activeElement, top = readerDialogs.at(-1);
	if (active instanceof HTMLElement && active.isConnected && active !== document.body && active !== document.documentElement &&
			!active.closest('[hidden],[inert]') && (!top || top.panel.contains(active))) return;
	const target = top ? _rapierModalFocusables(top.panel)[0] || top.panel
		: !$('find-bar').hidden ? $('find-input') : $('btn-find');
	if (target) readerFocusHere(target);
}


function readerOutline() {
	const root = $('navigator-outline');
	root.textContent = '';
	root.dataset.outlineNoun = 'headings';
	const host = $('editor-blocks'), drawn = readerHeadings(), parts = reader.parts;
	let headings = drawn;
	if (parts && !parts.complete) {
		headings = [];
		const shown = new Set(drawn);
		for (const block of host.children) {
			if (block.classList.contains('reader-part')) { const part = parts.list[Number(block.dataset.part)]; headings.push(...(part.outline ||= readerPartHeadings(parts, Number(block.dataset.part)))); }
			else if (shown.has(block)) headings.push(block);
		}
	}
	if (!headings.length) {
		const note = document.createElement('p');
		note.className = 'navigator-empty';
		note.textContent = 'no headings in this document';
		root.append(note);
		$('navigator-status').textContent = note.textContent;
		return;
	}
	let current = 0;
	headings.forEach((heading, index) => { if (!heading.isConnected) return; if (!heading.hidden && heading.offsetTop <= host.scrollTop + 72) current = index; });
	headings.forEach((heading, index) => {
		if (!heading.isConnected) { root.append(readerOutlinePending(heading)); return; }
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'navigator-outline__item';
		button.style.setProperty('--outline-level', String(readerLevel(heading)));
		const label = (heading.textContent || '').trim().replace(/\s+/g, ' ') || 'untitled heading';
		button.textContent = label;
		button.dataset.outlineText = label;
		button.dataset.current = String(index === current);
		if (index === current) button.setAttribute('aria-current', 'location');
		button.addEventListener('click', () => {
			readerCloseDialog($('navigator-overlay'), !heading.isConnected);
			if (heading.isConnected) readerScrollTo(heading);
		});
		root.append(button);
	});
	$('navigator-outline-filter').value = '';
	readerOutlineFilter('');
	const folds = $('navigator-fold');
	folds.hidden = !drawn.some(heading => heading.querySelector(':scope > .section-fold-btn'));
	readerRenderFoldAll();
}

function readerPartHeadings(parts, index) {
	const part = parts.list[index], rows = [], lines = parts.source.slice(part.start, part.end).split('\n'), parser = readerParser();
	let fence = null, prose = false;
	const add = (level, text) => {
		const words = (parser.parseInline(text.trim(), {})[0]?.children || []).map(token => token.type === 'text' || token.type === 'code_inline' ? token.content : token.type === 'softbreak' ? ' ' : '');
		rows.push({pending: true, part: index, ordinal: rows.length, level, text: words.join('')});
	};
	for (const raw of lines) {
		const line = raw.replace(/\r$/, '');
		if (fence) { const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line); if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null; continue; }
		const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
		if (open && !(open[1][0] === '`' && open[2].includes('`'))) { fence = open[1]; prose = false; continue; }
		const atx = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/.exec(line);
		if (atx) { add(atx[1].length, atx[2] || ''); prose = false; continue; }
		if (prose && /^ {0,3}(?:=+|-+)[ \t]*$/.test(line)) { add(line.trim()[0] === '=' ? 1 : 2, prose); prose = false; continue; }
		prose = line.trim() && !/^ {0,3}(?:[-*+>]|\d{1,9}[.)]|\|)/.test(line) && !/^(?: {4}|\t)/.test(line) ? line : false;
	}
	return rows;
}
function readerOutlinePending(row) {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'navigator-outline__item';
	button.style.setProperty('--outline-level', String(row.level));
	const label = row.text.trim().replace(/\s+/g, ' ') || 'untitled heading';
	button.textContent = label;
	button.dataset.outlineText = label;
	button.dataset.current = 'false';
	button.addEventListener('click', async () => {
		const parts = reader.parts;
		readerCloseDialog($('navigator-overlay'), false);
		if (!parts || !await readerPartsRequest(parts, row.part, true)) return;
		const part = parts.list[row.part], found = [];
		for (let block = part.first; block; block = block.nextElementSibling) { if (/^H[1-6]$/.test(block.tagName)) found.push(block); if (block === part.last) break; }
		const target = found[row.ordinal] || part.first;
		if (target?.isConnected) readerScrollTo(target);
	});
	return button;
}

function readerOutlineFilter(value) {
	const terms = String(value).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean), root = $('navigator-outline');
	let visible = 0;
	const buttons = [...root.querySelectorAll('.navigator-outline__item')];
	for (const button of buttons) {
		const match = terms.every(term => button.dataset.outlineText.toLocaleLowerCase().includes(term));
		button.hidden = !match;
		if (match) visible++;
	}
	root.querySelector('[data-outline-filter-empty]')?.remove();
	if (!visible && terms.length) {
		const empty = document.createElement('p');
		empty.className = 'navigator-empty';
		empty.dataset.outlineFilterEmpty = 'true';
		empty.textContent = 'no matching headings';
		root.append(empty);
	}
	$('navigator-status').textContent = terms.length ? (visible ? visible + ' matching headings' : 'no matching headings') : buttons.length + ' headings';
}

function readerRenderFoldAll() {
	const foldable = readerHeadings().filter(heading => heading.querySelector(':scope > .section-fold-btn'));
	const collapsed = foldable.length > 0 && foldable.every(heading => reader.folded.has(heading));
	const button = $('navigator-fold');
	button.setAttribute('aria-label', collapsed ? 'expand all sections' : 'collapse all sections');
	button.setAttribute('aria-pressed', String(collapsed));
	button.textContent = collapsed ? 'EXPAND' : 'COLLAPSE';
}

function readerFoldAll() {
	const foldable = readerHeadings().filter(heading => heading.querySelector(':scope > .section-fold-btn'));
	if (foldable.every(heading => reader.folded.has(heading))) reader.folded.clear(); else foldable.forEach(heading => reader.folded.add(heading));
	readerApplyFolds();
	readerRenderFoldAll();
	srAnnounce(reader.folded.size ? 'All sections collapsed.' : 'All sections expanded.');
}

let readerFabQuiet = 0;
function readerBindFab() {
	const fab = $('scroll-fab'), label = $('scroll-fab-label'), host = $('editor-blocks'), bar = document.querySelector('.top-bar');
	if (!fab) return;
	const reachable = () => { fab.tabIndex = fab.classList.contains('visible') ? 0 : -1; };
	new MutationObserver(reachable).observe(fab, {attributes: true, attributeFilter: ['class']});
	reachable();
	let hideTimer = 0, tracking = false, dragging = false, pointerId = null, startX = 0, startY = 0, progress = -1, marks = null;
	const dwell = () => matchMedia('(hover: hover) and (pointer: fine)').matches ? 2400 : 900;
	const ride = y => { if (fab.style.top !== '0px') fab.style.top = '0px'; fab.style.transform = 'translate3d(0,' + y + 'px,0)'; };
	const track = () => {
		const rect = host.getBoundingClientRect(), top = Math.max(rect.top, bar ? bar.getBoundingClientRect().bottom : rect.top) + 72;
		return {top, bottom: Math.max(top, rect.bottom - 16 - fab.offsetHeight)};
	};
	const place = () => {
		const max = host.scrollHeight - host.clientHeight;
		if (!host.getClientRects().length || max <= 40) { fab.classList.remove('visible'); return false; }
		const {top, bottom} = track();
		ride(top + _rapierClamp(host.scrollTop / max, 0, 1) * (bottom - top));
		return true;
	};
	const show = () => {
		if (performance.now() < readerFabQuiet || !place()) return;
		fab.classList.add('visible');
		clearTimeout(hideTimer);
		if (!tracking) hideTimer = setTimeout(() => fab.classList.remove('visible'), dwell());
	};
	const headingMarks = () => {
		const max = Math.max(1, host.scrollHeight - host.clientHeight);
		return readerHeadings().filter(heading => !heading.hidden).map(heading => ({at: _rapierClamp(heading.offsetTop / max, 0, 1), label: (heading.textContent || '').trim().replace(/\s+/g, ' ')}));
	};
	host.addEventListener('scroll', () => { if (!dragging) show(); }, {passive: true});
	addEventListener('resize', () => { if (fab.classList.contains('visible')) place(); });
	fab.addEventListener('pointerdown', event => {
		if (event.button != null && event.button !== 0) return;
		tracking = true; dragging = false; pointerId = event.pointerId; startX = event.clientX; startY = event.clientY; progress = -1;
		marks = headingMarks();
		fab.classList.add('tracking');
		clearTimeout(hideTimer);
		try { fab.setPointerCapture(event.pointerId); } catch (_) {}
		event.preventDefault();
	});
	fab.addEventListener('pointermove', event => {
		if (!tracking || event.pointerId !== pointerId) return;
		if (!dragging) {
			const dx = event.clientX - startX, dy = event.clientY - startY;
			if (dx * dx + dy * dy < 64) return;
			dragging = true;
		}
		const {top, bottom} = track(), y = Math.min(bottom, Math.max(top, event.clientY));
		progress = (y - top) / ((bottom - top) || 1);
		host.scrollTop = progress * (host.scrollHeight - host.clientHeight);
		ride(y);
		let name = '';
		for (const mark of marks) if (mark.at <= progress) name = mark.label; else break;
		if (label.textContent !== name) label.textContent = name;
		label.style.top = (y + fab.offsetHeight / 2) + 'px';
		label.classList.toggle('visible', name !== '');
	});
	const finish = (event, cancelled) => {
		if (!tracking || event && event.pointerId !== pointerId) return;
		const moved = dragging;
		tracking = false; dragging = false; pointerId = null; marks = null;
		fab.classList.remove('tracking');
		label.classList.remove('visible');
		if (!moved && !cancelled) {
			const swallow = click => { click.stopPropagation(); click.preventDefault(); };
			document.addEventListener('click', swallow, {capture: true, once: true});
			setTimeout(() => document.removeEventListener('click', swallow, {capture: true}), 500);
			readerOpenOutline();
		}
		hideTimer = setTimeout(() => fab.classList.remove('visible'), dwell());
	};
	fab.addEventListener('pointerup', event => finish(event, false));
	fab.addEventListener('pointercancel', event => finish(event, true));
	fab.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); readerOpenOutline(); } });
}
function readerQuietFab() { readerFabQuiet = performance.now() + 500; $('scroll-fab')?.classList.remove('visible'); }

function readerOpenOutline() {
	readerOutline();
	readerOpenDialog($('navigator-overlay'), '.navigator-panel');
	if (readerPartsPending()) void readerPartsAll().then(() => { if (readerDialogs.some(row => row.overlay.id === 'navigator-overlay')) readerOutline(); });
}


const READER_FIND_LIMIT = 2048;
function readerSetFindCount(current, total) {
	const count = $('find-count');
	const label = Number(total) === 0 ? 'No matches' : 'Match ' + current + ' of ' + total;
	if (count.getAttribute('aria-label') === label) return;
	count.setAttribute('aria-label', label);
	const parts = [['find-count__cur', current], ['find-count__sep', '/'], ['find-count__tot', total]].map(([name, text]) => {
		const span = document.createElement('span');
		span.className = name;
		span.textContent = text;
		return span;
	});
	count.replaceChildren(...parts);
}

function readerFindOpen(open) {
	const bar = $('find-bar'), button = $('btn-find');
	const focusInside = !open && bar.contains(document.activeElement);
	bar.hidden = !open;
	button.toggleAttribute('data-active', open);
	button.setAttribute('aria-expanded', String(open));
	if (open) { $('find-input').focus(); $('find-input').select(); readerFindRun(); }
	else {
		readerFindClear();
		readerSetFindCount(0, 0);
		if (reader.parts) void readerPartsDrive(reader.parts);
		if (focusInside && !readerFocusHere(button)) readerRecoverFocus();
	}
}

function readerFindClear() {
	reader.find = {ranges: [], current: 0, overflow: false};
	if (CSS.highlights) { CSS.highlights.delete('rapier-find-all'); CSS.highlights.delete('rapier-find-current'); }
	readerPictureFind.clear();
}

function readerFindRun(keep) {
	const input = $('find-input'), query = input.value, previous = reader.find.current, selected = reader.find.ranges[previous];
	if (reader.parts && query && !$('find-bar').hidden) { readerFindSourceRun(keep); return; }
	readerFindClear();
	if (!query || $('find-bar').hidden) { readerSetFindCount(0, 0); if (reader.parts) void readerPartsDrive(reader.parts); return; }
	const host = $('editor-blocks'), read = readerFindTextNodes(host), nodes = read.nodes;
	let text = read.text;
	const lang = host.lang, original = text.length, {folded, origin} = readerFindFold(text, lang);
	text = folded;
	const back = (at, end) => !origin ? at : at < text.length ? origin[at] : end ? original : origin[at];
	const escape = value => readerFindFold(value, lang).folded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const separators = String.raw`[\t  _.:/\\\-‐-―]+`;
	const hits = pattern => {
		const found = [];
		let match;
		while (found.length <= READER_FIND_LIMIT && (match = pattern.exec(text)) !== null) {
			if (!match[0].length) { pattern.lastIndex++; continue; }
			found.push([match.index, match.index + match[0].length]);
		}
		return found;
	};
	let found = hits(new RegExp(escape(query), 'giu'));
	const parts = query.trim().split(new RegExp(separators, 'u')).filter(Boolean);
	if (!found.length && parts.length > 1) found = hits(new RegExp(parts.map(escape).join(separators), 'giu'));
	reader.find.overflow = found.length > READER_FIND_LIMIT;
	found.length = Math.min(found.length, READER_FIND_LIMIT);
	const where = offset => { let low = 0, high = nodes.length - 1; while (low < high) { const middle = (low + high + 1) >> 1; if (nodes[middle].start <= offset) low = middle; else high = middle - 1; } return nodes[low]; };
	reader.find.ranges = found.map(([foldedStart, foldedEnd]) => {
		const start = back(foldedStart), end = Math.max(back(foldedEnd, true), back(foldedEnd - 1) + 1);
		const from = where(start), to = where(end - 1), range = new Range();
		range.setStart(from.node, start - from.start);
		range.setEnd(to.node, end - to.start);
		return range;
	});
	const merged = readerPictureFind.merge(reader.find.ranges, query, reader.find.overflow);
	reader.find.ranges = merged.ranges; reader.find.overflow = merged.overflow;
	const kept = keep && selected ? merged.ranges.findIndex(range => readerPictureFind.same(range, selected)) : -1;
	reader.find.current = kept >= 0 ? kept : keep ? Math.min(previous, Math.max(0, merged.ranges.length - 1)) : 0;
	readerFindPaint(!keep);
	readerPictureFind.schedule();
}

function readerFindSourceCurrent(search) {
	return reader.find.source === search && reader.parts === search.parts && reader.generation === search.generation &&
		!$('find-bar').hidden && $('find-input').value === search.query && $('editor-blocks').lang === search.lang;
}

function readerFindTextNodes(root, first = root.firstChild, last = root.lastChild) {
	const nodes = [];
	let text = '';
	const readings = [];
	const skipped = node => {
		const out = node.parentElement?.closest('script,style,.diagram-cache[hidden],[hidden],.section-fold-btn,.rapier-ink-layer');
		return out && !(out.parentElement === root && out.matches('[hidden]:not(.diagram-cache,.rapier-ink-layer)'));
	};
	const append = node => {
		if (skipped(node)) return;
		const ruby = node.parentElement?.closest('rt,rp,rtc');
		if (ruby && typeof root.contains === 'function' && root.contains(ruby)) { readings.push(node); return; }
		nodes.push({node, start: text.length});
		text += node.data;
	};
	for (let child = first; child; child = child.nextSibling) {
		if (child.nodeType === Node.TEXT_NODE) append(child);
		else {
			const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT, {acceptNode: node => skipped(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT});
			for (let node; (node = walker.nextNode());) append(node);
		}
		if (child === last) break;
	}
	for (const node of readings) {
		if (text && !text.endsWith('\n')) text += '\n';
		nodes.push({node, start: text.length});
		text += node.data;
	}
	return {text, nodes};
}

function readerFindTopNode(node) {
	const host = $('editor-blocks');
	while (node?.parentNode && node.parentNode !== host) node = node.parentNode;
	return node?.parentNode === host ? node : null;
}

function readerFindPartNodes(part) {
	const first = readerFindTopNode(part.firstNode || part.first), last = readerFindTopNode(part.lastNode || part.last);
	return first && last ? readerFindTextNodes($('editor-blocks'), first, last) : {text: '', nodes: []};
}

function readerFindSourceText(parts, index) {
	const part = parts.list[index];
	if (part.findText !== undefined) return part.findText;
	if (part.done) return part.findText = readerFindPartNodes(part).text;
	const parser = readerParser(), source = _rapierSplitOpeningFrontmatter(readerPartSource(parts, index)).body;
	const env = {rapierImagePresentation: true, rapierPassive: true}, saved = parser.options.maxNesting;
	let tokens;
	try { parser.options.maxNesting = READER_MAX_NESTING; tokens = readerFootnoteSeeded(parts, index, () => parser.parse(source, env)); }
	finally { parser.options.maxNesting = saved; }
	if (!part.footnotes && tokens.some(token => token.type === 'footnote_block_open')) tokens = tokens.slice(0, tokens.findIndex(token => token.type === 'footnote_block_open'));
	const text = [], renderer = _rapierRenderModule('render');
	let start = 0;
	const append = end => {
		if (end === start) return;
		const fragment = _rapierRenderModule('render-sanitize').sanitizeRapierFragment(parser.renderer.render(tokens.slice(start, end), parser.options, env), 'export');
		const semantic = fragment.ownerDocument.createElement('div');
		semantic.append(fragment);
		const styled = renderer._rapierProjectStyledRoot(semantic, {metadata: parts.metadata, print: false, codeBudget: 0, sanitized: true, baseName: readerAnchorBase()});
		readerPlaceRelativePictures(styled);
		text.push(readerFindTextNodes(styled).text);
	};
	for (let at = 0; at < tokens.length; at++) {
		const token = tokens[at], language = String(token.info || '').trim().split(/\s+/)[0].toLowerCase();
		if (token.type !== 'fence' || token.level !== 0 || /^(?:html|math|mermaid)$/.test(language)) continue;
		append(at);
		text.push(token.content + '\n');
		start = at + 1;
	}
	append(tokens.length);
	return part.findText = text.join('');
}

function readerFindTextMatches(text, pattern, lang, limit) {
	const {folded, origin} = readerFindFold(text, lang), result = [];
	const back = at => !origin ? at : at < folded.length ? origin[at] : text.length;
	pattern.lastIndex = 0;
	for (let match; result.length < limit && (match = pattern.exec(folded));) {
		if (!match[0].length) { pattern.lastIndex++; continue; }
		const end = match.index + match[0].length;
		result.push({start: back(match.index), end: Math.max(back(end), back(end - 1) + 1)});
	}
	return result;
}

function readerFindSourceRun(keep) {
	const query = $('find-input').value, parts = reader.parts, lang = $('editor-blocks').lang, held = reader.find.source;
	if (keep && held?.query === query && held.parts === parts && held.lang === lang && held.generation === reader.generation) {
		held.dirty = true;
		if (held.ready && !held.showing && !held.refreshing) {
			held.refreshing = true;
			queueMicrotask(() => { held.refreshing = false; if (readerFindSourceCurrent(held)) void readerFindSourceShow(held, false); });
		}
		return;
	}
	readerFindClear();
	readerSetFindCount(0, 0);
	const search = reader.find.source = {parts, query, lang, generation: reader.generation, matches: [], ready: false, showing: 0, visit: 0};
	void readerFindSourceScan(search).catch(error => { if (readerFindSourceCurrent(search)) console.error('[rapier-reader] could not search the document', error); });
}

async function readerFindSourceScan(search, reveal = true) {
	const escape = value => readerFindFold(value, search.lang).folded.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const separators = String.raw`[\t  _.:/\\\-‐-―]+`, words = search.query.trim().split(new RegExp(separators, 'u')).filter(Boolean);
	const exact = escape(search.query), patterns = exact ? [new RegExp(exact, 'giu')] : [];
	if (exact && words.length > 1) patterns.push(new RegExp(words.map(escape).join(separators), 'giu'));
	for (const pattern of patterns) {
		search.pattern = pattern;
		let began = performance.now();
		for (let index = 0; index < search.parts.list.length && search.matches.length <= READER_FIND_LIMIT; index++) {
			if (!readerFindSourceCurrent(search)) return;
			const part = search.parts.list[index], raw = search.parts.source.slice(part.start, part.end);
			pattern.lastIndex = 0;
			let absent = false;
			if (part.findText === undefined && part.codeOnly && !raw.includes('\0') && !raw.includes('\t') && !/^ {0,3}(`{3,}|~{3,})[^\S\r\n]*html\b/im.test(raw) && !pattern.test(raw)) {
				pattern.lastIndex = 0;
				absent = !/[^\x00-\x7f]/.test(raw) || !pattern.test(readerFindFold(raw, search.lang).folded);
			}
			if (!absent) {
				const text = readerFindSourceText(search.parts, index);
				for (const hit of readerFindTextMatches(text, pattern, search.lang, READER_FIND_LIMIT + 1 - search.matches.length))
					search.matches.push({...hit, part: index});
			}
			if (performance.now() - began >= 8) { await readerTurn(); began = performance.now(); }
		}
		if (search.matches.length) break;
	}
	if (!readerFindSourceCurrent(search)) return;
	search.overflow = search.matches.length > READER_FIND_LIMIT;
	search.matches.length = Math.min(search.matches.length, READER_FIND_LIMIT);
	search.ready = true;
	const selected = search.selected;
	search.selected = null;
	if (!readerFindSourceRanges(search, selected, reveal)) return;
	const pending = search.pending || 0;
	search.pending = 0;
	if (reader.find.ranges.length && pending) reader.find.current = ((reader.find.current + pending) % reader.find.ranges.length + reader.find.ranges.length) % reader.find.ranges.length;
	await readerFindSourceShow(search, reveal || pending !== 0);
	readerPictureFind.schedule();
}

function readerFindRange(nodes, start, end) {
	if (!nodes.length || end <= start) return null;
	const where = offset => { let low = 0, high = nodes.length - 1; while (low < high) { const middle = (low + high + 1) >> 1; if (nodes[middle].start <= offset) low = middle; else high = middle - 1; } return nodes[low]; };
	const from = where(start), to = where(end - 1);
	if (start - from.start > from.node.length || end - to.start > to.node.length) return null;
	const range = new Range();
	range.setStart(from.node, start - from.start); range.setEnd(to.node, end - to.start);
	return range;
}

function readerFindSourceRanges(search, selected, reveal = false) {
	const mapped = new Map(), matched = new Set(search.matches.map(match => match.part));
	let changed = false;
	for (let index = 0; index < search.parts.list.length; index++) {
		const part = search.parts.list[index];
		if (!part.done || part.codeOnly && part.findText === undefined && !matched.has(index)) continue;
		const reading = readerFindPartNodes(part);
		mapped.set(index, reading);
		if (part.findText !== undefined && part.findText !== reading.text) changed = true;
		part.findText = reading.text;
	}
	if (selected?.range && !selected.picture) {
		const reading = mapped.get(selected.part), from = reading?.nodes.find(row => row.node === selected.range.startContainer), to = reading?.nodes.find(row => row.node === selected.range.endContainer);
		if (from && to) selected = {...selected, start: from.start + selected.range.startOffset, end: to.start + selected.range.endOffset};
	}
	if (changed) {
		search.matches = []; search.ready = false; search.selected = selected;
		void readerFindSourceScan(search, reveal).catch(error => { if (readerFindSourceCurrent(search)) console.error('[rapier-reader] could not search the document', error); });
		return false;
	}
	for (const match of search.matches) {
		const reading = mapped.get(match.part);
		match.range = reading ? readerFindRange(reading.nodes, match.start, match.end) : null;
	}
	const rows = search.matches.slice(), pictures = readerPictureFind.merge([], search.query, false);
	for (const range of pictures.ranges) {
		const image = readerFindTopNode(range.picture.entry.image);
		const index = search.parts.list.findIndex(part => {
			if (!part.done || !image) return false;
			const first = readerFindTopNode(part.firstNode || part.first), last = readerFindTopNode(part.lastNode || part.last);
			return first && last && (first === image || last === image ||
				(first.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING) && (last.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_PRECEDING));
		});
		if (index >= 0) rows.push({part: index, range, picture: range.picture});
	}
	rows.sort((a, b) => a.part - b.part || (a.range && b.range ? a.range.compareBoundaryPoints(Range.START_TO_START, b.range) || (a.picture?.ordinal || 0) - (b.picture?.ordinal || 0) : a.start - b.start));
	reader.find.overflow = search.overflow || pictures.overflow || rows.length > READER_FIND_LIMIT;
	rows.length = Math.min(rows.length, READER_FIND_LIMIT);
	search.rows = rows;
	search.dirty = false;
	const kept = selected ? rows.findIndex(row => row === selected || !row.picture && !selected.picture && row.part === selected.part && row.start === selected.start && row.end === selected.end ||
		row.picture && selected.picture && row.picture.entry === selected.picture.entry && row.picture.ordinal === selected.picture.ordinal) : -1;
	reader.find.current = kept >= 0 ? kept : Math.min(reader.find.current, Math.max(0, rows.length - 1));
	reader.find.ranges = rows.map(row => row.range || row);
	return true;
}

async function readerFindSourceShow(search, reveal) {
	if (!readerFindSourceCurrent(search) || !search.ready) return;
	const visit = ++search.visit;
	search.showing++;
	try {
		let selected = search.rows?.[reader.find.current] || search.matches[reader.find.current];
		if (selected && !selected.picture && !search.parts.list[selected.part].done) {
			if (!await readerPartsRequest(search.parts, selected.part, true)) return;
			search.dirty = true;
		}
		if (!readerFindSourceCurrent(search) || visit !== search.visit) return;
		if ((search.dirty || selected && !selected.range?.startContainer.isConnected) && !readerFindSourceRanges(search, selected, reveal)) return;
		readerFindPaint(reveal && !!reader.find.ranges[reader.find.current]?.startContainer);
		if (reveal && search.rows.length > 1) {
			requestAnimationFrame(() => {
				if (!readerFindSourceCurrent(search) || visit !== search.visit) return;
				for (const next of [1, -1]) {
					const row = search.rows[(reader.find.current + next + search.rows.length) % search.rows.length];
					if (row && !row.picture) void readerPartsRequest(search.parts, row.part);
				}
			});
		}
	} finally {
		search.showing--;
		if (!search.showing && search.ready && search.dirty && readerFindSourceCurrent(search)) readerFindSourceRun(true);
	}
}

// lowered by the document's language (Turkish İ and I), and dotless ı reads as i. So "café" finds an NFD "café" and "cafe", "istanbul"
const READER_FIND_MARKS = /\p{M}/gu, readerFindFolds = {lang: null, characters: new Map(), text: null, result: null};
function readerFindFold(text, lang) {
	let locale = lang || undefined;
	try { 'i'.toLocaleLowerCase(locale); } catch (_) { locale = undefined; }
	if (!/[^\x00-\x7f]/.test(text)) return {folded: text.toLowerCase(), origin: null};
	const cache = readerFindFolds;
	if (cache.lang !== (locale || '')) { cache.lang = locale || ''; cache.characters.clear(); cache.text = cache.result = null; }
	if (cache.text === text) return cache.result;
	const fold = character => {
		let piece = cache.characters.get(character);
		if (piece === undefined) cache.characters.set(character, piece = character.normalize('NFKD').replace(READER_FIND_MARKS, '').toLocaleLowerCase(locale).normalize('NFKD').replace(READER_FIND_MARKS, '').replace(/ı/g, 'i'));
		return piece;
	};
	let origin = new Int32Array(text.length + 16), folded = '', length = 0, run = 0;
	const put = (piece, at) => {
		if (length + piece.length > origin.length) { const grown = new Int32Array(Math.max(origin.length * 2, length + piece.length)); grown.set(origin); origin = grown; }
		for (let index = 0; index < piece.length; index++) origin[length++] = at;
	};
	for (let at = 0; at < text.length;) {
		const code = text.charCodeAt(at);
		if (code < 0x80) {
			run = at;
			while (at < text.length && text.charCodeAt(at) < 0x80) at++;
			const piece = text.slice(run, at).toLowerCase();
			if (length + piece.length > origin.length) { const grown = new Int32Array(Math.max(origin.length * 2, length + piece.length)); grown.set(origin); origin = grown; }
			for (let index = 0; index < piece.length; index++) origin[length++] = run + index;
			folded += piece;
			continue;
		}
		const width = code >= 0xd800 && code < 0xdc00 && at + 1 < text.length ? 2 : 1, piece = fold(text.slice(at, at + width));
		put(piece, at);
		folded += piece;
		at += width;
	}
	const result = {folded, origin: origin.subarray(0, length)};
	if (text.length > 256) { cache.text = text; cache.result = result; }
	return result;
}

function readerFindPaint(reveal) {
	const {ranges, current} = reader.find;
	readerSetFindCount(ranges.length ? current + 1 : 0, ranges.length + (reader.find.overflow ? '+' : ''));
	if (CSS.highlights) {
		if (reader.find.painted !== ranges) {
			const text = ranges.filter(range => range instanceof Range && !range.picture);
			if (text.length) CSS.highlights.set('rapier-find-all', new Highlight(...text));
			else CSS.highlights.delete('rapier-find-all');
			reader.find.painted = ranges;
		}
		if (ranges[current] instanceof Range && !ranges[current].picture) CSS.highlights.set('rapier-find-current', new Highlight(ranges[current]));
		else CSS.highlights.delete('rapier-find-current');
	}
	readerPictureFind.paint();
	if (reveal && ranges.length) readerFindReveal(ranges[current]);
}

function readerFindReveal(range) {
	if (reader.parts) reader.parts.pinEnd = false;
	const node = range.picture?.entry.image || (range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement);
	readerReveal(node);
	for (let details = node?.closest('details:not([open])'); details; details = details.parentElement?.closest('details:not([open])')) details.open = true;
	const host = $('editor-blocks'), box = range.picture ? readerPictureFind.reveal(range) : range.getBoundingClientRect(), view = host.getBoundingClientRect();
	if (box && (box.width || box.height)) host.scrollTop = Math.max(0, host.scrollTop + box.top - view.top - Math.max(0, (host.clientHeight - Math.min(box.height, host.clientHeight)) / 2));
}

function readerFindStep(direction) {
	const {ranges} = reader.find;
	if (reader.find.source && !reader.find.source.ready) { reader.find.source.pending = (reader.find.source.pending || 0) + direction; return; }
	if (!ranges.length) { readerFindRun(); return; }
	reader.find.current = (reader.find.current + direction + ranges.length) % ranges.length;
	if (reader.find.source) { void readerFindSourceShow(reader.find.source, true); return; }
	readerFindPaint(true);
}


const readerDialogs = [];
function openDialog(overlay, options) { readerOpenDialog(overlay, options?.panel); }
function closeDialog(overlay) { readerCloseDialog(overlay); }
const readerInert = new Map();
function readerIsolate() {
	const overlay = readerDialogs.at(-1)?.overlay;
	if (!overlay) {
		for (const [element, inert] of readerInert) if (element.isConnected) element.inert = inert;
		readerInert.clear();
		return;
	}
	for (const element of document.body.children) {
		const active = element === overlay || element.contains(overlay);
		if (element.classList.contains('settings-overlay')) {
			element.inert = !active;
			element.setAttribute('aria-hidden', String(!active));
			continue;
		}
		if (!readerInert.has(element)) readerInert.set(element, element.inert);
		const behind = !active && element.tagName !== 'SCRIPT' &&
			element.id !== 'toast-root' && element.id !== 'sr-live';
		element.inert = active ? false : readerInert.get(element) || behind;
	}
}

function readerOpenDialog(overlay, panelSelector) {
	if (readerDialogs.some(row => row.overlay === overlay)) return;
	_rapierUiRaise(overlay);
	const panel = overlay.querySelector(panelSelector || '.settings-panel') || overlay;
	const active = document.activeElement, opener = active instanceof HTMLElement && active !== document.body ? active : null;
	const trap = event => _rapierTrapModalTab(event, panel);
	overlay.addEventListener('keydown', trap);
	readerDialogs.push({overlay, panel, opener, trap});
	readerIsolate();
	setTimeout(() => {
		if (readerDialogs.at(-1)?.overlay !== overlay) return;
		const wanted = panel.querySelector('[autofocus]') || _rapierModalFocusables(panel)[0];
		if (wanted) { wanted.focus({preventScroll: true}); return; }
		panel.setAttribute('tabindex', '-1');
		panel.focus({preventScroll: true});
	}, 15);
}

function readerCloseDialog(overlay, restoreFocus = true) {
	const at = readerDialogs.findIndex(row => row.overlay === overlay);
	if (at < 0) return;
	const [row] = readerDialogs.splice(at, 1);
	overlay.removeEventListener('keydown', row.trap);
	_rapierUiLower(overlay);
	readerIsolate();
	if (!restoreFocus) return;
	const top = readerDialogs.at(-1);
	if (row.opener?.isConnected && !row.opener.closest('[hidden],[inert]') &&
			(!top || top.panel.contains(row.opener)) && readerFocusHere(row.opener)) return;
	if (!row.opener && !top && reader.loaded && readerFocusHere($('editor-blocks'))) return;
	readerRecoverFocus();
}

function readerCloseTop() {
	const top = readerDialogs.at(-1);
	if (!top) return false;
	if (top.overlay === $('math-plugin-overlay')) _rapierUiMath.dismiss();
	else if (top.overlay === $('mermaid-plugin-overlay')) _rapierUiDiagram.dismiss();
	else if (top.overlay === $('licenses-overlay')) readerCloseLicenses();
	else if (top.overlay === $('pdf-plugin-overlay')) readerPdfDecide(false);
	else if (top.overlay === $('ocr-plugin-overlay')) _rapierOcrDismiss();
	else readerCloseDialog(top.overlay);
	return true;
}

const READER_PAGE_KEYS = {PageDown: 0.875, PageUp: -0.875, ' ': 0.875, ArrowDown: 40, ArrowUp: -40, Home: -Infinity, End: Infinity};
function readerPageKeys(event) {
	const step = READER_PAGE_KEYS[event.key], active = document.activeElement;
	if (step === undefined || event.defaultPrevented || (event.ctrlKey || event.metaKey) && Math.abs(step) !== Infinity || event.altKey || readerDialogs.length || !reader.loaded ||
			active && active !== document.body && active !== document.documentElement) return;
	const host = $('editor-blocks'), back = event.key === ' ' && event.shiftKey ? -1 : 1;
	event.preventDefault();
	if (reader.parts) {
		reader.parts.pinEnd = step === Infinity;
		if (step === Infinity) void readerPartsRequest(reader.parts, reader.parts.list.length - 1, true);
	}
	if (Math.abs(step) === Infinity) host.scrollTop = step > 0 ? host.scrollHeight : 0;
	else host.scrollBy({top: back * (Math.abs(step) < 1 ? step * host.clientHeight : step)});
}

// one on top, when it is a question Escape may answer (licences, privacy, deleting a plug-in). On a plug-in prompt, Escape answers "not now".
function readerEscape() {
	const open = id => readerDialogs.some(row => row.overlay.id === id);
	if (READER_ANSWER_ONLY.has(readerDialogs.at(-1)?.overlay.id)) return readerCloseTop();
	const top = ['math-plugin-overlay', 'mermaid-plugin-overlay', 'ocr-plugin-overlay', 'pdf-plugin-overlay', 'plugin-delete-overlay', 'copy-overlay', 'share-overlay', 'licenses-overlay', 'privacy-overlay', 'navigator-overlay', 'settings-overlay'].find(open);
	if (!top) return false;
	let closed = false;
	for (const id of ['copy-overlay', 'share-overlay', 'navigator-overlay', 'settings-overlay']) if (open(id)) { readerCloseDialog($(id)); closed = true; }
	if (top === 'ocr-plugin-overlay') { _rapierOcrDismiss(); closed = true; }
	else if (top === 'licenses-overlay') { readerCloseLicenses(); closed = true; }
	else if (top === 'privacy-overlay' || top === 'plugin-delete-overlay') { readerCloseDialog($(top)); closed = true; }
	return closed;
}

function readerStats() {
	const text = reader.source;
	if (reader.docKind !== 'markdown') { const trimmed = text.trim(); return {words: trimmed ? trimmed.split(/\s+/).length : 0, chars: text.length, lines: text.split('\n').length}; }
	const opening = _rapierSplitOpeningFrontmatter(text);
	let words = 0, chars = (opening.frontmatter || '').length, references = null;
	opening.body.split(/(\n{2,})/).forEach((raw, at) => {
		if (at % 2) { chars += raw.length; return; }
		let prose = globalThis.RapierImageAssets.isAssetBlock(raw) ? '' : raw;
		if (prose.includes('<!--md-layout:')) {
			references ||= {references: Object.assign(Object.create(null), globalThis.RapierImageAssets.parseAssets(text).references)};
			const markers = globalThis.RapierMarkdownLayout.layoutTargets(prose, readerParser(), references).filter(row => row.marker && !row.reason);
			for (const row of markers.reverse()) prose = prose.slice(0, row.marker.start) + prose.slice(row.marker.end);
		}
		const trimmed = prose.trim();
		if (trimmed && trimmed !== '&nbsp;') words += trimmed.split(/\s+/).length;
		chars += prose.replace(/data:[a-z]+\/[a-z0-9.+-]+(?:;[a-z0-9=.-]+)*;base64,[A-Za-z0-9+/=]+/gi, '').length;
	});
	return {words, chars, lines: text.split('\n').length};
}

function readerRenderSettings() {
	const actions = document.querySelector('.settings-primary-actions');
	if (actions) actions.hidden = _rapierEmbed.active && !_rapierEmbed.capabilities?.includes('open');
	$('settings-panel-title').textContent = 'rapier V' + READER_VERSION;
	const stats = readerStats();
	$('stat-words').textContent = String(stats.words);
	$('stat-chars').textContent = String(stats.chars);
	$('stat-lines').textContent = String(stats.lines);
	for (const field of ['theme', 'fontSize', 'showPlayButton', 'highlights', 'headings', 'layout', 'invertImageAlpha', 'accent']) {
		const group = $(({theme: 'switch-theme', fontSize: 'switch-font-size', showPlayButton: 'switch-read-aloud', highlights: 'switch-highlights', headings: 'switch-headings', layout: 'switch-layout', invertImageAlpha: 'switch-invert-image-alpha', accent: 'accent-swatches'})[field]);
		renderSwitch(group, field === 'theme' && reader.hostTheme ? reader.hostTheme : readerPreference(field));
	}
	const code = $('settings-code-controls'), open = code.dataset.open === 'true';
	code.inert = !open;
	for (const button of $('settings-code-title').querySelectorAll('[data-action="code-toggle"]')) button.setAttribute('aria-expanded', String(open));
	for (const name of ['layout', 'plugins']) {
		const section = $('settings-' + name + '-controls');
		if (!section) continue;
		const shown = section.dataset.open === 'true';
		section.inert = !shown;
		for (const button of document.querySelectorAll('[aria-controls="' + section.id + '"]')) button.setAttribute('aria-expanded', String(shown));
	}
	readerRenderPdfRow();
	_rapierOcrPaint();
	for (const [key, provider] of [['math', _rapierUiMath], ['mermaid', _rapierUiDiagram]]) {
		$(key + '-plugin-action').hidden = provider.installed();
		$(key + '-plugin-installed').hidden = !provider.installed();
		$(key + '-plugin-action').disabled = provider.busy();
		$(key + '-plugin-action').textContent = provider.buttonLabel();
	}
}

function readerStampSwatches() {
	$('accent-swatches').replaceChildren(...PREFERENCE_ACCENTS.map(preset => {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'swatch-wrap';
		button.dataset.action = 'switch';
		button.dataset.value = preset.accent;
		button.setAttribute('aria-label', preset.name + ' accent');
		button.dataset.tip = button.title = preset.name.toLowerCase();
		const swatch = document.createElement('span');
		swatch.className = 'accent-swatch';
		swatch.style.background = preset.accent;
		swatch.setAttribute('aria-hidden', 'true');
		button.append(swatch);
		return button;
	}));
}

function readerOpenSettings() {
	readerRenderSettings();
	readerAccentOwner();
	readerOpenDialog($('settings-overlay'), '#settings-panel');
}

const READER_ANSWER_ONLY = new Set(['math-plugin-overlay', 'mermaid-plugin-overlay', 'ocr-plugin-overlay', 'pdf-plugin-overlay']);
function readerInstallSheetGesture() {
	const settings = $('settings-overlay');
	_rapierSheetGestureInstall({
		settings: () => ({overlay: settings, panel: $('settings-panel')}),
		sheetFor: target => {
			const panel = target instanceof Element ? target.closest('.settings-panel') : null, overlay = panel?.closest('.settings-overlay');
			if (!overlay || !_rapierUiDialogIsOpen(overlay)) return null;
			return {overlay, panel, plane: overlay.classList.contains('restore-modal-overlay') ? 'y' : 'x', anchor: 'edge'};
		},
		dismissable: overlay => readerDialogs.at(-1)?.overlay === overlay && !READER_ANSWER_ONLY.has(overlay.id),
		dismiss: () => readerCloseTop(),
		setSettingsOpen: open => { if (!open) readerCloseDialog(settings); },
	});
}


const readerPluginSize = bytes => bytes >= 1e6 ? (bytes / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1e3)) + ' KB';
function readerPlugin(key, label, noun) {
	const view = {
		key, status: 'checking', error: null, dismissed: false, wanted: false, together: null,
		installed() { return this.status === 'ready'; },
		busy() { return this.status === 'downloading' || this.status === 'installing'; },
		apply(detail) {
			const before = this.installed();
			this.status = detail?.status || this.status;
			this.error = detail?.error || null;
			if (this.installed()) readerCloseDialog($(key + '-plugin-overlay'));
			this.render();
			readerRenderSettings();
			if (!before && this.installed() && reader.loaded) void readerRenderDocument();
		},
		request() {
			if (this.installed() || this.dismissed) return;
			const query = new URLSearchParams(location.search);
			if (_rapierEmbed.active && !this.busy() && this.status !== 'error' && (query.has('plugins') || query.get('approvePlugins') === '1')) { this.install(); return; }
			this.wanted = true;
			readerPluginsAsk();
		},
		install() { for (const view of this.together || [this]) _rapierProviders[view.key]?.[view.status === 'error' ? 'reinstall' : 'install']().catch(() => {}); },
		dismiss() { for (const view of this.together || [this]) { view.dismissed = true; view.together = null; } this.together = null; readerCloseDialog($(key + '-plugin-overlay')); },
		buttonLabel() {
			if (this.installed()) return label + ' INSTALLED';
			if (this.status === 'downloading') return 'DOWNLOADING ' + label + '…';
			if (this.status === 'installing') return 'INSTALLING ' + label + '…';
			if (this.status === 'error') return 'INSTALL ' + label + ' (RETRY)';
			return 'INSTALL ' + label;
		},
		render() {
			const status = this.status, name = noun[0].toUpperCase() + noun.slice(1), pair = this.together?.length > 1 && status !== 'error';
			$(key + '-plugin-title').textContent = pair ? (status === 'downloading' ? 'Plug-ins downloading' : status === 'installing' ? 'Plug-ins installing' : 'Install math and diagram plug-ins?') : status === 'downloading' ? name + ' plug-in downloading' : status === 'installing' ? name + ' plug-in installing' : status === 'error' ? name + ' plug-in unavailable' : 'Install ' + noun + ' plug-in?';
			$(key + '-plugin-body').textContent = status === 'error' ? 'Rapier could not reach or verify the ' + noun + ' renderer. Check your internet connection and tap retry.' : '• Shows the ' + (key === 'math' ? 'math' : 'diagrams') + ' in this document.\n• ' + (readerPluginSize(_rapierProviders[key]?.downloadBytes) + ', once.') + '\n• Works offline.';
			if (pair) $(key + '-plugin-body').textContent = '• Shows the math and the diagrams in this document.\n• ' + readerPluginSize(this.together.reduce((sum, view) => sum + (_rapierProviders[view.key]?.downloadBytes || 0), 0)) + ', once.\n• Works offline.';
			$(key + '-plugin-body').style.whiteSpace = 'pre-line';
			$(key + '-plugin-progress').hidden = !this.busy();
			$(key + '-plugin-progress').textContent = status === 'downloading' ? 'Downloading the ' + noun + ' renderer…' : 'Installing the renderer…';
			$(key + '-plugin-error').hidden = status !== 'error';
			$(key + '-plugin-error').textContent = 'Last attempt failed: ' + (this.error || 'the download did not finish. Tap retry.');
			$(key + '-plugin-install').disabled = this.busy();
			$(key + '-plugin-install').textContent = status === 'downloading' ? 'downloading…' : status === 'installing' ? 'installing…' : status === 'error' ? 'retry' : 'install now';
		},
	};
	return view;
}
let readerAskTimer = 0;
function readerPluginsAsk() {
	clearTimeout(readerAskTimer);
	readerAskTimer = setTimeout(() => {
		const asking = [_rapierUiMath, _rapierUiDiagram].filter(view => view.wanted && !view.installed() && !view.dismissed && !view.busy());
		if (!asking.length) return;
		for (const view of asking) { view.together = asking; view.wanted = false; }
		asking[0].render();
		readerOpenDialog($(asking[0].key + '-plugin-overlay'));
	}, 80);
}
const _rapierUiMath = readerPlugin('math', 'MATH', 'math');
const _rapierUiDiagram = readerPlugin('mermaid', 'MERMAID', 'diagram');

let readerDeleting = '';
const READER_PLUGIN_WORDS = {
	math: ['the math renderer', 'Math shows as its TeX source until you install it again.'],
	mermaid: ['the Mermaid renderer', 'Diagrams that need this plug-in show their source until you install it again.'],
	pdf: ['the PDF reader', 'PDF files cannot be opened until you install it again.'],
	ocr: ['the text reader and its cached words', 'Search stops reading pictures until you install it again.'],
};
function readerHeld(key) {
	if (key === 'pdf') { const plugin = globalThis.RapierPdfReader?.plugin, state = plugin?.state(); return state?.installed && state.deletable ? plugin : null; }
	const provider = _rapierProviders[key];
	return provider && provider.status === 'ready' && provider.deletable ? provider : null;
}
function readerAskDelete(key) {
	if (!readerHeld(key)) return;
	readerDeleting = key;
	$('plugin-delete-title').textContent = 'Delete the ' + (key === 'pdf' ? 'PDF reader' : key + ' plugin') + '?';
	$('plugin-delete-body').textContent = '• Removes ' + READER_PLUGIN_WORDS[key][0] + '.\n• ' + READER_PLUGIN_WORDS[key][1];
	$('plugin-delete-body').style.whiteSpace = 'pre-line';
	$('plugin-delete-error').hidden = true;
	readerOpenDialog($('plugin-delete-overlay'));
}
async function readerDeleteNow() {
	const key = readerDeleting, held = readerHeld(key), now = $('plugin-delete-now');
	if (!held) return;
	now.disabled = true;
	now.textContent = 'deleting…';
	try {
		if (key === 'ocr') await _rapierOcrForgetPlugin(); else await held.forget();
		if (key === 'math') _rapierUiMath.dismissed = true; else if (key === 'mermaid') _rapierUiDiagram.dismissed = true;
		readerCloseDialog($('plugin-delete-overlay'));
		if (reader.loaded && key !== 'pdf' && key !== 'ocr') void readerRenderDocument();
	} catch (error) {
		$('plugin-delete-error').textContent = 'Not deleted: ' + String(error?.message || error);
		$('plugin-delete-error').hidden = false;
	} finally { now.disabled = false; now.textContent = 'delete'; readerRenderSettings(); }
}

const readerPdf = {run: null, banner: null, decision: null};

function readerRenderPdfRow() {
	const state = globalThis.RapierPdfReader?.plugin?.state();
	$('pdf-plugin-action').hidden = !!state?.installed;
	$('pdf-plugin-action').disabled = !!state?.downloading || !!readerPdf.run;
	$('pdf-plugin-action').textContent = state?.downloading ? 'DOWNLOADING PDF READER…' : 'INSTALL PDF READER';
	$('pdf-plugin-installed').hidden = !state?.installed;
	$('pdf-plugin-installed').querySelector('span').textContent = 'PDF READER INSTALLED';
}

function readerPdfProgress(message) {
	if (!readerPdf.run) return;
	if (!readerPdf.banner) {
		const banner = document.createElement('div'), label = document.createElement('span'), cancel = document.createElement('button');
		banner.className = 'rapier-import-progress';
		banner.setAttribute('role', 'status');
		cancel.type = 'button';
		cancel.textContent = 'cancel';
		cancel.addEventListener('click', () => readerPdf.run?.controller.abort());
		banner.append(label, cancel);
		document.body.append(banner);
		readerPdf.banner = banner;
	}
	readerPdf.banner.firstChild.textContent = String(message || 'Reading PDF…');
}

function readerPdfAsk(bytes) {
	$('pdf-plugin-title').textContent = 'Install PDF reader?';
	$('pdf-plugin-body').textContent = '• ' + (bytes / 1e6).toFixed(1) + ' MB PDF reader, once.\n• Works offline.\n• Your file stays here.';
	$('pdf-plugin-body').style.whiteSpace = 'pre-line';
	$('pdf-plugin-progress').hidden = true;
	$('pdf-plugin-error').hidden = true;
	$('pdf-plugin-install').disabled = false;
	$('pdf-plugin-install').textContent = 'install now';
	readerOpenDialog($('pdf-plugin-overlay'));
	return new Promise(resolve => { readerPdf.decision = resolve; });
}
function readerPdfDecide(accepted) {
	const resolve = readerPdf.decision;
	readerPdf.decision = null;
	if (!accepted) readerCloseDialog($('pdf-plugin-overlay'));
	resolve?.(accepted);
}

async function readerEnsurePdf(signal, progress) {
	const part = _rapierProviders.pdf;
	if (!part) throw new Error('the PDF reader is unavailable');
	if (part.status !== 'ready') await (part.status === 'error' ? part.reinstall() : part.install());
	const plugin = globalThis.RapierPdfReader.plugin;
	if (!await plugin.checkInstalled()) {
		if (!await readerPdfAsk(plugin.downloadBytes)) return false;
		$('pdf-plugin-install').disabled = true;
		$('pdf-plugin-install').textContent = 'downloading…';
		$('pdf-plugin-progress').hidden = false;
		try { await plugin.install({signal, onProgress: message => { $('pdf-plugin-progress').textContent = message; progress(message); }}); }
		catch (error) {
			$('pdf-plugin-error').textContent = 'Last attempt failed: ' + String(error?.message || error);
			$('pdf-plugin-error').hidden = false;
			$('pdf-plugin-install').disabled = false;
			$('pdf-plugin-install').textContent = 'retry';
			throw error;
		}
		readerCloseDialog($('pdf-plugin-overlay'));
	}
	await plugin.ensureLoaded();
	return true;
}

async function readerWithImport(work, what, signal) {
	if (readerPdf.run) { readerToast('Still reading a PDF.', 'info'); return false; }
	const run = readerPdf.run = {controller: new AbortController(), done: null};
	return run.done = readerImportRun(work, run, signal);
}
async function readerImportRun(work, run, signal) {
	const cancel = () => run.controller.abort(signal.reason);
	if (signal?.aborted) cancel(); else signal?.addEventListener('abort', cancel, {once: true});
	readerRenderPdfRow();
	try { return await work(run); }
	catch (error) { if (error?.name !== 'AbortError') (console.error(error), readerToast('Couldn’t open it. Try again.', 'error')); return false; }
	finally {
		signal?.removeEventListener('abort', cancel);
		run.controller.abort();
		readerPdf.banner?.remove();
		readerPdf.banner = null;
		readerPdf.run = null;
		readerRenderPdfRow();
	}
}

function readerInstallPdf() {
	return readerWithImport(async run => {
		if (!await readerEnsurePdf(run.controller.signal, readerPdfProgress)) return false;
		readerToast('PDF reader installed', 'success');
		return true;
	}, 'PDF reader');
}

function readerOpenWord(file, opening) {
	return readerWithImport(async run => {
		const part = _rapierProviders.docx;
		if (!part) throw new Error('the Word reader is unavailable');
		readerPdfProgress(part.status === 'ready' ? 'Reading Word document…' : 'Downloading the Word reader…');
		if (part.status !== 'ready') await (part.status === 'error' ? part.reinstall() : part.install());
		readerPdfProgress('Reading Word document…');
		const result = await globalThis.RapierDocxReader.read(file, {signal: run.controller.signal});
		const name = file.name.replace(/\.docx$/i, '').replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, 180) || 'document';
		if (!await readerCommitOpen(readerDocumentText(result.markdown), name + '.md', opening)) return false;
		readerToast('Word document opened' + (result.warnings[0] ? ' · ' + (typeof result.warnings[0] === 'string' ? result.warnings[0] : result.warnings[0].message) : ''), 'info');
		return true;
	}, 'Word reader', opening?.ticket?.controller.signal);
}

function readerOpenPdf(file, opening, mode = 'text') {
	return readerWithImport(async run => {
		if (!await readerEnsurePdf(run.controller.signal, readerPdfProgress)) return false;
		const options = {signal: run.controller.signal, onProgress: progress => readerPdfProgress(typeof progress === 'string' ? progress : 'Reading page ' + progress.page + (progress.pages ? ' of ' + progress.pages : '') + '…')};
		readerPdfProgress('Reading PDF…');
		let result;
		try { result = await globalThis.RapierPdfReader.read(file, {...options, mode}); }
		catch (error) { if (error?.code !== 'PDF_NO_TEXT') throw error; mode = 'pages'; result = await globalThis.RapierPdfReader.read(file, {...options, mode}); }
		const name = file.name.replace(/\.pdf$/i, '').replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, 180) || 'document';
		if (!await readerCommitOpen(readerDocumentText(result.markdown), name + '.md', opening)) return false;
		const notes = result.warnings.map(note => typeof note === 'string' ? note : note.message);
		readerToast('PDF opened as ' + (mode === 'pages' ? 'page pictures' : 'text') + (notes.length ? ' · ' + notes.length + (notes.length === 1 ? ' note' : ' notes') : ''), 'info',
			notes.length ? {label: 'SHOW', fn: () => readerPdfNotes(file, mode, notes)} : null);
		return true;
	}, 'PDF reader', opening?.ticket?.controller.signal);
}

function readerPdfNotes(file, mode, notes) {
	const overlay = $('info-overlay'), list = document.createElement('ul'), other = document.createElement('button');
	overlay.querySelector('#info-sheet-title').textContent = 'notes';
	list.append(...notes.map(note => { const item = document.createElement('li'); item.textContent = note; return item; }));
	other.type = 'button';
	other.className = 'settings-action-btn';
	other.textContent = mode === 'pages' ? 'text' : 'page pictures';
	other.addEventListener('click', () => { readerCloseDialog(overlay); void readerOpenPdf(file, {generation: reader.generation}, mode === 'pages' ? 'text' : 'pages'); });
	overlay.querySelector('.info-action-body').replaceChildren(list, other);
	readerOpenDialog(overlay, '.info-action-sheet');
}
$('info-overlay').addEventListener('click', event => {
	if (event.target === $('info-overlay') || event.target.closest('[data-info-close]')) readerCloseDialog($('info-overlay'));
});


const readerSpeech = {active: false, paused: false, blocks: [], position: -1, utterance: null, lastWordStart: 0, timer: 0, follow: true, armed: false};
function showToast(message, type) { readerToast(message, type); }
function _rapierSourceText() { return reader.source; }
function _rapierEmbedFeatureAllowed(name) { return !_rapierEmbed.active || !_rapierEmbed.settings || _rapierEmbed.settings.features.includes(name); }

function readerRenderReadAloud() {
	const button = $('btn-read-aloud');
	if (!button) return;
	const playing = readerSpeech.active && !readerSpeech.paused;
	button.hidden = !readerPreference('showPlayButton') || !_rapierEmbedFeatureAllowed('readAloud');
	button.setAttribute('aria-label', !readerSpeech.active ? 'read aloud' : readerSpeech.paused ? 'resume reading aloud' : 'pause reading aloud');
	if (readerSpeech.active) button.dataset.active = 'true'; else delete button.dataset.active;
	$('btn-read-aloud-play').hidden = playing;
	$('btn-read-aloud-pause').hidden = !playing;
}

function readerCancelUtterance() {
	clearTimeout(readerSpeech.timer);
	readerSpeech.timer = 0;
	readerSpeech.utterance = null;
	try { speechSynthesis.cancel(); } catch (_) {}
}

function readerStopReading() {
	readerCancelUtterance();
	Object.assign(readerSpeech, {active: false, paused: false, blocks: [], position: -1, lastWordStart: 0});
	_readClearHighlight();
	readerRenderReadAloud();
}

function readerSpeechFollow(block) {
	if (!readerSpeech.follow) return;
	const box = block.getBoundingClientRect();
	if (box.top < 0 || box.bottom > innerHeight) block.scrollIntoView({block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
}

function readerSpeechFail(utterance, reason) {
	if (utterance && (readerSpeech.utterance !== utterance || !readerSpeech.active || readerSpeech.paused)) return;
	readerStopReading();
	readerToast(reason === 'no-offline-voice' ? 'Install an offline voice in text-to-speech settings.' : 'Couldn’t read aloud.', 'error');
}

const readerSpeechReadable = block => !block.hidden && !block.matches('.rapier-ink-layer,.diagram-block,.reader-open-prompt') && !!_readTextProjection(block).text.trim();
const readerSpeechBlocks = () => [...$('editor-blocks').children].filter(block => block.classList.contains('reader-part') || readerSpeechReadable(block));
function readerAdvanceReading() {
	readerSpeech.position++;
	const block = readerSpeech.blocks[readerSpeech.position];
	if (!block) { readerStopReading(); return; }
	if (block.classList.contains('reader-part')) { void readerSpeechPart(block); return; }
	readerSpeakBlock(block, 0);
}
async function readerSpeechPart(holder) {
	const parts = reader.parts, index = Number(holder.dataset.part), at = readerSpeech.position;
	const ready = parts ? await readerPartsRequest(parts, index, true) : false;
	if (!readerSpeech.active || readerSpeech.blocks[at] !== holder) return;
	const part = ready ? parts.list[index] : null, drawn = [];
	if (part?.first?.isConnected) for (let block = part.first; block; block = block.nextElementSibling) { if (readerSpeechReadable(block)) drawn.push(block); if (block === part.last) break; }
	readerSpeech.blocks.splice(at, 1, ...drawn);
	if (readerSpeech.paused) { readerSpeech.position = at; readerSpeech.lastWordStart = 0; return; }
	readerSpeech.position = at - 1;
	readerAdvanceReading();
}

const READER_SCRIPT_LANGUAGE = [['Thai', 'th'], ['Devanagari', 'hi'], ['Hebrew', 'he'], ['Arabic', 'ar'], ['Cyrillic', 'ru'], ['Greek', 'el'], ['Hiragana', 'ja'], ['Katakana', 'ja'], ['Hangul', 'ko'], ['Tamil', 'ta'], ['Khmer', 'km'], ['Myanmar', 'my'], ['Han', 'zh']].map(([name, lang]) => [new RegExp('\\p{Script=' + name + '}', 'u'), lang]);

function readerLanguageTag(value) {
	const tag = String(value || '').trim();
	if (!tag || tag.length > 128 || !/^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/i.test(tag)) return '';
	try { return Intl.getCanonicalLocales(tag)[0] || ''; }
	catch (_) { return ''; }
}

function readerAuthoredLanguage(block) {
	const own = readerLanguageTag(block.getAttribute?.('lang'));
	if (own) return own;
	const found = new Set();
	for (const element of block.querySelectorAll?.('[lang]') || []) {
		const tag = readerLanguageTag(element.getAttribute('lang'));
		if (tag) found.add(tag);
	}
	return found.size === 1 ? [...found][0] : '';
}

function readerDocumentLanguage() {
	if (reader.docKind !== 'markdown') return '';
	const settings = _rapierRenderModule('render')._rapierDocumentSettingsOf(reader.source);
	return readerLanguageTag(settings?.lang || '');
}

function readerScriptLanguage(text) {
	const counts = Object.create(null);
	for (const char of text) {
		if (!/\p{L}/u.test(char)) continue;
		for (const [pattern, lang] of READER_SCRIPT_LANGUAGE) if (pattern.test(char)) { counts[lang] = (counts[lang] || 0) + 1; break; }
	}
	if (counts.ja && counts.zh) { counts.ja += counts.zh; delete counts.zh; }
	let best = '', most = 0;
	for (const [lang, count] of Object.entries(counts)) if (count > most) { best = lang; most = count; }
	return best;
}

function readerSpeechLanguage(block, text) {
	const authored = readerAuthoredLanguage(block);
	if (authored) return authored;
	const documentLang = readerDocumentLanguage();
	const guessed = readerScriptLanguage(text);
	const primary = lang => String(lang || '').split('-')[0].toLowerCase();
	if (guessed && primary(guessed) !== primary(documentLang)) return guessed;
	if (documentLang) return documentLang;
	return $('editor-blocks').lang || document.documentElement.lang || '';
}

function readerSpeakBlock(block, from) {
	if (!block.isConnected) { readerAdvanceReading(); return; }
	const text = _readTextProjection(block).text, words = _readSegmentWords(text).filter(word => word.end > from);
	if (!words.length) { readerAdvanceReading(); return; }
	readerCancelUtterance();
	const speakFrom = words[0].start, utterance = new SpeechSynthesisUtterance(text.slice(speakFrom));
	const language = readerSpeechLanguage(block, text);
	if (language) utterance.lang = language;
	utterance.rate = 0.95;
	readerSpeech.utterance = utterance;
	const wordMs = word => Math.max(140, ((word.end - word.start + 1) / 13) * 1000);
	let paced = false;
	const show = index => {
		if (index < 0 || index >= words.length) return;
		_readHighlightRange(block, words[index].start, words[index].end);
		readerSpeech.lastWordStart = words[index].start;
		readerSpeechFollow(block);
	};
	const advance = index => {
		if (!readerSpeech.active || readerSpeech.paused) return;
		show(index);
		if (index + 1 < words.length) readerSpeech.timer = setTimeout(() => advance(index + 1), wordMs(words[index]));
	};
	const arm = index => {
		clearTimeout(readerSpeech.timer);
		if (index + 1 < words.length) readerSpeech.timer = setTimeout(() => { paced = true; advance(index + 1); }, wordMs(words[index]) * 2);
	};
	utterance.onboundary = event => {
		if (readerSpeech.utterance !== utterance || paced) return;
		let index = words.findIndex(word => word.end > speakFrom + (event.charIndex ?? 0));
		if (index === -1) index = words.length - 1;
		show(index);
		arm(index);
	};
	utterance.onend = () => {
		if (readerSpeech.utterance !== utterance || !readerSpeech.active || readerSpeech.paused) return;
		clearTimeout(readerSpeech.timer);
		_readClearHighlight();
		readerAdvanceReading();
	};
	utterance.onerror = event => readerSpeechFail(utterance, event && event.error);
	show(0);
	arm(0);
	try { speechSynthesis.speak(utterance); } catch (_) { readerSpeechFail(utterance); }
}

function readerReadAloud() {
	if (!_rapierEmbedFeatureAllowed('readAloud')) return;
	if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance !== 'function') { readerToast('This browser can’t read aloud.', 'error'); return; }
	if (readerSpeech.active) {
		if (readerSpeech.paused) {
			readerSpeech.paused = false;
			if (readerSpeech.blocks[readerSpeech.position]?.classList.contains('reader-part')) { readerSpeech.position--; readerAdvanceReading(); }
			else readerSpeakBlock(readerSpeech.blocks[readerSpeech.position], readerSpeech.lastWordStart);
		} else { readerSpeech.paused = true; readerCancelUtterance(); }
		readerRenderReadAloud();
		return;
	}
	const blocks = readerSpeechBlocks();
	if (!blocks.length) { readerToast('Nothing to read.', 'error'); return; }
	if (!readerSpeech.armed) {
		readerSpeech.armed = true;
		const release = () => { if (readerSpeech.active) readerSpeech.follow = false; };
		addEventListener('wheel', release, {passive: true});
		addEventListener('touchmove', release, {passive: true});
	}
	Object.assign(readerSpeech, {active: true, paused: false, blocks, position: -1, follow: true});
	readerRenderReadAloud();
	readerAdvanceReading();
}

function readerSeekReading(event) {
	if (!readerSpeech.active || event.target.closest('a,button,summary,.fence-copy')) return;
	const caret = document.caretRangeFromPoint ? document.caretRangeFromPoint(event.clientX, event.clientY) : null;
	let block = caret?.startContainer;
	while (block && block.parentElement !== $('editor-blocks')) block = block.parentElement;
	if (block && !readerSpeech.blocks.includes(block) && readerSpeech.blocks.some(row => !row.isConnected)) readerSpeech.blocks = readerSpeechBlocks();
	const position = block ? readerSpeech.blocks.indexOf(block) : -1;
	if (position < 0) return;
	const offset = _readOffsetForNode(block, caret.startContainer, caret.startOffset);
	if (offset == null) return;
	let start = 0;
	for (const word of _readSegmentWords(_readTextProjection(block).text)) { if (word.start <= offset) start = word.start; else break; }
	Object.assign(readerSpeech, {position, paused: false, follow: true});
	readerRenderReadAloud();
	readerSpeakBlock(block, start);
}


const readerMetadata = () => ({filename: reader.filename, docKind: reader.docKind, codeLang: reader.codeLang, bom: reader.bom});
const readerBaseName = () => reader.filename.replace(/\.[a-z0-9]+$/i, '') || 'document';
const readerPandoc = () => { try { return localStorage.getItem('rapier:export.pandocDialect') === '1'; } catch (_) { return false; } };

function readerRenderPandoc() {
	const toggle = $('copy-markdown-pandoc-toggle');
	if (!toggle) return;
	toggle.setAttribute('aria-pressed', String(readerPandoc()));
	toggle.querySelector('.export-choice-toggle__state').textContent = readerPandoc() ? 'ON' : 'OFF';
}

function readerPlainText() {
	if (reader.docKind !== 'markdown') return reader.source;
	const markdownRender = _rapierRenderModule('render-markdown'), root = markdownRender._rapierRenderSemanticRoot(reader.source, readerMetadata());
	return _rapierRenderModule('render-markdown')._rapierPortablePlainText(_rapierRenderModule('render-markdown')._rapierProjectPortableRoot(markdownRender._rapierHeldPicturesAsWords(root), {baseName: readerBaseName()}));
}

async function readerCopy(kind) {
	const markdown = reader.docKind === 'markdown', say = (ok, words) => { readerToast(ok ? words : 'Couldn’t copy. Select all and copy.', ok ? 'success' : 'error'); return ok; };
	if (kind === 'markdown') return say(await _rapierWriteTextClipboard(markdown && readerPandoc() ? _rapierPandocDialectExportText(reader.source) : reader.source), markdown ? 'copied Markdown' : 'copied source');
	if (kind === 'plain' || !markdown) return say(await _rapierWriteTextClipboard(readerPlainText()), 'copied plain text');
	const root = _rapierRenderModule('render-markdown')._rapierProjectPortableRoot(_rapierRenderModule('render-markdown')._rapierRenderSemanticRoot(reader.source, readerMetadata()), {baseName: readerBaseName()});
	let held = 0;
	for (const image of root.querySelectorAll('img[data-rapier-asset],img[data-rapier-image-url],img[src^="data:image/jxl"]')) {
		const label = String(image.getAttribute('alt') || 'image').trim() || 'image', stand = document.createElement('span');
		stand.textContent = '[image: ' + label + ']';
		image.replaceWith(stand);
		held++;
	}
	const copied = await _rapierWriteFormattedClipboard(_rapierRenderModule('render-markdown')._rapierPortableHtml(root), readerPlainText(), reader.source);
	return say(copied === true, held ? 'copied formatted, without ' + (held === 1 ? 'one picture' : held + ' pictures') : 'copied formatted document');
}

function readerDownload(blob, filename) {
	const link = document.createElement('a'), url = URL.createObjectURL(blob);
	link.href = url;
	link.download = filename;
	link.hidden = true;
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function readerShare() {
	if (!_rapierEmbedFeatureAllowed('share')) return false;
	const mime = reader.docKind === 'markdown' ? 'text/markdown' : 'text/plain', blob = new Blob([reader.bom ? '\ufeff' : '', reader.source], {type: mime}), file = new File([blob], reader.filename, {type: mime});
	try {
		if (navigator.canShare?.({files: [file]})) {
			await navigator.share({files: [file], title: reader.filename});
			readerToast('Shared ' + reader.filename, 'success');
			return true;
		}
	} catch (error) {
		if (error?.name === 'AbortError') return false;
	}
	readerDownload(blob, reader.filename);
	readerToast('Saved ' + reader.filename, 'info');
	return true;
}

function readerExportText() {
	readerDownload(new Blob([readerPlainText()], {type: 'text/plain'}), readerBaseName() + '.txt');
	return true;
}

function readerPrintPrepare() {
	readerPartsNow();
	const root = document.documentElement, body = document.body;
	if (root.dataset.rapierPrinting) return;
	const hidden = [...$('editor-blocks').children].filter(block => block.hidden), dark = !body.classList.contains('light'), scheme = root.style.colorScheme;
	for (const block of hidden) block.hidden = false;
	readerCodeAll();
	root.dataset.rapierPrinting = 'on';
	body.classList.add('light');
	root.style.colorScheme = 'light';
	addEventListener('afterprint', () => {
		delete root.dataset.rapierPrinting;
		if (dark) body.classList.remove('light');
		root.style.colorScheme = scheme;
		for (const block of hidden) block.hidden = true;
	}, {once: true});
}
async function readerPrint() {
	await readerPartsAll();
	try { print(); } catch (_) { readerToast('Printing isn’t available.', 'error'); }
}

function readerOpenSheet(overlay) {
	for (const id of ['copy-overlay', 'share-overlay']) readerCloseDialog($(id));
	readerOpenDialog(overlay, '.settings-panel');
}


let readerToastShown = null;
function readerToast(message, type = 'info', action = null) {
	readerToastShown?.();
	const root = $('toast-root');
	const toast = document.createElement('div');
	toast.className = 'toast toast--' + type;
	const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	const text = document.createElement('span');
	text.className = 'toast__msg';
	text.textContent = message;
	const close = document.createElement('button');
	close.type = 'button';
	close.className = 'toast__close';
	close.setAttribute('aria-label', 'dismiss');
	close.textContent = '×';
	toast.append(text);
	if (action) {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'toast__action';
		button.textContent = action.label;
		button.addEventListener('click', () => { remove(); action.fn(); });
		toast.append(button);
	}
	toast.append(close);
	root.append(toast);
	let timer = 0;
	const remove = () => {
		clearTimeout(timer);
		if (readerToastShown === remove) readerToastShown = null;
		const focused = toast.contains(document.activeElement);
		toast.remove();
		if (!focused) return;
		const top = readerDialogs.at(-1);
		if (opener?.isConnected && !opener.closest('[hidden],[inert]') &&
				(!top || top.panel.contains(opener)) && readerFocusHere(opener)) return;
		readerRecoverFocus();
	};
	const expire = () => {
		clearTimeout(timer);
		if (type !== 'error' && !action && !toast.contains(document.activeElement)) timer = setTimeout(remove, 4500);
	};
	toast.addEventListener('focusin', () => clearTimeout(timer));
	toast.addEventListener('focusout', expire);
	close.addEventListener('click', remove);
	readerToastShown = remove;
	srAnnounce(String(message));
	expire();
}

async function readerCommitOpen(text, filename, opening, kind) {
	const {ticket, generation} = opening;
	if (generation !== reader.generation || _rapierEmbed.active && !_rapierEmbed.fileOpen.current(ticket)) return false;
	if (!_rapierDocumentNameIsAdmissible(filename)) throw new Error('That file has an invalid or overlong name');
	const limit = _rapierEmbed.settings?.limits.documentBytes || RapierTextCodec.maxDocumentBytes;
	if (new Blob([text]).size > limit) throw new Error('That file exceeds this reader’s document limit');
	const previousBase = reader.base;
	if (opening.base !== undefined) reader.base = opening.base;
	if (ticket) ticket.committing = true;
	try { return await readerLoad(text, filename, '', kind); }
	catch (error) {
		if (opening.base !== undefined && reader.generation === generation + 1) reader.base = previousBase;
		throw error;
	} finally { if (ticket) ticket.committing = false; }
}

async function readerCarriedDocument(text, filename) {
	const start = text.indexOf('<script type="text/markdown" id="rapier-document"');
	if (start < 0 && !/\.rapier\.html$/i.test(filename)) return _rapierRenderModule('render')._rapierReadSharedDocument(text, filename);
	const open = text.indexOf('>', start), end = text.indexOf('</script>', open);
	const template = document.createElement('template');
	template.innerHTML = text;
	const carriers = template.content.querySelectorAll('#rapier-document');
	if (start < 0 || open < 0 || end < 0 || carriers.length !== 1 || carriers[0].tagName !== 'SCRIPT' ||
			carriers[0].type !== 'text/markdown' || carriers[0].textContent !== text.slice(open + 1, end))
		throw new Error('This HTML editor file has no complete editable document.');
	const carrier = carriers[0], name = carrier.getAttribute('data-name') || 'document.md';
	const kind = carrier.getAttribute('data-kind') || _classifyDocKind(name);
	if (!_rapierDocumentNameIsAdmissible(filename) || !_rapierDocumentNameIsAdmissible(name) || !['markdown', 'text', 'code'].includes(kind))
		throw new Error('This HTML editor file has invalid document metadata.');
	const source = _rapierDecodeCarried(carrier.textContent), bom = source.charCodeAt(0) === 0xFEFF;
	if (RapierTextCodec.normalizeDocument(source) !== (bom ? source.slice(1) : source))
		throw new Error('This HTML editor file has invalid source text.');
	return {source, filename: name, kind, bom};
}

async function readerOpenFile(file, opening = {generation: reader.generation}) {
	if (!file || _rapierEmbed.active && !_rapierEmbed.fileOpen.current(opening.ticket)) return false;
	if (readerPdf.decision) { const asked = readerPdf.run?.done; readerPdfDecide(false); await asked; }
	if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') return readerOpenPdf(file, opening);
	if (/\.docx$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return readerOpenWord(file, opening);
	try {
		if (/^image\//i.test(file.type) || /\.(?:png|jpe?g|webp|gif|jxl|svg)$/i.test(file.name)) {
			const limit = _rapierEmbed.settings?.limits.pictureBytes || 16 * 1024 * 1024;
			if (file.size > limit) throw new Error('That picture exceeds this reader’s picture limit');
			const bytes = new Uint8Array(await file.arrayBuffer());
			const assets = globalThis.RapierImageAssets;
			const vector = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
			const asset = await assets.createAsset(bytes, null, vector ? {codec: 'image/svg+xml'} : {});
			if (asset.byteLength > limit) throw new Error('That picture exceeds this reader’s picture limit');
			const alt = _rapierEscapeImageAlt(file.name.replace(/\.[^.]*$/, ''));
			const text = assets.appendAssetText('![' + alt + '][' + asset.label + ']', asset).source;
			return readerCommitOpen(text, 'untitled.md', opening);
		}
		const record = await readerUtf16Record(file) || await readerLegacyRecord(file), text = (record.bom ? '\ufeff' : '') + record.text;
		const carried = /\.html?$/i.test(file.name) ? await readerCarriedDocument(text, file.name) : null;
		return await readerCommitOpen(carried ? carried.source : text, carried ? carried.filename : file.name, opening, carried?.kind);
	} catch (error) {
		if (error?.code !== 'document_unshowable') (console.error(error), readerToast('Couldn’t open this file.', 'error'));
		if (opening.generation === reader.generation && (!reader.shown || reader.shown.source === reader.source && reader.shown.filename === reader.filename)) readerRenderFilename();
		return false;
	}
}

async function readerUtf16Record(file) {
	const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
	const encoding = head[0] === 0xff && head[1] === 0xfe ? 'utf-16le' : head[0] === 0xfe && head[1] === 0xff ? 'utf-16be' : '';
	if (!encoding) return null;
	if (file.size > 2 * RapierTextCodec.maxDocumentBytes) throw new Error('document is too large for Rapier (max 64 MiB)');
	let text;
	try { text = new TextDecoder(encoding, {fatal: true}).decode(await file.arrayBuffer()); }
	catch (_) { throw new Error('document is not plain UTF-16 text'); }
	return {text: RapierTextCodec.normalizeDocument(text), bom: false};
}

async function readerLegacyRecord(file) {
	try { return await RapierTextCodec.readDocumentRecord(file); }
	catch (error) {
		if (!/plain UTF-8/.test(error?.message)) throw error;
		const bytes = new Uint8Array(await file.arrayBuffer());
		if (bytes.includes(0)) throw error;
		try { new TextDecoder('utf-8', {fatal: true}).decode(bytes); throw error; }
		catch (refused) { if (refused === error) throw error; }
		return {text: RapierTextCodec.normalizeDocument(new TextDecoder('windows-1252').decode(bytes)), bom: false};
	}
}

async function readerOpenLicenses() {
	try {
		if (!$('licenses-overlay')) {
			const [{text}] = await RapierUnpack('rapier-pack-licenses');
			document.body.insertAdjacentHTML('beforeend', text);
			_rapierPopArrangeAll($('licenses-overlay'));
		}
		readerCloseDialog($('settings-overlay'));
		readerOpenDialog($('licenses-overlay'), '.licenses-panel');
	} catch (error) { (console.error(error), readerToast('Couldn’t open the licenses.', 'error')); }
}

// Settings gives way to the sheet and comes back when the licenses close.
function readerCloseLicenses() { readerCloseDialog($('licenses-overlay')); readerOpenSettings(); }

const READER_ACTIONS = {
	'settings': () => readerOpenSettings(),
	'settings-close': () => readerCloseDialog($('settings-overlay')),
	'find': () => readerFindOpen($('find-bar').hidden),
	'find-next': () => readerFindStep(1),
	'find-prev': () => readerFindStep(-1),
	'open-document': (control, event) => {
		readerCloseDialog($('settings-overlay'));
		if (_rapierEmbed.active) return _rapierEmbed.fileOpen.begin(event);
		$('file-input').click();
	},
	'switch': control => {
		const group = control.closest('[data-switch]');
		if (group) readerSetPreference(group.dataset.switch, _rapierSwitchValue(control));
	},
	'code-toggle': () => { const code = $('settings-code-controls'); code.dataset.open = String(code.dataset.open !== 'true'); readerRenderSettings(); },
	'fold': control => { const section = $(control.getAttribute('aria-controls')); if (section) { section.dataset.open = String(section.dataset.open !== 'true'); readerRenderSettings(); } },
	'navigator-close': () => readerCloseDialog($('navigator-overlay')),
	'navigator-fold': () => readerFoldAll(),
	'math-install': () => { _rapierUiMath.install(); },
	'math-dismiss': () => _rapierUiMath.dismiss(),
	'mermaid-install': () => { _rapierUiDiagram.install(); },
	'mermaid-dismiss': () => _rapierUiDiagram.dismiss(),
	'plugin-delete': control => readerAskDelete(control.dataset.plugin),
	'plugin-delete-now': () => { void readerDeleteNow(); },
	'plugin-delete-keep': () => readerCloseDialog($('plugin-delete-overlay')),
	'read-aloud': () => readerReadAloud(),
	'open-copy-menu': () => { readerRenderPandoc(); readerOpenSheet($('copy-overlay')); },
	'copy-choice': control => { void readerCopy(control.dataset.value).then(ok => { if (ok) readerCloseDialog($('copy-overlay')); }); },
	'close-copy': () => readerCloseDialog($('copy-overlay')),
	'toggle-pandoc-dialect': () => { try { if (readerPandoc()) localStorage.removeItem('rapier:export.pandocDialect'); else localStorage.setItem('rapier:export.pandocDialect', '1'); } catch (_) {} readerRenderPandoc(); },
	'open-share-menu': () => readerOpenSheet($('share-overlay')),
	'share-choice': () => { void readerShare().then(ok => { if (ok) readerCloseDialog($('share-overlay')); }); },
	'close-share': () => readerCloseDialog($('share-overlay')),
	'export-txt': () => { readerExportText(); },
	'export-pdf': () => { readerCloseDialog($('settings-overlay')); setTimeout(readerPrint, 60); },
	'pdf-open-install': () => { readerCloseDialog($('settings-overlay')); void readerInstallPdf(); },
	'pdf-install': () => readerPdfDecide(true),
	'pdf-dismiss': () => { if (readerPdf.run) readerPdf.run.controller.abort(); readerPdfDecide(false); },
	'privacy': () => { readerCloseDialog($('settings-overlay')); readerOpenDialog($('privacy-overlay'), '.privacy-panel'); },
	'privacy-close': () => readerCloseDialog($('privacy-overlay')),
	'licenses': () => { void readerOpenLicenses(); },
	'licenses-close': () => readerCloseLicenses(),
};

function readerBind() {
	$('editor-blocks').setAttribute('aria-label', 'document');
	$('find-count').setAttribute('role', 'status');
	$('find-count').setAttribute('aria-live', 'polite');
	$('find-count').setAttribute('aria-atomic', 'true');
	document.addEventListener('click', event => {
		const target = event.target instanceof Element ? event.target : null;
		if (!target) return;
		const copy = target.closest('.fence-copy');
		if (copy) { void readerCopyFence(copy); return; }
		const fold = target.closest('.section-fold-btn');
		if (fold) { readerToggleFold(fold.parentElement); return; }
		const allow = target.closest('[data-rapier-remote-allow]');
		if (allow) { _rapierRemoteContent.allowed = true; void readerRenderDocument(); return; }
		const control = target.closest('[data-action]');
		if (control && READER_ACTIONS[control.dataset.action]) { READER_ACTIONS[control.dataset.action](control, event); return; }
		if (target.classList.contains('settings-overlay') && readerDialogs.at(-1)?.overlay === target) { readerCloseTop(); return; }
		const link = target.closest('#editor-blocks a[href]');
		if (!link) return;
		const href = link.getAttribute('href') || '';
		if (href.startsWith('#')) {
			event.preventDefault();
			let id = href.slice(1);
			try { id = decodeURIComponent(id); } catch (_) {}
			const element = id && $('editor-blocks').querySelector('[id="' + CSS.escape(id) + '"]');
			if (element) readerScrollTo(element);
			else if (id && readerPartsPending() && reader.parts.notes && link.closest('sup.footnote-ref')) {
				const parts = reader.parts;
				void readerPartsRequest(parts, parts.list.length - 1, true).then(() => { const late = $('editor-blocks').querySelector('[id="' + CSS.escape(id) + '"]'); if (late) readerScrollTo(late); });
			} else if (id && readerPartsPending()) void readerPartsAll().then(() => { const late = $('editor-blocks').querySelector('[id="' + CSS.escape(id) + '"]') || $('editor-blocks').querySelector('[id="' + CSS.escape(_rapierRenderModule('render')._rapierPortableAnchorId(readerAnchorBase(), id)) + '"]'); if (late) readerScrollTo(late); });
		} else {
			event.preventDefault();
			if (!/^(?:https?|mailto):/i.test(href)) return;
			const open = () => window.open(href, '_blank', 'noopener,noreferrer');
			const odd = _rapierRenderModule('render-sanitize')._rapierLinkDestinationToConfirm(href, link.textContent);
			if (odd) readerToast('Link goes to ' + odd, 'info', {label: 'Open', fn: open});
			else open();
		}
	});
	$('editor-blocks').addEventListener('error', event => { if (event.target.tagName === 'IMG' && event.target.isConnected) readerMissingPicture(event.target); }, true);
	$('editor-blocks').addEventListener('click', readerSeekReading);
	RapierPreferences.subscribe('fontSize', () => { readerApplyView(); readerRenderSettings(); });
	_rapierPinchInstall();
	{
		let noting = 0, keeping = 0;
		$('editor-blocks').addEventListener('scroll', () => { clearTimeout(noting); noting = setTimeout(readerPlaceNote, 120); }, {passive: true});
		addEventListener('resize', () => { reader.placeHold = performance.now() + 500; clearTimeout(keeping); keeping = setTimeout(readerPlaceKeep, 100); });
	}
	for (const name of ['wheel', 'touchstart', 'pointerdown']) $('editor-blocks').addEventListener(name, () => { if (reader.parts) reader.parts.pinEnd = false; }, {passive: true});
	$('editor-blocks').addEventListener('scroll', readerOverflowScrolled, {capture: true, passive: true});
	$('file-input').addEventListener('change', event => { const [file] = event.target.files; event.target.value = ''; void readerOpenFile(file, {generation: reader.generation, base: ''}); });
	$('find-input').addEventListener('input', () => readerFindRun());
	$('find-input').addEventListener('keydown', event => {
		if (event.key === 'Enter') { event.preventDefault(); readerFindStep(event.shiftKey ? -1 : 1); }
		else if (event.key === 'Escape') { event.preventDefault(); readerFindOpen(false); }
	});
	$('navigator-outline-filter').addEventListener('input', event => readerOutlineFilter(event.target.value));
	addEventListener('keydown', event => {
		if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing && readerEscape()) { event.preventDefault(); return; }
		if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f' && !readerDialogs.length) { event.preventDefault(); readerFindOpen(true); }
		else readerPageKeys(event);
	});
	addEventListener('hashchange', () => { if (/^#src=/.test(location.hash)) void readerOpenFromHash(); else readerFragment(); });
	addEventListener('beforeprint', readerPrintPrepare);
	addEventListener('dragover', event => {
		if (_rapierEmbed.active || !Array.from(event.dataTransfer?.types || []).includes('Files')) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'copy';
	});
	addEventListener('drop', event => {
		const file = event.dataTransfer?.files?.[0];
		if (_rapierEmbed.active || !file) return;
		event.preventDefault();
		void readerOpenFile(file, {generation: reader.generation, base: ''});
	});
	matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => readerApplyView());
	for (const key of ['math', 'mermaid']) addEventListener('rapier:' + key + 'plugin', event => (key === 'math' ? _rapierUiMath : _rapierUiDiagram).apply(event.detail || {}));
	for (const [key, view] of [['math', _rapierUiMath], ['mermaid', _rapierUiDiagram]]) if (_rapierProviders[key]) { view.status = _rapierProviders[key].status || 'checking'; view.error = _rapierProviders[key].error || null; }
}

async function readerOpenFromHash() {
	if (_rapierEmbed.active) return;
	const query = new URLSearchParams(location.search), asked = query.get('src') ?? query.get('url');
	const match = /^#src=(.+)$/.exec(location.hash) || (asked ? [null, encodeURIComponent(asked)] : null);
	if (!match) return;
	const say = words => readerToast(words, 'error');
	let url;
	try { url = new URL(decodeURIComponent(match[1]), location.href); } catch (_) { say('the document address in the link is not valid'); return; }
	if (location.origin === 'null' || url.origin !== location.origin) { say('only a document on this page’s own address opens from a link'); return; }
	try {
		const response = await fetch(url.href, {credentials: 'omit', referrerPolicy: 'no-referrer'});
		if (!response.ok) { say('the document could not be fetched (' + response.status + ')'); return; }
		const name = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '') || 'document.md';
		await readerOpenFile(new File([await response.blob()], name, {type: response.headers.get('content-type') || ''}), {generation: reader.generation, base: url.href});
	} catch (error) { say('the document could not be fetched'); }
}

function readerStart() {
	for (const box of document.querySelectorAll('.rapier-pop [data-pop="cancel"][data-action$="dismiss"]')) box.dataset.pop = 'affirm';
	readerStampSwatches();
	_rapierPopArrangeAll(document);
	readerApplyView();
	readerBind();
	readerBindFab();
	readerInstallSheetGesture();
	readerRenderFilename();
	readerRenderSettings();
	readerRenderEmpty();
	readerRenderReadAloud();
	$('settings-share-btn').hidden = !_rapierEmbedFeatureAllowed('share');
	$('rapier-first-screen')?.classList.add('rapier-first-ready');
	_rapierEmbedStart();
	void readerOpenFromHash();
}

readerStart();
