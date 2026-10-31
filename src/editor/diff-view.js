// SPDX-License-Identifier: AGPL-3.0-only
(() => {
	const SIDES = Object.freeze([{key: 'before', label: 'Original'}, {key: 'after', label: 'Changed'}]);
	const LINKS = Object.freeze([['rapier-diff on GitHub', 'https://github.com/jackskip22/rapier-diff'], ['rapier-diff on npm', 'https://www.npmjs.com/package/rapier-diff']]);
	const ABOUT = Object.freeze([
		'Rapier compares words, not just lines. A moved paragraph shows as one move, with any words changed inside it.',
		'Word and PDF files are read on this device. Nothing is uploaded.',
		'rapier-diff is the engine, MIT licensed, with no dependencies: npm install rapier-diff.',
	]);
	let view = null;
	const make = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
	const anchor = (label, href) => { const link = make('a', '', label); link.href = href; link.target = '_blank'; link.rel = 'noopener'; return link; };
	function about() {
		const list = _rapierInfoSheetShow('rapier-diff', ABOUT);
		for (const [label, href] of LINKS) { const item = make('li'); item.append(anchor(label, href)); list.append(item); }
	}

	function side({key, label}) {
		const root = make('div', 'rapier-diff-view__side'), name = make('p', 'rapier-diff-view__note rapier-diff-view__name', label);
		const text = make('textarea', 'rapier-diff-view__text'), pick = make('label', 'settings-action-btn rapier-diff-view__pick'), input = make('input');
		text.setAttribute('aria-label', label); text.placeholder = 'Paste text'; text.spellcheck = false; text.dir = 'auto';
		pick.append(make('span', '', 'Choose or drop a file'), input);
		input.type = 'file'; input.setAttribute('aria-label', label + ': choose a file');
		const open = make('button', 'settings-action-btn rapier-diff-view__open', 'Open in Rapier');
		open.type = 'button'; open.hidden = true;
		root.dataset.side = key;
		root.append(name, text, pick, open);
		return {key, label, root, name, text, pick, input, open, file: null};
	}
	function build() {
		const root = make('div', 'rapier-diff-view'), title = make('div', 'rapier-diff-view__title', 'Compare documents');
		root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Compare text and documents');
		const bar = make('div', 'rapier-diff-view__bar'), shut = make('button', 'navigator-close');
		shut.type = 'button'; shut.setAttribute('aria-label', 'close');
		shut.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
		const info = make('button', 'settings-info-btn'), heading = make('div', 'rapier-diff-view__heading');
		info.type = 'button'; info.setAttribute('aria-label', 'about rapier-diff'); info.setAttribute('aria-haspopup', 'dialog');
		info.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
		heading.append(title, info);
		bar.append(heading, shut);
		const body = make('div', 'rapier-diff-view__body');
		const note = make('p', 'rapier-diff-view__note', 'Runs in Rapier, one offline HTML file. Nothing is uploaded.');
		const sides = SIDES.map(side), pair = make('div', 'rapier-diff-view__sides');
		pair.append(...sides.map(each => each.root));
		const go = make('button', 'settings-action-btn rapier-diff-view__go', 'Compare');
		go.type = 'button';
		body.append(note, pair, go, _rapierToolFooter('/diff', 'rapier-diff', 'rapier-diff'));
		root.append(bar, body);
		return {root, info, shut, sides, go, inert: [], wasFocus: null, reading: 0, comparing: false, watch: null};
	}

	function name(of) {
		of.name.textContent = of.file ? of.label + ' · ' + of.file.name : of.label;
		of.open.hidden = !of.text.value;
	}
	async function read(file) {
		const kind = _rapierImportKind(file.name, file.type);
		if (kind === 'docx' || kind === 'pdf') {
			const result = await _rapierReadImportedDocument(file, file.name, {quiet: true});
			if (!result) return null;
			const words = kind === 'docx' ? globalThis.RapierDocxImport.wordReview(result.text).body.replace(/^---\n[\s\S]*?\n---\n+/, '') : result.text;
			return {text: words, source: result.text, name: file.name, open: result.filename, docKind: 'markdown'};
		}
		if (kind || _rapierRasterInputType(String(file.type).toLowerCase()) || _rapierIsVectorFile(file)) return {refused: 'kind'};
		if (file.size > RapierTextCodec.maxDocumentBytes) return {refused: 'size'};
		const raw = String(await RapierTextCodec.readDocumentBlob(file)), page = await _rapierReadSharedDocument(raw, file.name);
		const filename = page ? page.filename : file.name, text = RapierTextCodec.normalizeDocument(page ? page.source : RapierLedgerCarried.readDocument(raw).text);
		return {text, name: file.name, open: filename, docKind: _rapierIntakeDocKind(filename, file.type), language: _langForExt(filename)};
	}
	async function load(of, file) {
		if (!view || !file) return;
		const self = view, ticket = ++self.reading;
		try {
			const got = await read(file);
			if (!got || view !== self || ticket !== self.reading) return;
			if (got.refused) { showToast(got.refused === 'size' ? 'File too large (64 MiB max)' : 'Choose a text, Word or PDF file.', 'error'); return; }
			of.text.value = got.text; of.file = got;
			name(of);
			of.text.scrollTop = 0;
		} catch (error) {
			if (error?.name !== 'AbortError') showToast(_rapierErrorWords(error, 'Couldn’t read ' + file.name), 'error');
		}
	}
	const target = node => view.sides.find(of => of.root.contains(node)) || view.sides.find(of => !of.text.value) || view.sides[1];

	function pastedKind(...texts) {
		const lines = texts.flatMap(text => text.split('\n')).filter(line => line.trim());
		const shaped = lines.filter(line => /[;{}()[\]<>]\s*$/.test(line) || /^(?:\t| {2,})\S/.test(line)).length;
		return lines.length && shaped / lines.length >= .4 ? 'code' : 'markdown';
	}
	function pastedLanguage(...texts) {
		const text = texts.join('\n').slice(0, 20000), lines = text.split('\n').filter(line => line.trim());
		const count = pattern => lines.filter(line => pattern.test(line)).length, share = n => lines.length ? n / lines.length : 0;
		if (texts.every(value => !value.trim() || /^\s*[[{]/.test(value)) && texts.every(value => { try { JSON.parse(value); return true; } catch { return !value.trim(); } })) return 'json';
		if (/^\s*(?:<!doctype html|<html[\s>])/i.test(text) || share(count(/^\s*<\/?[a-z][\w-]*(?:\s[^>]*)?\/?>/i)) >= .5) return 'html';
		if (share(count(/^\s*(?:def |class \w+.*:|import \w|from \w[\w.]* import |elif |except\b)/)) >= .15 && share(count(/[;{}]\s*$/)) < .2) return 'python';
		if (share(count(/^\s*[^\s{}][^{}]*\{\s*$|^\s*[\w-]+\s*:\s*[^;]+;\s*$|^\s*}\s*$/)) >= .6 && !count(/\b(?:function|const|let|var|return)\b|=>/)) return 'css';
		if (count(/\b(?:function\b|const |let |var |=>|class \w+|import .+ from |export |return\b|console\.)/) / (lines.length || 1) >= .15) return 'javascript';
		return '';
	}
	async function compare() {
		if (!view || view.comparing) return;
		const [before, after] = view.sides, words = of => of.file && of.text.value === of.file.text ? of.file : null;
		if (!before.text.value && !after.text.value) { before.text.focus(); return; }
		const kinds = [words(before), words(after)], kind = kinds[1]?.docKind || kinds[0]?.docKind || pastedKind(before.text.value, after.text.value);
		const language = kinds[1]?.language || kinds[0]?.language || (kind === 'code' ? pastedLanguage(before.text.value, after.text.value) : '');
		view.comparing = true;
		aside(true);
		await _rapierCompareStart(before.text.value, kinds[0]?.name || before.label, after.text.value, kinds[1]?.name || after.label, {docKind: kind, language});
	}
	function aside(on) {
		const self = view;
		self.root.hidden = on;
		document.documentElement.classList.toggle('rapier-diff-compare', on);
		for (const node of self.inert) node.inert = !on;
		if (on) {
			self.watch = new MutationObserver(() => { if (!document.documentElement.dataset.compare && view === self && self.comparing) back(); });
			self.watch.observe(document.documentElement, {attributes: true, attributeFilter: ['data-compare']});
		}
	}
	function back() {
		const self = view;
		self.watch?.disconnect(); self.watch = null;
		self.comparing = false;
		aside(false);
		self.go.focus({preventScroll: true});
	}
	async function openSide(of) {
		const held = of.file && of.text.value === of.file.text ? of.file : null, text = held?.source ?? of.text.value;
		const filename = held?.open || (of.key === 'before' ? 'original' : 'changed') + (pastedKind(text) === 'code' ? '.txt' : '.md');
		close();
		await rapierOpenPlatformPayload({name: filename, text, transient: true});
	}

	function open() {
		if (view) return;
		view = build();
		const {root} = view;
		view.wasFocus = document.activeElement;
		for (const node of document.body.children) if (!node.inert && node.id !== 'toast-root' && node.id !== 'sr-live') { node.inert = true; view.inert.push(node); }
		document.body.append(root);
		const notices = document.getElementById('toast-root');
		if (notices) { view.notices = {root: notices, home: notices.parentElement}; root.append(notices); if (typeof _rapierScheduleToastLift === 'function') _rapierScheduleToastLift(); }
		if (typeof _rapierDoorPathMark === 'function') _rapierDoorPathMark('diff', true);
		document.documentElement.classList.remove('rapier-diff-start');
		for (const of of view.sides) {
			of.input.addEventListener('change', () => { const file = of.input.files?.[0]; of.input.value = ''; void load(of, file); });
			of.text.addEventListener('input', () => name(of));
			of.open.addEventListener('click', () => void openSide(of));
			of.root.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); of.pick.toggleAttribute('data-over', true); } });
			of.root.addEventListener('dragleave', event => { if (!of.root.contains(event.relatedTarget)) of.pick.removeAttribute('data-over'); });
		}
		view.shut.addEventListener('click', close);
		view.info.addEventListener('click', about);
		view.go.addEventListener('click', () => void compare());
		root.addEventListener('keydown', event => {
			if (event.key === 'Escape') { event.preventDefault(); close(); }
			else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void compare(); }
		});
		root.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
		root.addEventListener('drop', event => {
			const files = [...event.dataTransfer?.files || []];
			if (!files.length) return;
			event.preventDefault();
			for (const of of view.sides) of.pick.removeAttribute('data-over');
			if (files.length > 1) { void load(view.sides[0], files[0]); void load(view.sides[1], files[1]); }
			else void load(target(event.target), files[0]);
		});
		root.addEventListener('paste', event => {
			const file = event.clipboardData?.files?.[0];
			if (!file) return;
			event.preventDefault(); void load(target(event.target), file);
		});
		view.sides[0].text.focus({preventScroll: true});
	}
	function close() {
		if (!view) return;
		const done = view;
		view = null;
		done.reading++;
		done.watch?.disconnect();
		document.documentElement.classList.remove('rapier-diff-compare');
		if (done.comparing) rapierCompareClose({skipRestore: true});
		if (done.notices?.root.parentElement === done.root) done.notices.home.append(done.notices.root);
		done.root.remove();
		for (const node of done.inert) node.inert = false;
		if (typeof _rapierDoorPathMark === 'function') _rapierDoorPathMark('diff', false);
		try { done.wasFocus?.focus({preventScroll: true}); } catch (_) {}
	}
	const face = Object.freeze({open, close, get state() { return Object.freeze({open: !!view}); }});
	_rapierDiffPart = face;
	if (_rapierDiffDoor?.born) _rapierBootFactsPublished.then(open, open);
})();
