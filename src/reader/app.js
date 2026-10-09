// SPDX-License-Identifier: AGPL-3.0-only
// The reader. It opens one document, shows it as Rapier's pages show it, and offers find, headings, fast scroll and the
// settings that apply to reading. Nothing here edits. Classic script fragment: it shares one scope with host.js, embed.js, the
// renderer's parts and the editor code the build links in (tools/reader-build.mjs).

const {PREFERENCE_ACCENTS, PREFERENCE_DEFINITIONS} = globalThis.RapierPreferenceDefinitions;
const $ = id => document.getElementById(id);
// The plug-in files (tools/reader-plugins.mjs) check and keep their downloads with the page's own helper.
globalThis.RapierBundleIO = RapierBundleIO;
const READER_VERSION = document.querySelector('meta[name="rapier-version"]')?.content || '';

const reader = {
	source: '', filename: 'untitled.md', docKind: 'markdown', codeLang: '', title: '',
	loaded: false, generation: 0, render: 0, flowchartTried: -1, layout: null, hostTheme: '', hostAccent: '',
	// Folded headings (elements), and the remote content the person allowed for this document.
	folded: new Set(), allowedRemote: false,
	find: {ranges: [], current: 0, overflow: false},
};

// ── View settings. Each is a stored preference (shell/preferences.mjs); a host's theme or accent stands in until the person chooses.

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
	root.dataset.highlights = readerPreference('highlights');
	if (root.dataset.rapierHostAccent !== String(!!accent)) root.dataset.rapierHostAccent = String(!!accent);
	readerAccentOwner();
}

// A host that sets --rapier-accent owns the accent: Settings then offers no swatches to pick against it.
function readerAccentOwner() {
	const owned = getComputedStyle(document.documentElement).getPropertyValue('--rapier-accent').trim() !== '';
	document.documentElement.classList.toggle('rapier-host-accent', owned);
}

// ── The document.

// Opens `source` as the document. Resolves when it is on the page; false when a newer document replaced it first.
async function readerLoad(source, filename, title) {
	const generation = ++reader.generation;
	reader.source = source;
	reader.filename = filename || 'untitled.md';
	reader.title = title || '';
	reader.docKind = _classifyDocKind(reader.filename);
	reader.codeLang = reader.docKind === 'code' ? _langForExt(reader.filename) : '';
	reader.folded.clear();
	reader.allowedRemote = false;
	_rapierRemoteContent.allowed = false;
	const shown = await readerRenderDocument();
	if (generation !== reader.generation) return false;
	reader.loaded = true;
	readerRenderFilename();
	readerRenderEmpty();
	readerRenderSettings();
	if (shown) $('editor-blocks').scrollTop = 0;
	readerFindRun();
	readerPublishState();
	return true;
}

// The page the exported file carries, built by the same renderer: Markdown to a checked semantic tree, diagrams drawn, then the
// styled projection and the picture layout.
async function readerRenderDocument() {
	const generation = ++reader.render;
	const host = $('editor-blocks');
	if (readerSpeech.active) readerStopReading();
	const metadata = {filename: reader.filename, docKind: reader.docKind, codeLang: reader.codeLang, bom: false};
	// A document with a flowchart waits for the flowchart plug-in, so the fence is drawn as the editor draws it (the renderer asks the plug-in
	// when it reads the fence).
	if (reader.docKind === 'markdown' && READER_FLOWCHART.test(reader.source)) await readerFlowchart();
	if (generation !== reader.render) return false;
	readerParser();
	const markdown = _rapierRenderModule('render-markdown'), renderer = _rapierRenderModule('render');
	let styled = null;
	try {
		const semantic = markdown._rapierRenderSemanticRoot(reader.source, metadata);
		if (_rapierPlainLayout()) _rapierStripPlainLayoutFacts(semantic);
		for (const diagram of semantic.querySelectorAll('.diagram-block[data-diagram-src]')) await _rapierFillDiagram(diagram, true);
		if (generation !== reader.render) return false;
		styled = renderer._rapierProjectStyledRoot(semantic, {metadata, print: false, sourceCode: false, baseName: reader.filename.replace(/\.[^.]*$/, '') || 'document'});
		renderer._rapierAnnotateExportBoxPolygons(styled);
	} catch (error) {
		try { console.error('[rapier-reader] could not show the document', error); } catch (_) {}
		readerToast('this document could not be shown', 'error');
		return false;
	}
	if (generation !== reader.render) return false;
	reader.layout?.destroy();
	reader.layout = null;
	host.replaceChildren(...styled.childNodes);
	for (const input of host.querySelectorAll('input[type="checkbox"]')) { input.disabled = true; input.removeAttribute('title'); }
	for (const link of host.querySelectorAll('a[href]')) if (/^https?:/i.test(link.getAttribute('href'))) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
	readerDocumentStyle();
	readerShapeOverflow(host);
	readerFoldControls();
	if (!_rapierPlainLayout()) {
		const wraps = [...host.querySelectorAll('p[data-md-layout]')].some(element => ['around', 'box', 'behind', 'front'].includes(globalThis.RapierMarkdownLayout.parseLayoutAttribute(element.getAttribute('data-md-layout'))?.wrap)) ||
			[...host.querySelectorAll('img[data-rapier-image-layout]')].some(image => globalThis.RapierMarkdownLayout.parseLayoutAttribute(image.getAttribute('data-rapier-image-layout'))?.rotate);
		if (wraps) reader.layout = renderer._rapierProjectArtifactLayout(host, modules['spec/md-layout.mjs'], modules['layout/model.mjs'], modules['agent/vendor/pretext/rich-inline.js']);
	}
	readerFindRun(true);
	return true;
}

