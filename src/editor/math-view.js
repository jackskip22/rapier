// SPDX-License-Identifier: AGPL-3.0-only
(() => {
	const START = String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`;
	const KEYS = [['\\', '\\', 0], ['{ }', '{}', 1], ['^', '^', 0], ['_', '_', 0], ['( )', '()', 1], ['\\frac', '\\frac{}{}', 3], ['\\sqrt', '\\sqrt{}', 1],
		['\\sum', '\\sum_{}^{}', 4], ['\\int', '\\int_{}^{}', 4], ['α', '\\alpha', 0], ['π', '\\pi', 0], ['≤', '\\le ', 0]];
	const EM = 24, PNG_SCALE = 4;
	const ABOUT = Object.freeze([
		'rapier-math is the math renderer inside Rapier: TeX to SVG, with the Latin Modern font inside. MIT licensed (the font: GUST Font License), no dependencies.',
		'It draws offline and at once, and also writes MathML for screen readers and Word.',
		'In your own site or app: npm install rapier-math, then import {render} from "rapier-math". render(tex).svg is the picture.']);
	const LINKS = Object.freeze([['rapier-math on GitHub', 'https://github.com/jackskip22/rapier-math'], ['rapier-math on npm', 'https://www.npmjs.com/package/rapier-math']]);
	let view = null;
	const make = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
	const anchor = (label, href) => { const link = make('a', '', label); link.href = href; link.target = '_blank'; link.rel = 'noopener'; return link; };
	const math = () => window.RapierMath && _rapierProviders.math?.status === 'ready' ? window.RapierMath : null;

	function about() {
		const list = _rapierInfoSheetShow('rapier-math', ABOUT);
		for (const [label, href] of LINKS) { const item = make('li'); item.append(anchor(label, href)); list.append(item); }
	}
	function build() {
		const root = make('div', 'rapier-jxl-view rapier-math-view'), title = make('div', 'rapier-jxl-view__title', 'Equation editor');
		root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Equation editor');
		const bar = make('div', 'rapier-jxl-view__bar'), shut = make('button', 'navigator-close');
		shut.type = 'button'; shut.setAttribute('aria-label', 'close');
		shut.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
		const info = make('button', 'settings-info-btn'), heading = make('div', 'rapier-jxl-view__heading');
		info.type = 'button'; info.setAttribute('aria-label', 'about rapier-math'); info.setAttribute('aria-haspopup', 'dialog');
		info.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
		heading.append(title, info);
		bar.append(heading, shut);
		const body = make('div', 'rapier-jxl-view__body');
		const note = make('p', 'rapier-jxl-view__note', 'Runs in Rapier, one offline HTML file. Nothing is uploaded.');
		const preview = make('div', 'rapier-math-view__preview'), said = make('p', 'rapier-jxl-view__note rapier-math-view__said');
		preview.setAttribute('aria-hidden', 'true'); said.setAttribute('role', 'status'); said.setAttribute('aria-live', 'polite');
		const tex = make('textarea', 'rapier-math-view__tex');
		tex.value = START; tex.rows = 3; tex.spellcheck = false; tex.setAttribute('aria-label', 'TeX');
		for (const [name, value] of [['autocapitalize', 'off'], ['autocomplete', 'off'], ['autocorrect', 'off'], ['enterkeyhint', 'enter']]) tex.setAttribute(name, value);
		const keys = make('div', 'math-strip__keys rapier-math-view__keys'), fix = make('button', 'math-strip__fix');
		keys.setAttribute('role', 'toolbar'); keys.setAttribute('aria-label', 'math keys');
		fix.type = 'button'; fix.hidden = true; keys.append(fix);
		for (const [label, text, back] of KEYS) {
			const key = make('button', '', label);
			key.type = 'button'; key.dataset.text = text; key.dataset.back = String(back); key.setAttribute('aria-label', 'type ' + text);
			keys.append(key);
		}
		const out = make('div', 'rapier-math-view__out'), actions = {};
		for (const [name, label] of [['word', 'Copy for Word'], ['picture', 'Copy picture'], ['svg', 'Download SVG'], ['png', 'Download PNG'], ['markdown', 'Copy Markdown'], ['open', 'Open in Rapier']]) {
			const button = make('button', 'settings-action-btn', label);
			button.type = 'button'; button.dataset.out = name; actions[name] = button; out.append(button);
		}
		body.append(note, preview, said, tex, keys, out, _rapierToolFooter('/math', 'rapier-math', 'rapier-math'));
		root.append(bar, body);
		return {root, shut, info, preview, said, tex, keys, fix, out, actions, good: '', inert: [], wasFocus: null};
	}

	function draw() {
		if (!view) return;
		const M = math(), source = view.tex.value;
		if (!M) return;
		const result = M.render(source, {displayMode: true, preview: true, caret: view.tex.selectionStart ?? source.length});
		const error = result.errors[0];
		if (!error && source.trim()) { view.preview.innerHTML = _rapierRenderModule('render-sanitize').sanitizeRapierHtml(result.svg, 'render'); view.good = source; }
		else if (!source.trim()) { view.preview.replaceChildren(); view.good = ''; }
		const whole = error ? null : M.render(source, {displayMode: true}).errors[0];
		const wrong = error || whole;
		view.said.textContent = wrong ? wrong.message : '';
		view.fix.hidden = !wrong?.suggestion;
		if (wrong?.suggestion) {
			view.fix.textContent = wrong.suggestion; view.fix._name = wrong.suggestion;
			view.fix._offset = wrong.offset; view.fix._length = 1 + (wrong.command || '').length;
			if (wrong.code === 'unsupported-environment') { view.fix._offset = source.indexOf('{', wrong.offset) + 1; view.fix._length = source.indexOf('}', view.fix._offset) - view.fix._offset; }
			view.fix.setAttribute('aria-label', 'use ' + wrong.suggestion);
		}
	}
	function type(text, back = 0, from = null, to = null) {
		const field = view.tex;
		field.focus({preventScroll: true});
		if (from !== null) field.setSelectionRange(from, to);
		if (!document.execCommand('insertText', false, text)) field.setRangeText(text, field.selectionStart, field.selectionEnd, 'end');
		const at = field.selectionStart - back;
		field.setSelectionRange(at, at);
		draw();
	}

	function file() {
		const M = math(), source = view.tex.value;
		if (!M || !source.trim()) { showToast('Type a formula first.', 'info'); return null; }
		const result = M.render(source, {displayMode: true});
		if (result.errors.length) { showToast('Fix the formula first.', 'error'); return null; }
		const svg = new DOMParser().parseFromString(result.svg, 'image/svg+xml').documentElement;
		const scale = /font-size:([\d.]+)em/.exec(svg.getAttribute('style') || '')?.[1] || 1;
		const em = name => Number(/^([\d.]+)em$/.exec(svg.getAttribute(name) || '')?.[1] || 0) * scale * EM;
		const width = Math.ceil(em('width')), height = Math.ceil(em('height'));
		svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height));
		svg.removeAttribute('style'); svg.setAttribute('color', '#000000');
		return {source, width, height, text: '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg) + '\n'};
	}
	function png(made) {
		return new Promise((resolve, reject) => {
			const image = new Image(), url = URL.createObjectURL(new Blob([made.text], {type: 'image/svg+xml'}));
			image.onload = () => {
				const canvas = document.createElement('canvas');
				canvas.width = made.width * PNG_SCALE; canvas.height = made.height * PNG_SCALE;
				canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
				URL.revokeObjectURL(url);
				canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Couldn’t draw the PNG.')), 'image/png');
			};
			image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Couldn’t draw the PNG.')); };
			image.src = url;
		});
	}
	function save(blob, name) {
		const link = make('a'), url = URL.createObjectURL(blob);
		link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 4000);
	}
	const markdown = source => '$$\n' + source.trim() + '\n$$\n';
	async function copy(text, done) {
		try { await navigator.clipboard.writeText(text); showToast(done, 'success'); }
		catch (_) { showToast('Couldn’t copy. Try again.', 'error'); }
	}
	async function take(name) {
		const M = math(), source = view.tex.value;
		if (!M) { const self = view; if (await ready(self) && view === self) draw(); return; }
		if (name === 'word') {
			if (!source.trim()) { showToast('Type a formula first.', 'info'); return; }
			const made = M.toMathML(source, {displayMode: true});
			if (made.status === 'refused') { showToast('Word can’t take this formula. Use Copy picture.', 'error'); return; }
			const tree = new DOMParser().parseFromString(made.mathml, 'application/xml').documentElement;
			for (const semantics of tree.querySelectorAll('semantics')) semantics.replaceWith(semantics.firstElementChild || '');
			for (const node of [tree, ...tree.querySelectorAll('*')]) for (const name of node.getAttributeNames()) if (name.startsWith('data-')) node.removeAttribute(name);
			await copy(new XMLSerializer().serializeToString(tree), 'Copied. Paste it into Word.');
		} else if (name === 'markdown') {
			if (!source.trim()) { showToast('Type a formula first.', 'info'); return; }
			await copy(markdown(source), 'Copied.');
		} else if (name === 'open') {
			if (!source.trim()) { showToast('Type a formula first.', 'info'); return; }
			close();
			await rapierLoad(markdown(source), 'equation.md');
		} else {
			const made = file();
			if (!made) return;
			if (name === 'svg') { save(new Blob([made.text], {type: 'image/svg+xml'}), 'equation.svg'); return; }
			try {
				if (name === 'png') { save(await png(made), 'equation.png'); return; }
				await navigator.clipboard.write([new ClipboardItem({'image/png': png(made)})]);
				showToast('Copied.', 'success');
			} catch (error) { showToast(_rapierErrorWords(error, 'Couldn’t copy the picture. Use Download PNG.'), 'error'); }
		}
	}

	const settled = provider => new Promise(resolve => {
		const heard = () => { if (provider.status !== 'checking' && provider.status !== 'downloading' && provider.status !== 'installing') { removeEventListener('rapier:mathplugin', heard); resolve(); } };
		addEventListener('rapier:mathplugin', heard);
		heard();
	});
	async function ready(self) {
		const provider = _rapierProviders.math;
		if (!provider) return false;
		provider.request();
		await settled(provider);
		if (math()) return true;
		if (view !== self) return false;
		const popup = _rapierProgressOpen({label: 'Downloading Rapier Math'});
		const follow = ({detail: {status, progress}}) => {
			if (status === 'downloading') popup.set(progress > 0 ? progress : null, 'Downloading Rapier Math' + (progress > 0 ? ' · ' + Math.floor(progress * 100) + '%' : ''));
			else if (status === 'installing') popup.set(null, 'Starting Rapier Math');
		};
		addEventListener('rapier:mathplugin', follow);
		try { await provider.install(); }
		catch (error) { showToast(_rapierErrorWords(error, 'Couldn’t download Rapier Math.'), 'error'); }
		finally { removeEventListener('rapier:mathplugin', follow); popup.end(); }
		return !!math();
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
		if (typeof _rapierDoorPathMark === 'function') _rapierDoorPathMark('math', true);
		document.documentElement.classList.remove('rapier-math-start');
		const self = view;
		view.shut.addEventListener('click', close);
		view.info.addEventListener('click', about);
		view.tex.addEventListener('input', draw);
		view.tex.addEventListener('select', draw);
		view.tex.addEventListener('keyup', event => { if (/^(?:Arrow|Home|End|Page)/.test(event.key)) draw(); });
		view.tex.addEventListener('pointerup', draw);
		view.keys.addEventListener('pointerdown', event => event.preventDefault());
		view.keys.addEventListener('click', event => {
			const key = event.target.closest('button');
			if (!key || !view) return;
			if (key === view.fix) type(view.fix._name, 0, view.fix._offset, view.fix._offset + view.fix._length);
			else type(key.dataset.text, Number(key.dataset.back));
		});
		view.out.addEventListener('click', event => { const button = event.target.closest('button[data-out]'); if (button) void take(button.dataset.out); });
		root.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
		view.tex.focus({preventScroll: true});
		view.tex.setSelectionRange(view.tex.value.length, view.tex.value.length);
		void ready(self).then(on => {
			if (view !== self) return;
			if (on) draw();
			else view.said.textContent = 'Not drawn: needs Rapier Math.';
		});
	}
	function close() {
		if (!view) return;
		const done = view;
		view = null;
		if (done.notices?.root.parentElement === done.root) done.notices.home.append(done.notices.root);
		done.root.remove();
		for (const node of done.inert) node.inert = false;
		if (typeof _rapierDoorPathMark === 'function') _rapierDoorPathMark('math', false);
		try { done.wasFocus?.focus({preventScroll: true}); } catch (_) {}
	}
	const face = Object.freeze({open, close, get state() { return Object.freeze({open: !!view}); }});
	_rapierMathPart = face;
	if (_rapierMathDoor?.born) _rapierBootFactsPublished.then(open, open);
})();
