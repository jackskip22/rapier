// SPDX-License-Identifier: AGPL-3.0-only
(() => {
	const MAKES = Object.freeze({md: 'Markdown', docx: 'Word', pdf: 'PDF', html: 'HTML'});
	const EXTENSION = Object.freeze({md: '.md', docx: '.docx', pdf: '.pdf', html: '.html'});
	const EXPORT = Object.freeze({docx: 'export_word', pdf: 'export_pdf', html: 'export_page'});
	let view = null;
	const make = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
	const size = bytes => bytes < 1024 ? bytes + '\u00a0B' : bytes < 1048576 ? (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + '\u00a0KB' : (bytes / 1048576).toFixed(bytes < 10485760 ? 2 : 1) + '\u00a0MB';
	function cross() {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		for (const [name, value] of [['width', '22'], ['height', '22'], ['viewBox', '0 0 24 24'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['aria-hidden', 'true']]) svg.setAttribute(name, value);
		for (const [x1, y1, x2, y2] of [[18, 6, 6, 18], [6, 6, 18, 18]]) {
			const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
			for (const [name, value] of Object.entries({x1, y1, x2, y2})) line.setAttribute(name, String(value));
			svg.append(line);
		}
		return svg;
	}
	function closer(label) { const button = make('button', 'navigator-close'); button.type = 'button'; button.setAttribute('aria-label', label); button.append(cross()); return button; }

	function kindOf(file) {
		const name = String(file.name || '').toLowerCase(), type = String(file.type || '').toLowerCase().split(';')[0].trim();
		const imported = _rapierImportKind(name, type);
		if (imported === 'docx' || imported === 'pdf') return imported;
		if (/\.x?html?$/.test(name) || type === 'text/html' || type === 'application/xhtml+xml') return 'html';
		if (/\.(md|markdown|mdown|mkd|mdx|txt|text)$/.test(name) || type === 'text/markdown' || type === 'text/plain') return 'md';
		return null;
	}
	const stem = name => String(name || 'document').replace(/(\.rapier)?\.[^./]+$/i, '').replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, 180) || 'document';
	function stemOf(row, rows) {
		const taken = new Set(rows.filter(other => other !== row && other.stem).map(other => other.stem.toLowerCase())), base = stem(row.file.name);
		let name = base;
		for (let count = 2; taken.has(name.toLowerCase()); count++) name = base + ' (' + count + ')';
		return name;
	}

	async function markdownOf(row) {
		if (row.markdown) return row.markdown;
		const {file, kind} = row;
		let made;
		if (kind === 'docx' || kind === 'pdf') {
			const result = await _rapierReadImportedDocument(file, file.name, {quiet: true, original: true, plain: true});
			if (!result) throw Object.assign(new Error('Not converted'), {shown: true});
			made = {text: result.text, notes: result.warnings || []};
		} else {
			const record = await RapierTextCodec.readDocumentRecord(file, {});
			const text = record.text.charCodeAt(0) === 0xFEFF ? record.text.slice(1) : record.text;
			made = {text: kind === 'html' ? await htmlMarkdown(text) : text, notes: []};
		}
		if (!made.text.trim()) throw new Error('This file has no text to convert.');
		row.markdown = made;
		return made;
	}
	async function htmlMarkdown(html) {
		const page = new DOMParser().parseFromString(html, 'text/html'), carried = page.getElementById('rapier-document');
		if (carried?.tagName === 'SCRIPT' && String(carried.type).toLowerCase() === 'text/markdown' && globalThis.RapierLedgerCarried?.decodeCarried) {
			const text = globalThis.RapierLedgerCarried.decodeCarried(carried.textContent);
			return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
		}
		await _rapierYieldUserVisibleWork();
		const markdown = String(turndown.turndown(_rapierPasteSheetTables(_rapierPreparePasteHtml(page.body?.innerHTML || ''), html)) || '').trim();
		return markdown ? markdown + '\n' : '';
	}
	async function fileOf(row, makes, signal) {
		const {text} = await markdownOf(row), filename = row.stem + '.md';
		if (makes === 'md') return {blob: new Blob([text], {type: 'text/markdown'}), name: filename, notes: []};
		const canonical = RapierTextCodec.normalizeDocument(text);
		const captured = Object.freeze({canonical, comparisonBase: null, wordComparison: null, ledger: null, carried: 'none',
			metadata: Object.freeze({filename, saveName: filename, docKind: 'markdown', codeLang: '', mime: 'text/markdown', bom: false, encoding: 'utf-8', documentAuthority: '', documentRevision: 0}),
			stamp: Object.freeze(_rapierMutationStamp()), mode: '', plain: false, wordLayout: false, dirty: false, generation: 0, documentRevision: 0});
		const made = await _rapierBuildEditorExport(EXPORT[makes], {}, {captured, signal, maxBytes: RapierTextCodec.maxDocumentBytes, loadMath: true});
		return {blob: new Blob([made.bytes], {type: made.mimeType}), name: row.stem + EXTENSION[makes], notes: (made.issues || []).map(issue => issue.message).filter(Boolean)};
	}

	function build() {
		const root = make('div', 'rapier-convert-view'), title = make('div', 'rapier-convert-view__title', 'Document converter');
		root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Document converter');
		const bar = make('div', 'rapier-convert-view__bar'), shut = closer('close');
		bar.append(title, shut);
		const body = make('div', 'rapier-convert-view__body');
		const note = make('p', 'rapier-convert-view__note', 'Runs in Rapier, one offline HTML file. Your files never leave your device.');
		const pick = make('label', 'settings-action-btn rapier-convert-view__pick'), input = make('input');
		pick.append(make('span', '', 'Choose or drop Word, PDF, HTML or Markdown files'), input);
		input.type = 'file'; input.multiple = true;
		input.accept = '.docx,.dotx,.pdf,.html,.htm,.xhtml,.md,.markdown,.txt,application/pdf,text/html,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
		const start = _rapierConvertDoor?.makes || 'md';
		const group = make('div', 'theme-switcher theme-switcher--joined theme-switcher--onoff');
		group.setAttribute('role', 'radiogroup'); group.setAttribute('aria-label', 'Convert to');
		const choices = Object.entries(MAKES).map(([makes, words]) => {
			const button = make('button', 'theme-switcher__btn onoff-btn', words);
			button.type = 'button'; button.dataset.makes = makes; button.setAttribute('role', 'radio'); button.setAttribute('aria-checked', String(makes === start));
			button.toggleAttribute('data-active', makes === start);
			return button;
		});
		group.append(...choices);
		const part = make('div', 'rapier-convert-view__part');
		part.append(make('p', 'rapier-convert-view__note', 'Convert to'), group);
		const line = make('div', 'rapier-progress__bar rapier-convert-view__line'), list = make('ul', 'rapier-convert-view__list');
		line.hidden = true;
		const files = make('div', 'rapier-convert-view__files');
		files.append(line, list);
		body.append(note, pick, part, files, _rapierToolFooter('/convert', 'rapier-embed'));
		root.append(bar, body);
		return {root, shut, input, pick, group, choices, line, list, makes: start, rows: [], running: false, controller: null, inert: [], wasFocus: null};
	}

	function paint(row) {
		const note = row.node.querySelector('.rapier-convert-view__row-note');
		const made = row.results.get(view?.makes ?? row.makes);
		let text;
		if (row.state === 'waiting') text = size(row.file.size) + ' · waiting';
		else if (row.state === 'working') text = size(row.file.size) + ' · converting';
		else if (row.state === 'same') text = 'Already ' + MAKES[row.kind];
		else if (row.state !== 'done') text = row.say;
		else text = size(row.file.size) + ' → ' + size(made.blob.size) + ' ' + MAKES[view?.makes ?? row.makes] +
			(made.notes.length ? ' · ' + made.notes.length + (made.notes.length === 1 ? ' note' : ' notes') : '');
		note.textContent = text;
		row.download.hidden = row.state !== 'done';
		row.notes.hidden = row.state !== 'done' || !made.notes.length;
		row.open.hidden = !row.markdown;
	}
	function overall(of = view) {
		if (!of) return;
		const rows = of.rows, settled = rows.filter(row => row.state !== 'waiting' && row.state !== 'working').length;
		of.line.style.setProperty('--rapier-progress', String(rows.length ? settled / rows.length : 0));
		of.line.hidden = !rows.some(row => row.state === 'waiting' || row.state === 'working');
	}

	async function run() {
		const self = view;
		if (!self || self.running) return;
		self.running = true; self.controller = new AbortController();
		const signal = self.controller.signal;
		try {
			while (!signal.aborted) {
				const row = self.rows.find(each => each.state === 'waiting');
				if (!row) break;
				const makes = self.makes;
				if (row.kind === makes) { row.state = 'same'; paint(row); overall(self); continue; }
				row.state = 'working'; paint(row); overall(self);
				try {
					row.results.set(makes, await fileOf(row, makes, signal));
					row.state = self.makes === makes ? 'done' : 'waiting';
				} catch (error) {
					if (error?.name === 'AbortError' || error?.code === 'cancelled') { row.state = 'stopped'; row.say = 'Canceled'; }
					else { row.state = 'failed'; row.say = error?.shown ? error.message : _rapierErrorWords(error, 'Couldn’t convert this file.'); }
				}
				if (view === self) { paint(row); overall(self); }
			}
		} finally {
			self.running = false; self.controller = null; overall(self);
			if (view === self && !signal.aborted) document.getElementById('sr-live')?.replaceChildren(document.createTextNode(self.rows.filter(row => row.state === 'done').length + ' files converted'));
		}
	}
	function remake() {
		for (const row of view.rows) {
			if (row.state === 'working') continue;
			row.state = row.kind === view.makes ? 'same' : row.results.has(view.makes) ? 'done' : row.state === 'failed' && row.markdown === null ? 'failed' : 'waiting';
			paint(row);
		}
		overall(); void run();
	}

	function add(files) {
		if (!view || !files.length) return;
		const fragment = document.createDocumentFragment();
		for (const file of files) {
			const kind = kindOf(file);
			const row = {file, kind, state: kind ? 'waiting' : 'failed', say: kind ? '' : 'Choose a Word, PDF, HTML or Markdown file.', results: new Map(), markdown: null, makes: view.makes};
			const node = make('li', 'rapier-convert-view__row'), text = make('div', 'rapier-convert-view__row-text'), actions = make('div', 'rapier-convert-view__row-actions');
			const download = make('button', 'settings-action-btn', 'Download'), open = make('button', 'settings-action-btn', 'Edit'), notes = make('button', 'settings-action-btn', 'Notes'), remove = closer('Remove ' + file.name);
			text.append(make('div', 'rapier-convert-view__row-name', file.name), make('div', 'rapier-convert-view__row-note'));
			for (const button of [download, open, notes]) { button.type = 'button'; button.hidden = true; }
			download.addEventListener('click', () => { const made = row.results.get(view.makes); if (made) save(made.blob, made.name); });
			notes.addEventListener('click', () => { const made = row.results.get(view.makes); if (made) _rapierInfoSheetShow('conversion notes', made.notes); });
			open.addEventListener('click', () => void edit(row));
			remove.addEventListener('click', () => {
				const at = view.rows.indexOf(row);
				view.rows.splice(at, 1); node.remove(); row.results.clear(); row.markdown = null; overall();
				(view.list.children[at]?.querySelector('.navigator-close') || view.input).focus();
			});
			actions.append(download, open, notes, remove); node.append(text, actions); fragment.append(node);
			Object.assign(row, {node, download, open, notes, stem: stemOf(row, view.rows)});
			view.rows.push(row); paint(row);
		}
		view.list.append(fragment); overall(); void run();
	}
	function save(blob, name) {
		const link = make('a'), url = URL.createObjectURL(blob);
		link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 4000);
	}
	async function edit(row) {
		const {text, notes} = row.markdown, name = row.stem + '.md';
		close();
		if (row.kind === 'docx' || row.kind === 'pdf') { await _rapierOpenImportedFile(row.file, row.file.name); return; }
		const opened = await rapierOpenPlatformPayload({name, text, admittedBytes: new TextEncoder().encode(text).length, bom: false, transient: true});
		if (opened && notes.length) _rapierAcceptDocumentImport({importSummary: 'Opened ' + name, warnings: notes});
	}

	function open() {
		if (view) return;
		view = build();
		const {root} = view;
		view.wasFocus = document.activeElement;
		for (const node of document.body.children) if (!node.inert && node.id !== 'toast-root' && node.id !== 'sr-live') { node.inert = true; view.inert.push(node); }
		document.body.append(root);
		_rapierSwitchSlide(view.group);
		const notices = document.getElementById('toast-root');
		if (notices) { view.notices = {root: notices, home: notices.parentElement}; root.append(notices); if (typeof _rapierScheduleToastLift === 'function') _rapierScheduleToastLift(); }
		view.door = _rapierConvertDoor?.door || 'convert';
		if (typeof _rapierDoorPathMark === 'function') _rapierDoorPathMark(view.door, true);
		document.documentElement.classList.remove('rapier-convert-start');
		view.input.addEventListener('change', () => { add([...view.input.files]); view.input.value = ''; });
		view.shut.addEventListener('click', close);
		for (const button of view.choices) button.addEventListener('click', () => {
			if (button.dataset.makes === view.makes) return;
			view.makes = button.dataset.makes;
			for (const each of view.choices) { const on = each === button; each.toggleAttribute('data-active', on); each.setAttribute('aria-checked', String(on)); }
			_rapierSwitchSlide(view.group);
			remake();
		});
		view.group.addEventListener('keydown', event => {
			const step = {ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1}[event.key];
			if (!step) return;
			const at = view.choices.findIndex(button => button.hasAttribute('data-active')), next = view.choices[(at + step + view.choices.length) % view.choices.length];
			event.preventDefault(); next.click(); next.focus();
		});
		root.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
		root.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); view.pick.toggleAttribute('data-over', true); } });
		root.addEventListener('dragleave', event => { if (!root.contains(event.relatedTarget)) view.pick.removeAttribute('data-over'); });
		root.addEventListener('drop', event => { if (!event.dataTransfer?.files.length) return; event.preventDefault(); view.pick.removeAttribute('data-over'); add([...event.dataTransfer.files]); });
		root.addEventListener('paste', event => { const files = [...event.clipboardData?.files || []]; if (files.length) { event.preventDefault(); add(files); } });
		overall();
		view.input.focus({preventScroll: true});
	}
	function close() {
		if (!view) return;
		view.controller?.abort();
		const done = view;
		view = null;
		for (const row of done.rows) { row.results.clear(); row.markdown = null; }
		if (done.notices?.root.parentElement === done.root) done.notices.home.append(done.notices.root);
		done.root.remove();
		for (const node of done.inert) node.inert = false;
		if (typeof _rapierDoorPathMark === 'function') _rapierDoorPathMark(done.door, false);
		try { done.wasFocus?.focus({preventScroll: true}); } catch (_) {}
	}
	_rapierConvertPart = Object.freeze({open, close, get state() { return Object.freeze({open: !!view}); }});
	if (_rapierConvertDoor?.born) _rapierBootFactsPublished.then(open, open);
})();