// The native flowchart is a plug-in: the copy this device holds, or the file fetched once from its pinned address (or the host's `plugins`
// directory). A document is tried once; where the plug-in cannot be had, its flowcharts are drawn as any other Mermaid diagram is.
const READER_FLOWCHART = /^ {0,3}(?:`{3,}|~{3,})[ \t]*mermaid[^\n]*\n(?:[ \t]*(?:%%[^\n]*)?\n)*[ \t]*(?:flowchart|graph)\b/im;
async function readerFlowchart() {
	const plugin = _rapierProviders.flowchart;
	if (!plugin || plugin.status === 'ready' || reader.flowchartTried === reader.generation) return;
	reader.flowchartTried = reader.generation;
	try { await plugin.install(); } catch (_) { /* the fence falls back to the diagram plug-in */ }
}

// The document's own page settings (its front matter: title, face, size) as the exported page carries them.
function readerDocumentStyle() {
	let sheet = $('rapier-document-style');
	if (!sheet) {
		sheet = document.createElement('style');
		sheet.id = 'rapier-document-style';
		document.head.append(sheet);
	}
	const renderer = _rapierRenderModule('render');
	sheet.textContent = reader.docKind === 'markdown' ? renderer._rapierDocumentSettingsCss(renderer._rapierDocumentSettingsOf(reader.source)) : '';
}

function readerRenderFilename() {
	const name = reader.filename, dot = name.lastIndexOf('.'), embedded = _rapierEmbed.active, shown = embedded ? reader.title || name : dot > 0 ? name.slice(0, dot) : name;
	$('filename-btn').textContent = shown;
	$('filename-ext-text').textContent = dot > 0 ? name.slice(dot + 1).toUpperCase() : '';
	$('filename-ext-btn').hidden = embedded || dot <= 0;
	// The document's own title, when its front matter has one; otherwise the name it is shown by.
	const settings = reader.docKind === 'markdown' ? _rapierRenderModule('render')._rapierDocumentSettingsOf(reader.source) : null;
	document.title = settings && settings.title ? globalThis.RapierMarkdownSpec.documentTitle(settings) + ' \u2014 Rapier' : 'Rapier \u2014 ' + (embedded ? shown : name);
}

// An empty page offers Open, the picker a person could use anywhere else.
function readerRenderEmpty() {
	const host = $('editor-blocks');
	let prompt = $('empty-doc-prompt');
	if (reader.loaded || _rapierEmbed.active) { prompt?.remove(); return; }
	if (prompt) return;
	prompt = document.createElement('div');
	prompt.id = 'empty-doc-prompt';
	prompt.className = 'empty-doc-prompt visible';
	const open = document.createElement('button');
	open.type = 'button';
	open.className = 'settings-action-btn';
	open.dataset.action = 'open-document';
	open.textContent = 'open a markdown file';
	prompt.append(open);
	host.append(prompt);
}

// Code, tables, diagrams and display maths that run wider than the column scroll on their own; a shell round each carries the fade at the edge
// they run on past, and a fence its copy control, as in the editor.
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
		for (const [key, value] of [['class', 'fence-copy__' + name], ['viewBox', '0 0 24 24'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['aria-hidden', 'true']]) node.setAttribute(key, value);
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
	control.append(svg('copy', use), svg('done', check));
	return control;
}

async function readerCopyFence(button) {
	const code = button.parentElement.querySelector('pre > code');
	if (!code) return;
	try { await navigator.clipboard.writeText((code.textContent || '').replace(/\n$/, '')); } catch (_) { readerToast('could not copy', 'error'); return; }
	button.setAttribute('data-copied', '');
	clearTimeout(button._copied);
	button._copied = setTimeout(() => button.removeAttribute('data-copied'), 1500);
}

function readerShapeOverflow(host) {
	readerOverflow.disconnect();
	for (const surface of host.querySelectorAll('.table-scroll-wrap, pre, .math-display-wrap, .diagram-block')) {
		if (surface.closest('.rapier-hscroll') || surface.tagName === 'PRE' && surface.closest('.diagram-block')) continue;
		const kind = surface.classList.contains('table-scroll-wrap') ? 'table' : surface.classList.contains('math-display-wrap') ? 'math' : surface.classList.contains('diagram-block') ? 'diagram' : 'code';
		const shell = document.createElement(kind === 'math' ? 'span' : 'div');
		shell.className = 'rapier-hscroll rapier-hscroll--' + kind;
		surface.parentNode.insertBefore(shell, surface);
		shell.append(surface);
		surface.classList.add('rapier-hscroll__surface');
		// A fence that stands on its own in the page offers its code.
		if (kind === 'code' && shell.parentElement === host && surface.querySelector(':scope > code')) shell.append(readerFenceControl());
		surface.addEventListener('scroll', () => requestAnimationFrame(() => readerUpdateOverflow(shell)), {passive: true});
	}
	for (const shell of host.querySelectorAll('.rapier-hscroll')) { readerOverflow.observe(shell); readerUpdateOverflow(shell); }
}

// ── Heading sections. A control at the heading's end folds the blocks up to the next heading of its level or above.

const READER_HEADINGS = 'h1,h2,h3,h4,h5,h6';
function readerHeadings() { return [...$('editor-blocks').querySelectorAll(':scope > ' + READER_HEADINGS.replaceAll(',', ',:scope > '))]; }
const readerLevel = heading => Number(heading.tagName.slice(1));

function readerFoldControls() {
	const headings = readerHeadings();
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
	readerApplyFolds();
}

// The headings setting decides the folds: collapsed folds every section, expanded and off open them all.
function readerResetFolds() {
	reader.folded.clear();
	if (readerPreference('headings') === 'collapsed') for (const heading of readerHeadings()) if (heading.querySelector(':scope > .section-fold-btn')) reader.folded.add(heading);
	readerApplyFolds();
	readerFindRun(true);
}

// What each fold hides: every block after a folded heading, up to the next heading of its level or above.
function readerApplyFolds() {
	readerQuietFab();
	const host = $('editor-blocks'), folded = [];
	for (const block of host.children) {
		if (/^H[1-6]$/.test(block.tagName)) {
			const level = readerLevel(block);
			while (folded.length && level <= folded.at(-1).level) folded.pop();
			const isFolded = reader.folded.has(block) && !!block.querySelector(':scope > .section-fold-btn');
			block.dataset.folded = String(isFolded);
			const button = block.querySelector(':scope > .section-fold-btn');
			if (button) {
				const title = (block.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100) || 'untitled heading';
				button.setAttribute('aria-expanded', String(!isFolded));
				button.setAttribute('aria-label', (isFolded ? 'expand section: ' : 'collapse section: ') + title);
			}
			block.hidden = folded.length > 0;
			if (isFolded) folded.push({level});
		} else block.hidden = folded.length > 0 && !block.matches('.rapier-ink-layer');
	}
}

function readerToggleFold(heading) {
	if (reader.folded.has(heading)) reader.folded.delete(heading); else reader.folded.add(heading);
	readerApplyFolds();
	readerFindRun(true);
}

// A target inside a folded section opens the sections that hide it.
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

function readerScrollTo(element) {
	readerReveal(element);
	for (let details = element.closest('details:not([open])'); details; details = details.parentElement?.closest('details:not([open])')) details.open = true;
	element.scrollIntoView({block: 'start'});
}

// ── Headings sheet and the fast-scroll circle.

function readerOutline() {
	const root = $('navigator-outline');
	root.textContent = '';
	root.dataset.outlineNoun = 'headings';
	const headings = readerHeadings(), host = $('editor-blocks');
	if (!headings.length) {
		const note = document.createElement('p');
		note.className = 'navigator-empty';
		note.textContent = 'no headings in this document';
		root.append(note);
		$('navigator-status').textContent = note.textContent;
		return;
	}
	let current = 0;
	headings.forEach((heading, index) => { if (!heading.hidden && heading.offsetTop <= host.scrollTop + 72) current = index; });
	headings.forEach((heading, index) => {
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'navigator-outline__item';
		button.style.setProperty('--outline-level', String(readerLevel(heading)));
		const label = (heading.textContent || '').trim().replace(/\s+/g, ' ') || 'untitled heading';
		button.textContent = label;
		button.dataset.outlineText = label;
		button.dataset.current = String(index === current);
		if (index === current) button.setAttribute('aria-current', 'location');
		button.addEventListener('click', () => { readerCloseDialog($('navigator-overlay')); readerScrollTo(heading); });
		root.append(button);
	});
	$('navigator-outline-filter').value = '';
	readerOutlineFilter('');
	const folds = $('navigator-fold');
	folds.hidden = !headings.some(heading => heading.querySelector(':scope > .section-fold-btn'));
	readerRenderFoldAll();
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

// The circle rides the page's edge by scroll position, wakes while the page moves and sleeps after a short dwell. Dragging it
// seeks the page and names the heading under it; a tap opens the headings.
let readerFabQuiet = 0;
function readerBindFab() {
	const fab = $('scroll-fab'), label = $('scroll-fab-label'), host = $('editor-blocks'), bar = document.querySelector('.top-bar');
	if (!fab) return;
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
	// The heading at each point of the page, as a fraction of its length.
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
// A fold changes the page's length, not the reader's place: the circle stays down for half a second, as in the editor.
function readerQuietFab() { readerFabQuiet = performance.now() + 500; $('scroll-fab')?.classList.remove('visible'); }

function readerOpenOutline() { readerOutline(); readerOpenDialog($('navigator-overlay'), '.navigator-panel'); }

// ── Find. Matches are ranges over the page's text, painted by the highlight registry; the count is the editor's own control.

const READER_FIND_LIMIT = 2048;
function readerSetFindCount(current, total) {
	const count = $('find-count');
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
	bar.hidden = !open;
	button.toggleAttribute('data-active', open);
	button.setAttribute('aria-expanded', String(open));
	if (open) { $('find-input').focus(); $('find-input').select(); readerFindRun(); }
	else { readerFindClear(); $('find-input').blur(); }
}

function readerFindClear() {
	reader.find = {ranges: [], current: 0, overflow: false};
	if (CSS.highlights) { CSS.highlights.delete('rapier-find-all'); CSS.highlights.delete('rapier-find-current'); }
}

// A search for the words as typed, then, when nothing matches, with any run of spaces, dots, dashes and slashes between them.
function readerFindRun(keep) {
	const input = $('find-input'), query = input.value, previous = reader.find.current;
	readerFindClear();
	readerSetFindCount(0, 0);
	if (!query || $('find-bar').hidden) return;
	const host = $('editor-blocks'), nodes = [];
	let text = '';
	const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {acceptNode: node => node.parentElement?.closest('script,style,.diagram-cache[hidden],[hidden],.section-fold-btn,.rapier-ink-layer') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT});
	for (let node; (node = walker.nextNode());) { nodes.push({node, start: text.length}); text += node.data; }
	const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
	reader.find.ranges = found.map(([start, end]) => {
		const from = where(start), to = where(end - 1), range = new Range();
		range.setStart(from.node, start - from.start);
		range.setEnd(to.node, end - to.start);
		return range;
	});
	reader.find.current = keep ? Math.min(previous, Math.max(0, reader.find.ranges.length - 1)) : 0;
	readerFindPaint(!keep);
}

function readerFindPaint(reveal) {
	const {ranges, current} = reader.find;
	readerSetFindCount(ranges.length ? current + 1 : 0, ranges.length + (reader.find.overflow ? '+' : ''));
	if (!ranges.length || !CSS.highlights) return;
	CSS.highlights.set('rapier-find-all', new Highlight(...ranges));
	CSS.highlights.set('rapier-find-current', new Highlight(ranges[current]));
	if (reveal) readerFindReveal(ranges[current]);
}

function readerFindReveal(range) {
	const node = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
	readerReveal(node);
	for (let details = node?.closest('details:not([open])'); details; details = details.parentElement?.closest('details:not([open])')) details.open = true;
	const host = $('editor-blocks'), box = range.getBoundingClientRect(), view = host.getBoundingClientRect();
	if (box.width || box.height) host.scrollTop = Math.max(0, host.scrollTop + box.top - view.top - Math.max(0, (host.clientHeight - Math.min(box.height, host.clientHeight)) / 2));
}

function readerFindStep(direction) {
	const {ranges} = reader.find;
	if (!ranges.length) { readerFindRun(); return; }
	reader.find.current = (reader.find.current + direction + ranges.length) % ranges.length;
	readerFindPaint(true);
}

// ── Settings and sheets.

const readerDialogs = [];
function readerDialogIsOpen(overlay) { return overlay.classList.contains('open'); }
// The page behind an open sheet takes no focus or touch.
function readerIsolate(overlay) {
	const held = [...document.body.children].filter(element => element !== overlay && !element.contains(overlay) && !element.inert && element.tagName !== 'SCRIPT' && !element.classList.contains('settings-overlay') && element.id !== 'toast-root');
	held.forEach(element => { element.inert = true; });
	return () => held.forEach(element => { element.inert = false; });
}

function readerOpenDialog(overlay, panelSelector) {
	if (readerDialogs.some(row => row.overlay === overlay)) return;
	_rapierUiRaise(overlay);
	const panel = overlay.querySelector(panelSelector || '.settings-panel') || overlay;
	const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	const restore = readerIsolate(overlay);
	const trap = event => _rapierTrapModalTab(event, panel);
	overlay.addEventListener('keydown', trap);
	readerDialogs.push({overlay, panel, opener, restore, trap});
	setTimeout(() => {
		if (readerDialogs.at(-1)?.overlay !== overlay) return;
		const wanted = panel.querySelector('[autofocus]') || _rapierModalFocusables(panel)[0];
		if (wanted) { wanted.focus({preventScroll: true}); return; }
		panel.setAttribute('tabindex', '-1');
		panel.focus({preventScroll: true});
	}, 15);
}

function readerCloseDialog(overlay) {
	const at = readerDialogs.findIndex(row => row.overlay === overlay);
	if (at < 0) return;
	const [row] = readerDialogs.splice(at, 1);
	overlay.removeEventListener('keydown', row.trap);
	row.restore();
	_rapierUiLower(overlay);
	if (row.opener?.isConnected) try { row.opener.focus({preventScroll: true}); } catch (_) {}
}

function readerCloseTop() {
	const top = readerDialogs.at(-1);
	if (!top) return false;
	if (top.overlay === $('math-plugin-overlay')) _rapierUiMath.dismiss();
	else if (top.overlay === $('mermaid-plugin-overlay')) _rapierUiDiagram.dismiss();
	else if (top.overlay === $('licenses-overlay')) readerCloseLicenses();
	else if (top.overlay === $('pdf-plugin-overlay')) readerPdfDecide(false);
	else readerCloseDialog(top.overlay);
	return true;
}

// Escape as the editor takes it (_rapierUiEscape): every sheet that asks nothing (settings, copy, share, the outline) closes at once, then the
// one on top, when it is a question Escape may answer (licences, privacy, deleting a plug-in). A plug-in prompt is answered with its own buttons.
function readerEscape() {
	const open = id => readerDialogs.some(row => row.overlay.id === id);
	const top = ['math-plugin-overlay', 'mermaid-plugin-overlay', 'pdf-plugin-overlay', 'plugin-delete-overlay', 'copy-overlay', 'share-overlay', 'licenses-overlay', 'privacy-overlay', 'navigator-overlay', 'settings-overlay'].find(open);
	if (!top) return false;
	let closed = false;
	for (const id of ['copy-overlay', 'share-overlay', 'navigator-overlay', 'settings-overlay']) if (open(id)) { readerCloseDialog($(id)); closed = true; }
	if (top === 'licenses-overlay') { readerCloseLicenses(); closed = true; }
	else if (top === 'privacy-overlay' || top === 'plugin-delete-overlay') { readerCloseDialog($(top)); closed = true; }
	return closed;
}

// Words, characters and lines as the editor counts them: the writing, not a picture's encoded bytes or its layout marker.
function readerStats() {
	const text = reader.source;
	if (reader.docKind !== 'markdown') { const trimmed = text.trim(); return {words: trimmed ? trimmed.split(/\s+/).length : 0, chars: text.length, lines: text.split('\n').length}; }
	// As the editor counts: the front matter and the blank lines between blocks are characters; a picture's encoded bytes and a layout
	// marker are not.
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
	$('settings-panel-title').textContent = 'rapier V' + READER_VERSION;
	const stats = readerStats();
	$('stat-words').textContent = String(stats.words);
	$('stat-chars').textContent = String(stats.chars);
	$('stat-lines').textContent = String(stats.lines);
	for (const field of ['theme', 'fontSize', 'showPlayButton', 'highlights', 'headings', 'layout', 'accent']) {
		const group = $(({theme: 'switch-theme', fontSize: 'switch-font-size', showPlayButton: 'switch-read-aloud', highlights: 'switch-highlights', headings: 'switch-headings', layout: 'switch-layout', accent: 'accent-swatches'})[field]);
		renderSwitch(group, field === 'theme' && reader.hostTheme ? reader.hostTheme : readerPreference(field));
	}
	const code = $('settings-code-controls'), open = code.dataset.open === 'true';
	code.inert = !open;
	for (const button of $('settings-code-title').querySelectorAll('[data-action="code-toggle"]')) button.setAttribute('aria-expanded', String(open));
	readerRenderPdfRow();
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

// ── Plug-ins. Math and diagrams download once, on the person's say, and the page is drawn again when one arrives.

function readerPlugin(key, label, noun) {
	const view = {
		status: 'checking', error: null, dismissed: false,
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
			this.render();
			readerOpenDialog($(key + '-plugin-overlay'));
		},
		install() { _rapierProviders[key]?.[this.status === 'error' ? 'reinstall' : 'install']().catch(() => {}); },
		dismiss() { this.dismissed = true; readerCloseDialog($(key + '-plugin-overlay')); },
		buttonLabel() {
			if (this.installed()) return label + ' INSTALLED';
			if (this.status === 'downloading') return 'DOWNLOADING ' + label + '…';
			if (this.status === 'installing') return 'INSTALLING ' + label + '…';
			if (this.status === 'error') return 'INSTALL ' + label + ' (RETRY)';
			return 'INSTALL ' + label;
		},
		render() {
			const status = this.status, name = noun[0].toUpperCase() + noun.slice(1);
			$(key + '-plugin-title').textContent = status === 'downloading' ? name + ' plug-in downloading' : status === 'installing' ? name + ' plug-in installing' : status === 'error' ? name + ' plug-in unavailable' : 'Install ' + noun + ' plug-in?';
			$(key + '-plugin-body').textContent = status === 'error' ? 'Rapier could not reach or verify the ' + noun + ' renderer. Check your internet connection and tap retry.' : '• Shows the ' + (key === 'math' ? 'math' : 'diagrams') + ' in this document.\n• ' + (key === 'math' ? '1.8 MB, once.' : 'Downloads once.') + '\n• Works offline.';
			$(key + '-plugin-body').style.whiteSpace = 'pre-line';
			$(key + '-plugin-progress').hidden = !this.busy();
			$(key + '-plugin-progress').textContent = status === 'downloading' ? 'Downloading the ' + noun + ' renderer…' : 'Installing the renderer…';
			$(key + '-plugin-error').hidden = status !== 'error';
			$(key + '-plugin-error').textContent = 'Last attempt failed: ' + (this.error || 'unknown error');
			$(key + '-plugin-install').disabled = this.busy();
			$(key + '-plugin-install').textContent = status === 'downloading' ? 'downloading…' : status === 'installing' ? 'installing…' : 'install now';
		},
	};
	return view;
}
const _rapierUiMath = readerPlugin('math', 'MATH', 'math');
const _rapierUiDiagram = readerPlugin('mermaid', 'MERMAID', 'diagram');

// A plug-in held on this device may be removed from its row, in the plug-in prompt's own shape.
let readerDeleting = '';
const READER_PLUGIN_WORDS = {
	math: ['the MathJax renderer', 'Math shows as its TeX source until you install it again.'],
	mermaid: ['the Mermaid renderer', 'Diagrams that need this plug-in show their source until you install it again.'],
	pdf: ['the PDF reader', 'PDF files cannot be opened until you install it again.'],
};
// What the row holds: the loader's provider, or for the PDF reader the plug-in it carries.
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
		await held.forget();
		if (key === 'math') _rapierUiMath.dismissed = true; else if (key === 'mermaid') _rapierUiDiagram.dismissed = true;
		readerCloseDialog($('plugin-delete-overlay'));
		if (reader.loaded && key !== 'pdf') void readerRenderDocument();
	} catch (error) {
		$('plugin-delete-error').textContent = 'Not deleted: ' + String(error?.message || error);
		$('plugin-delete-error').hidden = false;
	} finally { now.disabled = false; now.textContent = 'delete'; readerRenderSettings(); }
}

// ── The PDF reader. A PDF opens as a Markdown document: its text layer, or, when it has none, each page as a picture. The plug-in is two
// downloads, both on the person's say: the part that reads pages (small, fetched by the first PDF opened) and the pdf.js files it holds
// (large, offered in the prompt, kept on this device).
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

// The prompt before the large download, in the diagram prompt's shape. Resolves true to download, false for not now.
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

// Brings the plug-in to the point of reading: its page reader, then its pdf.js files. False when the person declines.
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

async function readerWithImport(work, what) {
	if (readerPdf.run) { readerToast('Another PDF is still being read', 'info'); return false; }
	const run = readerPdf.run = {controller: new AbortController()};
	readerRenderPdfRow();
	try { return await work(run); }
	catch (error) { if (error?.name !== 'AbortError') readerToast(what + ': ' + String(error?.message || error), 'error'); return false; }
	finally {
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

// ── The Word reader. A .docx opens as a Markdown document. The plug-in is one file, fetched by the first Word document opened.
function readerOpenWord(file) {
	return readerWithImport(async run => {
		const part = _rapierProviders.docx;
		if (!part) throw new Error('the Word reader is unavailable');
		readerPdfProgress(part.status === 'ready' ? 'Reading Word document…' : 'Downloading the Word reader…');
		if (part.status !== 'ready') await (part.status === 'error' ? part.reinstall() : part.install());
		readerPdfProgress('Reading Word document…');
		const result = await globalThis.RapierDocxReader.read(file, {signal: run.controller.signal});
		const name = file.name.replace(/\.docx$/i, '').replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, 180) || 'document';
		await readerLoad(readerDocumentText(result.markdown), name + '.md');
		readerToast('Word document opened' + (result.warnings[0] ? ' · ' + (typeof result.warnings[0] === 'string' ? result.warnings[0] : result.warnings[0].message) : ''), 'info');
		return true;
	}, 'Word reader');
}

function readerOpenPdf(file) {
	return readerWithImport(async run => {
		if (!await readerEnsurePdf(run.controller.signal, readerPdfProgress)) return false;
		const options = {signal: run.controller.signal, onProgress: progress => readerPdfProgress(typeof progress === 'string' ? progress : 'Reading page ' + progress.page + (progress.pages ? ' of ' + progress.pages : '') + '…')};
		readerPdfProgress('Reading PDF…');
		let result, mode = 'text';
		try { result = await globalThis.RapierPdfReader.read(file, {...options, mode}); }
		catch (error) { if (error?.code !== 'PDF_NO_TEXT') throw error; mode = 'pages'; result = await globalThis.RapierPdfReader.read(file, {...options, mode}); }
		const name = file.name.replace(/\.pdf$/i, '').replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, 180) || 'document';
		await readerLoad(readerDocumentText(result.markdown), name + '.md');
		readerToast('PDF opened as ' + (mode === 'pages' ? 'page pictures' : 'text') + (result.warnings[0] ? ' · ' + result.warnings[0] : ''), 'info');
		return true;
	}, 'PDF reader');
}

// ── Read aloud. The editor's control and its behaviour: the blocks of the page spoken in turn, the word being said marked, the page
// following the voice until the person scrolls or touches it. A tap on a word while it reads moves the voice there.

const readerSpeech = {active: false, paused: false, blocks: [], position: -1, utterance: null, lastWordStart: 0, timer: 0, follow: true, armed: false};
// What the editor's shared pieces ask of their host.
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
	readerToast(reason === 'no-offline-voice' ? 'read-aloud needs an offline voice: install one for your language in your device\'s text-to-speech settings' : 'read-aloud failed', 'error');
}

function readerAdvanceReading() {
	readerSpeech.position++;
	if (readerSpeech.position >= readerSpeech.blocks.length) { readerStopReading(); return; }
	readerSpeakBlock(readerSpeech.blocks[readerSpeech.position], 0);
}

// One block, from the first word that ends after `from`. A voice that reports no word boundaries is paced by the length of each word.
function readerSpeakBlock(block, from) {
	if (!block.isConnected) { readerAdvanceReading(); return; }
	const text = _readTextProjection(block).text, words = _readSegmentWords(text).filter(word => word.end > from);
	if (!words.length) { readerAdvanceReading(); return; }
	readerCancelUtterance();
	const speakFrom = words[0].start, utterance = new SpeechSynthesisUtterance(text.slice(speakFrom));
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
	if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance !== 'function') { readerToast('this browser can’t read aloud', 'error'); return; }
	if (readerSpeech.active) {
		if (readerSpeech.paused) {
			readerSpeech.paused = false;
			readerSpeakBlock(readerSpeech.blocks[readerSpeech.position], readerSpeech.lastWordStart);
		} else { readerSpeech.paused = true; readerCancelUtterance(); }
		readerRenderReadAloud();
		return;
	}
	// The blocks with words to say: code, pictures, rules and drawn diagrams are not read.
	const blocks = [...$('editor-blocks').children].filter(block => !block.hidden && !block.matches('.rapier-ink-layer,.diagram-block,.empty-doc-prompt') && _readTextProjection(block).text.trim());
	if (!blocks.length) { readerToast('nothing to read', 'error'); return; }
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

// A tap on the page while it reads: the voice goes on from that word.
function readerSeekReading(event) {
	if (!readerSpeech.active || event.target.closest('a,button,summary,.fence-copy')) return;
	const caret = document.caretRangeFromPoint ? document.caretRangeFromPoint(event.clientX, event.clientY) : null;
	let block = caret?.startContainer;
	while (block && block.parentElement !== $('editor-blocks')) block = block.parentElement;
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

// ── Copy, share and print. What the person holds is the document's own source; each choice says what is made of it.

const readerMetadata = () => ({filename: reader.filename, docKind: reader.docKind, codeLang: reader.codeLang, bom: false});
const readerBaseName = () => reader.filename.replace(/\.[a-z0-9]+$/i, '') || 'document';
const readerPandoc = () => { try { return localStorage.getItem('rapier:export.pandocDialect') === '1'; } catch (_) { return false; } };

function readerRenderPandoc() {
	const toggle = $('copy-markdown-pandoc-toggle');
	if (!toggle) return;
	toggle.setAttribute('aria-pressed', String(readerPandoc()));
	toggle.querySelector('.export-choice-toggle__state').textContent = readerPandoc() ? 'ON' : 'OFF';
}

// The words of the document as the editor's Copy as plain text writes them.
function readerPlainText() {
	if (reader.docKind !== 'markdown') return reader.source;
	const markdown = _rapierRenderModule('render-markdown'), root = markdown._rapierRenderSemanticRoot(reader.source, readerMetadata());
	return _rapierPortablePlainText(_rapierProjectPortableRoot(markdown._rapierHeldPicturesAsWords(root), {baseName: readerBaseName()}));
}

async function readerCopy(kind) {
	const markdown = reader.docKind === 'markdown', say = (ok, words) => { readerToast(ok ? words : 'copy failed — try selecting all and copying manually', ok ? 'success' : 'error'); return ok; };
	if (kind === 'markdown') return say(await _rapierWriteTextClipboard(markdown && readerPandoc() ? _rapierPandocDialectExportText(reader.source) : reader.source), markdown ? 'copied Markdown' : 'copied source');
	if (kind === 'plain' || !markdown) return say(await _rapierWriteTextClipboard(readerPlainText()), 'copied plain text');
	const root = _rapierProjectPortableRoot(_rapierRenderModule('render-markdown')._rapierRenderSemanticRoot(reader.source, readerMetadata()), {baseName: readerBaseName()});
	// A picture the document keeps in its appendix is not carried by a copy: its place says what was there.
	let held = 0;
	for (const image of root.querySelectorAll('img[data-rapier-asset],img[data-rapier-image-url],img[src^="data:image/jxl"]')) {
		const label = String(image.getAttribute('alt') || 'image').trim() || 'image', stand = document.createElement('span');
		stand.textContent = '[image: ' + label + ']';
		image.replaceWith(stand);
		held++;
	}
	const copied = await _rapierWriteFormattedClipboard(_rapierPortableHtml(root), readerPlainText(), reader.source);
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

// Share the document as a file; where the browser has no share sheet for files, save it.
async function readerShare() {
	if (!_rapierEmbedFeatureAllowed('share')) return false;
	const mime = reader.docKind === 'markdown' ? 'text/markdown' : 'text/plain', blob = new Blob([reader.source], {type: mime}), file = new File([blob], reader.filename, {type: mime});
	try {
		if (navigator.canShare?.({files: [file]})) {
			await navigator.share({files: [file], title: reader.filename});
			readerToast('shared ' + reader.filename, 'success');
			return true;
		}
	} catch (error) {
		if (error?.name === 'AbortError') return false;
	}
	readerDownload(blob, reader.filename);
	readerToast('share unavailable — saved ' + reader.filename + ' instead', 'info');
	return true;
}

function readerExportText() {
	readerDownload(new Blob([readerPlainText()], {type: 'text/plain'}), readerBaseName() + '.txt');
	return true;
}

// Print and Save as PDF are the browser's: the whole document, folded sections open, in light ink whatever the theme.
function readerPrint() {
	const root = document.documentElement, body = document.body, hidden = [...$('editor-blocks').children].filter(block => block.hidden), dark = !body.classList.contains('light');
	for (const block of hidden) block.hidden = false;
	root.dataset.rapierPrinting = 'on';
	body.classList.add('light');
	const restore = () => {
		delete root.dataset.rapierPrinting;
		if (dark) body.classList.remove('light');
		for (const block of hidden) block.hidden = true;
		removeEventListener('afterprint', restore);
	};
	addEventListener('afterprint', restore);
	try { print(); } catch (_) { restore(); readerToast('printing is unavailable', 'error'); }
}

function readerOpenSheet(overlay) {
	for (const id of ['copy-overlay', 'share-overlay']) readerCloseDialog($(id));
	readerOpenDialog(overlay, '.settings-panel');
}

// ── Notices, files and the page's own controls.

function readerToast(message, type = 'info') {
	const root = $('toast-root');
	const toast = document.createElement('div');
	toast.className = 'toast toast--' + type;
	toast.setAttribute('role', 'status');
	toast.setAttribute('aria-live', 'polite');
	const text = document.createElement('span');
	text.className = 'toast__msg';
	text.textContent = message;
	const close = document.createElement('button');
	close.type = 'button';
	close.className = 'toast__close';
	close.setAttribute('aria-label', 'dismiss');
	close.textContent = '×';
	toast.append(text, close);
	root.append(toast);
	let timer = type === 'error' ? 0 : setTimeout(() => toast.remove(), 4500);
	close.addEventListener('click', () => { clearTimeout(timer); toast.remove(); });
}

async function readerOpenFile(file) {
	if (!file) return;
	if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') { await readerOpenPdf(file); return; }
	if (/\.docx$/i.test(file.name) || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') { await readerOpenWord(file); return; }
	try {
		const text = await RapierTextCodec.readDocumentBlob(file);
		await readerLoad(text, _rapierDocumentNameIsAdmissible(file.name) ? file.name : 'document.md');
	} catch (error) { readerToast(String(error?.message || error), 'error'); }
}

// The notices are a second packed group, unpacked the first time they are asked for.
async function readerOpenLicenses() {
	try {
		if (!$('licenses-overlay')) {
			const [{text}] = await RapierUnpack('rapier-pack-licenses');
			document.body.insertAdjacentHTML('beforeend', text);
			_rapierPopArrangeAll($('licenses-overlay'));
		}
		readerCloseDialog($('settings-overlay'));
		readerOpenDialog($('licenses-overlay'), '.licenses-panel');
	} catch (error) { readerToast('Could not open the licenses: ' + String(error?.message || error), 'error'); }
}

// Settings gives way to the sheet and comes back when the licenses close.
function readerCloseLicenses() { readerCloseDialog($('licenses-overlay')); readerOpenSettings(); }

const READER_ACTIONS = {
	'settings': () => readerOpenSettings(),
	'settings-close': () => readerCloseDialog($('settings-overlay')),
	'find': () => readerFindOpen($('find-bar').hidden),
	'find-next': () => readerFindStep(1),
	'find-prev': () => readerFindStep(-1),
	'open-document': () => { readerCloseDialog($('settings-overlay')); $('file-input').click(); },
	'switch': control => {
		const group = control.closest('[data-switch]');
		if (group) readerSetPreference(group.dataset.switch, _rapierSwitchValue(control));
	},
	'code-toggle': () => { const code = $('settings-code-controls'); code.dataset.open = String(code.dataset.open !== 'true'); readerRenderSettings(); },
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
		} else if (/^(?:https?|mailto):/i.test(href)) {
			event.preventDefault();
			window.open(link.href, '_blank', 'noopener,noreferrer');
		}
	});
	$('editor-blocks').addEventListener('click', readerSeekReading);
	$('file-input').addEventListener('change', event => { const [file] = event.target.files; event.target.value = ''; void readerOpenFile(file); });
	$('find-input').addEventListener('input', () => readerFindRun());
	$('find-input').addEventListener('keydown', event => {
		if (event.key === 'Enter') { event.preventDefault(); readerFindStep(event.shiftKey ? -1 : 1); }
		else if (event.key === 'Escape') { event.preventDefault(); readerFindOpen(false); }
	});
	$('navigator-outline-filter').addEventListener('input', event => readerOutlineFilter(event.target.value));
	addEventListener('keydown', event => {
		if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing && readerEscape()) { event.preventDefault(); return; }
		if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f' && !readerDialogs.length) { event.preventDefault(); readerFindOpen(true); }
	});
	// A file dropped on a stand-alone page opens as Open opens it; a framed reader's document is the host's.
	addEventListener('dragover', event => {
		if (_rapierEmbed.active || !Array.from(event.dataTransfer?.types || []).includes('Files')) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'copy';
	});
	addEventListener('drop', event => {
		const file = event.dataTransfer?.files?.[0];
		if (_rapierEmbed.active || !file) return;
		event.preventDefault();
		void readerOpenFile(file);
	});
	matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => readerApplyView());
	for (const key of ['math', 'mermaid']) addEventListener('rapier:' + key + 'plugin', event => (key === 'math' ? _rapierUiMath : _rapierUiDiagram).apply(event.detail || {}));
	for (const [key, view] of [['math', _rapierUiMath], ['mermaid', _rapierUiDiagram]]) if (_rapierProviders[key]) { view.status = _rapierProviders[key].status || 'checking'; view.error = _rapierProviders[key].error || null; }
}

function readerStart() {
	readerStampSwatches();
	_rapierPopArrangeAll(document);
	readerApplyView();
	readerBind();
	readerBindFab();
	readerRenderFilename();
	readerRenderSettings();
	readerRenderEmpty();
	readerRenderReadAloud();
	$('settings-share-btn').hidden = !_rapierEmbedFeatureAllowed('share');
	$('rapier-first-screen')?.classList.add('rapier-first-ready');
	_rapierEmbedStart();
}

readerStart();
