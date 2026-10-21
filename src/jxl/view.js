// SPDX-License-Identifier: AGPL-3.0-only
(() => {
	const C = globalThis.RapierJxlConvert;
	const LANES = 2;
	let view = null;
	const make = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
	const size = bytes => bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + ' KB' : bytes < 1073741824 ? (bytes / 1048576).toFixed(bytes < 10485760 ? 2 : 1) + ' MB' : (bytes / 1073741824).toFixed(2) + ' GB';
	const percent = row => { const change = Math.round((1 - row.after / row.before) * 100); return change > 0 ? change + '% smaller' : change < 0 ? -change + '% larger' : 'same size'; };

	const anchor = (label, href) => { const link = make('a', '', label); link.href = href; link.target = '_blank'; link.rel = 'noopener'; return link; };
	function about() {
		const list = _rapierInfoSheetShow('rapier-jxl', C.ABOUT);
		for (const [label, href] of C.LINKS) { const item = make('li'); item.append(anchor(label, href)); list.append(item); }
	}
	function build() {
		const root = make('div', 'rapier-jxl-view'), title = make('div', 'rapier-jxl-view__title', 'JPEG XL');
		root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'JPEG XL converter');
		const bar = make('div', 'rapier-jxl-view__bar'), shut = make('button', 'navigator-close');
		shut.type = 'button'; shut.setAttribute('aria-label', 'close');
		shut.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
		const info = make('button', 'settings-info-btn'), heading = make('div', 'rapier-jxl-view__heading');
		info.type = 'button'; info.setAttribute('aria-label', 'about rapier-jxl'); info.setAttribute('aria-haspopup', 'dialog');
		info.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
		heading.append(title, info);
		bar.append(heading, shut);
		const body = make('div', 'rapier-jxl-view__body');
		const note = make('p', 'rapier-jxl-view__note', 'Runs in Rapier, one offline HTML file. Your files never leave your device.');
		const pick = make('label', 'settings-action-btn rapier-jxl-view__pick'), input = make('input');
		pick.append(make('span', '', 'Choose or drop pictures or videos'), input);
		input.type = 'file'; input.accept = 'image/*,video/*'; input.multiple = true;
		const quality = make('p', 'rapier-jxl-view__note', 'Quality for pictures, animations and videos (videos start at high). JPEGs keep every bit when they can.'), group = make('div', 'theme-switcher theme-switcher--joined theme-switcher--onoff');
		quality.id = 'rapier-jxl-quality'; group.setAttribute('role', 'radiogroup'); group.setAttribute('aria-labelledby', quality.id);
		const modes = Object.keys(C.QUALITY).map((mode, at) => {
			const button = make('button', 'theme-switcher__btn onoff-btn', mode);
			button.type = 'button'; button.dataset.mode = mode; button.setAttribute('role', 'radio'); button.setAttribute('aria-checked', String(at === 0));
			button.toggleAttribute('data-active', at === 0);
			return button;
		});
		group.append(...modes);
		const status = make('div', 'rapier-jxl-view__status'), line = make('div', 'rapier-progress__bar rapier-jxl-view__line'), cancel = make('button', 'settings-action-btn', 'Cancel');
		cancel.type = 'button'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
		const summary = make('div', 'rapier-jxl-view__summary'), count = make('div', 'rapier-jxl-view__count');
		summary.append(count, cancel);
		const list = make('ul', 'rapier-jxl-view__list'), all = make('button', 'settings-action-btn rapier-jxl-view__all', 'Download all as zip');
		all.type = 'button';
		const help = make('p', 'rapier-jxl-view__note'), links = make('p', 'rapier-jxl-view__note rapier-jxl-view__links');
		links.append(...C.LINKS.flatMap(([label, href], at) => [...(at ? [' · '] : []), anchor(label, href)]));
		body.append(note, pick, quality, group, line, summary, help, list, all, links);
		root.append(bar, body);
		return {info, root, shut, input, group, modes, line, count, cancel, list, all, help, pick, rows: [], mode: 'lossless', touched: false, running: false, controller: null, inert: [], wasFocus: null};
	}

	function paint(row) {
		const note = row.node.querySelector('.rapier-jxl-view__row-note'), download = row.node.querySelector('.rapier-jxl-view__row-download');
		let text = '';
		if (row.state === 'waiting') text = size(row.file.size) + ' · waiting';
		else if (row.state === 'working') text = size(row.file.size) + (row.say ? ' · ' + row.say : '') + (row.progress > 0 && row.progress < 1 ? ' · ' + Math.round(row.progress * 100) + '%' : '');
		else if (row.state === 'failed' || row.state === 'stopped') text = row.say;
		else if (row.frames) text = size(row.before) + ' → ' + size(row.after) + (row.video ? '' : ' · ' + percent(row)) + C.mediaNote(row) + (row.video && row.mode !== 'lossless' && view?.mode === 'lossless' ? ' · ' + row.mode : '');
		else text = size(row.before) + ' → ' + size(row.after) + ' · ' + percent(row) + (row.exact ? ' · restores your JPEG exactly' : row.fallback ? ' · made lossless: this browser could not open the smaller file' : row.jpeg ? (row.before > C.CARRY_BYTES ? ' · over ' + C.CARRY_BYTES / 1048576 + ' MB, so made from its pixels' : ' · made from its pixels, not bit for bit') : row.note === 'bits8' ? ' · kept at 8 bits' : row.note === 'colors' ? ' · converted to sRGB' : row.mode === 'lossless' ? ' · every pixel kept' : '') + (row.refused ? ' · this browser cannot open this file' : '');
		note.textContent = text;
		download.hidden = row.state !== 'done';
	}
	function overall(of = view) {
		if (!of) return;
		const rows = of.rows, done = rows.filter(row => row.state === 'done'), settled = rows.filter(row => row.state !== 'waiting' && row.state !== 'working').length;
		const working = rows.some(row => row.state === 'working' || row.state === 'waiting');
		let fraction = rows.length ? (settled + rows.filter(row => row.state === 'working').reduce((sum, row) => sum + (row.progress || 0), 0)) / rows.length : 0;
		of.line.style.setProperty('--rapier-progress', String(Math.min(1, fraction)));
		of.line.hidden = !working;
		const before = done.reduce((sum, row) => sum + row.before, 0), after = done.reduce((sum, row) => sum + row.after, 0);
		of.count.textContent = !rows.length ? '' : (working ? settled + ' of ' + rows.length + ' · ' : done.length + ' of ' + rows.length + ' converted · ') + (done.length ? size(before) + ' → ' + size(after) : '');
		of.cancel.hidden = !of.running;
		of.all.hidden = done.length < 2;
	}

	const PART = 'jxlcomplete', held = () => ['ready', 'carried', 'stored'].includes(RapierParts.status(PART)?.status);
	function completeFor(self, row) {
		return async () => {
			if (!held()) await RapierParts.check(PART).catch(() => {});
			if (held()) return;
			if (self.declined) throw Object.assign(new Error('Not converted: needs JPEG XL complete'), {shown: true});
			self.asking ||= (async () => {
				const bytes = RapierParts.pin(PART)?.bytes || 0;
				const yes = await rapierConfirm({title: 'Download JPEG XL complete?', message: '• ' + size(bytes) + ', once.\n• Converts videos and animations.\n• Works offline after.', confirmLabel: 'download', plain: true}) === true;
				if (!yes) { self.declined = true; return false; }
				const popup = _rapierProgressOpen({label: 'Downloading JPEG XL complete'});
				const follow = ({detail: {id, status, progress}}) => {
					if (id !== PART) return;
					if (status === 'downloading') popup.set(progress > 0 ? progress : null, 'Downloading JPEG XL complete' + (progress > 0 ? ' · ' + Math.floor(progress * 100) + '%' : ''));
					else if (status === 'installing') popup.set(null, 'Starting JPEG XL complete');
				};
				addEventListener('rapier:part', follow);
				try { await RapierParts.need(PART); }
				catch (error) { popup.end(); throw error; }
				finally { removeEventListener('rapier:part', follow); }
				self.follow = {row, popup}; follow1(self, row);
				return true;
			})().finally(() => { self.asking = null; });
			if (!await self.asking && !held()) throw Object.assign(new Error('Not converted: needs JPEG XL complete'), {shown: true});
		};
	}
	function follow1(self, row) {
		const follow = self.follow;
		if (!follow || follow.row !== row) return;
		if (row.state === 'working') follow.popup.set(row.progress > 0 && row.progress < 1 ? row.progress : null, 'Converting ' + row.name + (row.say ? ' · ' + row.say : ''));
		else { follow.popup.end(); self.follow = null; }
	}

	async function run() {
		const self = view;
		if (!self || self.running) return;
		self.running = true; self.controller = new AbortController();
		const signal = self.controller.signal;
		let out = false;
		const lane = async () => {
			while (!out && !signal.aborted) {
				const row = self.rows.find(each => each.state === 'waiting');
				if (!row) return;
				row.state = 'working'; row.progress = 0; row.say = ''; row.stop = new AbortController(); paint(row); overall(self);
				try {
					const made = await C.convert(row.file, {mode: self.mode, videoMode: self.touched ? self.mode : 'high', complete: completeFor(self, row), signal: AbortSignal.any([signal, row.stop.signal]), say: text => { row.say = text; paint(row); follow1(self, row); }, progress: value => { row.progress = value; paint(row); overall(self); follow1(self, row); }});
					Object.assign(row, made); row.after = made.size; row.state = 'done';
				} catch (error) {
					if (error?.name === 'AbortError') { row.state = 'stopped'; row.say = 'Canceled'; }
					else if (C.exhausted(error)) {
						out = true; row.state = 'stopped'; row.say = 'Not converted: this device ran out of memory';
						self.help.textContent = 'This device ran out of memory. The files that finished are kept; choose the rest again, a few at a time.';
					} else { row.state = 'failed'; row.say = C.refusal(error, row.file); }
				}
				row.stop = null;
				if (row.removed) row.blob = null;
				paint(row); overall(self); follow1(self, row);
			}
		};
		try { await Promise.all(Array.from({length: LANES}, lane)); }
		finally {
			for (const row of self.rows) if (row.state === 'waiting') { row.state = 'stopped'; row.say = signal.aborted ? 'Canceled' : 'Not converted'; paint(row); }
			self.running = false; self.controller = null; overall(self);
			if (!signal.aborted) document.getElementById('sr-live')?.replaceChildren(document.createTextNode(self.rows.filter(row => row.state === 'done').length + ' files converted'));
		}
	}

	function add(files) {
		if (!view || !files.length) return;
		view.help.textContent = '';
		const fragment = document.createDocumentFragment();
		for (const file of files) {
			const row = {file, state: 'waiting', progress: 0, say: ''};
			const node = make('li', 'rapier-jxl-view__row'), text = make('div', 'rapier-jxl-view__row-text'), actions = make('div', 'rapier-jxl-view__row-actions');
			const download = make('button', 'settings-action-btn rapier-jxl-view__row-download', 'Download'), remove = make('button', 'navigator-close');
			text.append(make('div', 'rapier-jxl-view__row-name', file.name), make('div', 'rapier-jxl-view__row-note'));
			download.type = 'button'; download.hidden = true; remove.type = 'button'; remove.setAttribute('aria-label', 'Remove ' + file.name);
			remove.innerHTML = view.shut.innerHTML;
			download.addEventListener('click', () => save(row.blob, C.outputName(row.name || file.name)));
			remove.addEventListener('click', () => {
				if (row.state === 'working') { row.removed = true; row.stop?.abort(); }
				const at = view.rows.indexOf(row);
				view.rows.splice(at, 1); node.remove(); row.blob = null; overall();
				(view.list.children[at]?.querySelector('.navigator-close') || view.pick.querySelector('input'))?.focus();
			});
			actions.append(download, remove); node.append(text, actions); fragment.append(node);
			row.node = node; view.rows.push(row); row.name = file.name; paint(row);
		}
		view.list.append(fragment); overall(); void run();
	}
	function save(blob, name) {
		const link = make('a'), url = URL.createObjectURL(blob);
		link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 4000);
	}
	function saveAll() {
		const taken = new Set(), done = view.rows.filter(row => row.state === 'done').map(row => ({name: C.outputName(row.name, taken), blob: row.blob, crc: row.crc, size: row.size}));
		const zips = C.zipSeries(done);
		zips.forEach((zip, at) => setTimeout(() => save(zip.blob, zips.length === 1 ? 'rapier-jxl.zip' : 'rapier-jxl-' + (at + 1) + '.zip'), at * 600));
	}

	function open() {
		if (view) return;
		if (!_rapierJxlEncoderPresent()) { showToast('This copy of Rapier has no JPEG XL encoder.', 'error'); return; }
		view = build();
		const {root} = view;
		view.wasFocus = document.activeElement;
		for (const node of document.body.children) if (!node.inert && node.id !== 'toast-root' && node.id !== 'sr-live') { node.inert = true; view.inert.push(node); }
		document.body.append(root);
		const notices = document.getElementById('toast-root');
		if (notices) { view.notices = {root: notices, home: notices.parentElement}; root.append(notices); if (typeof _rapierScheduleToastLift === 'function') _rapierScheduleToastLift(); }
		if (typeof _rapierDoorPathMark === 'function') _rapierDoorPathMark('jxl', true);
		document.documentElement.classList.remove('rapier-jxl-start');
		view.input.addEventListener('change', () => { add([...view.input.files]); view.input.value = ''; });
		view.shut.addEventListener('click', close);
		view.info.addEventListener('click', about);
		view.cancel.addEventListener('click', () => view.controller?.abort());
		view.all.addEventListener('click', saveAll);
		for (const button of view.modes) button.addEventListener('click', () => {
			if (button.dataset.mode === view.mode) return;
			view.mode = button.dataset.mode; view.touched = true;
			for (const each of view.modes) { const on = each === button; each.toggleAttribute('data-active', on); each.setAttribute('aria-checked', String(on)); }
			for (const row of view.rows) if (!row.exact && row.state !== 'working') { row.state = 'waiting'; row.blob = null; paint(row); }
			void run();
		});
		view.group.addEventListener('keydown', event => {
			const step = {ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1}[event.key];
			if (!step) return;
			const at = view.modes.findIndex(button => button.hasAttribute('data-active')), next = view.modes[(at + step + view.modes.length) % view.modes.length];
			event.preventDefault(); next.click(); next.focus();
		});
		root.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
		root.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); view.pick.toggleAttribute('data-over', true); } });
		root.addEventListener('dragleave', event => { if (!root.contains(event.relatedTarget)) view.pick.removeAttribute('data-over'); });
		root.addEventListener('drop', event => { if (!event.dataTransfer?.files.length) return; event.preventDefault(); view.pick.removeAttribute('data-over'); add([...event.dataTransfer.files]); });
		root.addEventListener('paste', event => { const files = [...event.clipboardData?.files || []].filter(file => /^(image|video)\//.test(file.type)); if (files.length) { event.preventDefault(); add(files); } });
		overall();
		view.pick.querySelector('input').focus({preventScroll: true});
	}
	function close() {
		if (!view) return;
		view.controller?.abort();
		const done = view;
		view = null;
		done.follow?.popup.end();
		for (const row of done.rows) row.blob = null;
		if (done.notices?.root.parentElement === done.root) done.notices.home.append(done.notices.root);
		done.root.remove();
		for (const node of done.inert) node.inert = false;
		if (typeof _rapierDoorPathMark === 'function') _rapierDoorPathMark('jxl', false);
		try { done.wasFocus?.focus({preventScroll: true}); } catch (_) {}
	}
	const face = Object.freeze({open, close, get state() { return Object.freeze({open: !!view}); }});
	_rapierJxlPart = face;
	if (_rapierJxlDoor?.born) _rapierBootFactsPublished.then(open, open);
})();
