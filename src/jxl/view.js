// SPDX-License-Identifier: AGPL-3.0-only
(() => {
	const C = globalThis.RapierJxlConvert;
	const LANES = 2;
	const QUALITY_WORDS = Object.freeze({lossless: 'Lossless', high: 'High', smaller: 'Medium'});
	const START_MODE = 'high';
	let view = null;
	const make = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
	const size = bytes => bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + ' KB' : bytes < 1073741824 ? (bytes / 1048576).toFixed(bytes < 10485760 ? 2 : 1) + ' MB' : (bytes / 1073741824).toFixed(2) + ' GB';
	const percent = r => { const change = Math.round((1 - r.size / r.before) * 100); return change > 0 ? change + '% smaller' : change < 0 ? -change + '% larger' : 'same size'; };

	const anchor = (label, href) => { const link = make('a', '', label); link.href = href; link.target = '_blank'; link.rel = 'noopener'; return link; };
	function about() {
		const list = _rapierInfoSheetShow('rapier-jxl', C.ABOUT);
		for (const [label, href] of C.LINKS) { const item = make('li'); item.append(anchor(label, href)); list.append(item); }
	}
	function build() {
		const root = make('div', 'rapier-jxl-view'), title = make('div', 'rapier-jxl-view__title', 'JPEG XL converter');
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
		const localNote = () => {
			const node = make('p', 'rapier-jxl-view__note rapier-jxl-view__note--center');
			node.append(document.createTextNode(C.LOCAL_NOTE[0]), document.createElement('br'), document.createTextNode(C.LOCAL_NOTE[1]));
			return node;
		};
		const pick = make('label', 'settings-action-btn rapier-jxl-view__pick'), input = make('input');
		pick.append(C.pickLabel(make('span')), input);
		input.type = 'file'; input.accept = 'image/*,video/*,.jxl'; input.multiple = true;
		const group = make('div', 'theme-switcher theme-switcher--joined theme-switcher--onoff');
		group.setAttribute('role', 'radiogroup'); group.setAttribute('aria-label', 'Quality');
		const modes = Object.keys(C.QUALITY).map(mode => {
			const button = make('button', 'theme-switcher__btn onoff-btn', QUALITY_WORDS[mode]);
			button.type = 'button'; button.dataset.mode = mode; button.setAttribute('role', 'radio'); button.setAttribute('aria-checked', String(mode === START_MODE));
			button.toggleAttribute('data-active', mode === START_MODE);
			return button;
		});
		group.append(...modes);
		const switchOf = (label, cls) => { const node = make('div', 'theme-switcher theme-switcher--joined theme-switcher--onoff' + (cls ? ' ' + cls : '')); if (label) { node.setAttribute('role', 'radiogroup'); node.setAttribute('aria-label', label); } return node; };
		const choose = (text, cls) => { const button = make('button', 'theme-switcher__btn onoff-btn' + (cls ? ' ' + cls : ''), text); button.type = 'button'; return button; };
		const quick = make('div', 'rapier-jxl-view__quick'), openers = switchOf('', 'rapier-jxl-view__openers');
		const qualityOpen = choose(''), effortOpen = choose('');
		for (const opener of [qualityOpen, effortOpen]) { opener.setAttribute('aria-haspopup', 'true'); opener.setAttribute('aria-expanded', 'false'); }
		openers.append(qualityOpen, effortOpen);
		const qualityDrop = switchOf('Quality', 'rapier-jxl-view__drop'), effortDrop = switchOf('Effort', 'rapier-jxl-view__drop');
		for (const mode of Object.keys(C.QUALITY)) { const button = choose(QUALITY_WORDS[mode]); button.dataset.mode = mode; button.setAttribute('role', 'radio'); qualityDrop.append(button); }
		for (let level = C.EFFORT.min; level <= C.EFFORT.max; level++) { const button = choose(String(level)); button.dataset.effort = String(level); button.setAttribute('role', 'radio'); effortDrop.append(button); }
		qualityDrop.hidden = effortDrop.hidden = true;
		quick.append(openers, qualityDrop, effortDrop);
		const effortRow = make('div', 'rapier-jxl-view__effort'), slider = make('input'), seek = make('span', 'rapier-draw-seek'), track = make('span', 'rapier-draw-seek-track'), head = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle'), level = make('output', 'rapier-jxl-view__effort-level');
		effortRow.setAttribute('role', 'group'); effortRow.setAttribute('aria-label', 'Effort');
		slider.type = 'range'; slider.min = String(C.EFFORT.min); slider.max = String(C.EFFORT.max); slider.step = '1'; slider.value = String(C.EFFORT.start); slider.setAttribute('aria-label', 'Effort');
		track.setAttribute('aria-hidden', 'true'); head.setAttribute('class', 'rapier-draw-seek-head'); head.setAttribute('viewBox', '0 0 24 24'); head.setAttribute('aria-hidden', 'true');
		for (const [name, value] of [['cx', '12'], ['cy', '12'], ['r', '10']]) ring.setAttribute(name, value);
		head.append(ring); seek.append(track, head, level, slider);
		effortRow.classList.add('rapier-jxl-view__effort--range');
		effortRow.append(make('span', 'rapier-jxl-view__end', 'Fast'), seek, make('span', 'rapier-jxl-view__end', 'Small'));
		const quality = make('div', 'rapier-jxl-view__part'), effort = make('div', 'rapier-jxl-view__part');
		quality.append(make('p', 'rapier-jxl-view__label', 'Quality:'), group);
		quality.classList.add('rapier-jxl-view__full'); effort.classList.add('rapier-jxl-view__full');
		const effortLabel = make('p', 'rapier-jxl-view__label', 'Effort:');
		effort.append(effortLabel, effortRow);
		C.liftToLabel(seek, level, effortLabel);
		const status = make('div', 'rapier-jxl-view__status'), line = make('div', 'rapier-progress__bar rapier-jxl-view__line'), cancel = make('button', 'settings-action-btn', 'Cancel');
		cancel.type = 'button'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
		const summary = make('div', 'rapier-jxl-view__summary'), count = make('div', 'rapier-jxl-view__count');
		summary.append(count, cancel);
		const list = make('ul', 'rapier-jxl-view__list'), all = make('button', 'settings-action-btn rapier-jxl-view__all', 'Download all as zip');
		all.type = 'button';
		const help = make('p', 'rapier-jxl-view__note');
		const files = make('div', 'rapier-jxl-view__files');
		files.append(line, summary, help, list, all);
		const fold = make('div', 'rapier-jxl-view__fold');
		fold.append(pick, files, quick, quality, effort, _rapierToolFooter('/jxl', 'rapier-jxl', 'rapier-jxl', false, C.LINKS.slice(2)));
		const more = make('section', 'rapier-jxl-view__more'), moreTitle = make('h2', 'rapier-jxl-view__title', C.COMPARE.title), facts = make('ul', 'rapier-jxl-view__facts');
		moreTitle.id = 'rapier-jxl-compare'; more.setAttribute('aria-labelledby', moreTitle.id);
		for (const fact of C.COMPARE.lines) facts.append(make('li', 'rapier-jxl-view__note', fact));
		more.append(moreTitle, facts, make('p', 'rapier-jxl-view__note', C.COMPARE.basis));
		const scene = make('section', 'rapier-jxl-view__more'), sceneTitle = make('h2', 'rapier-jxl-view__title', C.SCENE.title), stage = make('div', 'rapier-jxl-scene__stage');
		sceneTitle.id = 'rapier-jxl-scene'; scene.setAttribute('aria-labelledby', sceneTitle.id);
		scene.append(sceneTitle, make('p', 'rapier-jxl-view__note', C.SCENE.note), stage);
		const example = make('section', 'rapier-jxl-view__more'), exampleTitle = make('h2', 'rapier-jxl-view__title', C.EXAMPLE.title), exampleSlot = make('div', 'rapier-jxl-view__example rapier-jxl-view__example--full');
		const exampleNote = make('p', 'rapier-jxl-view__note');
		exampleTitle.id = 'rapier-jxl-example'; example.setAttribute('aria-labelledby', exampleTitle.id);
		exampleNote.classList.add('rapier-jxl-view__note--center');
		example.append(exampleTitle, exampleSlot, exampleNote, localNote(), make('p', 'rapier-jxl-view__note rapier-jxl-view__note--center', C.EXAMPLE.credit));
		_rapierJxlMakerPart.tabs(body, [fold, example, more, scene, _rapierToolAlso('/jxl')]);
		root.append(bar, body);
		return {info, root, shut, input, group, modes, quick: {root: quick, qualityOpen, effortOpen, qualityDrop, effortDrop}, effort: C.EFFORT.start, slider, seek, level, line, count, cancel, list, all, help, pick, scene, stage, example, exampleSlot, exampleNote, rows: [], mode: START_MODE, running: false, controller: null, inert: [], wasFocus: null};
	}

	function paint(row) {
		const note = row.node.querySelector('.rapier-jxl-view__row-note'), download = row.node.querySelector('.rapier-jxl-view__row-download');
		let text = '';
		const r = row.result;
		if (row.state === 'waiting') text = size(row.file.size) + ' · waiting';
		else if (row.state === 'working') text = size(row.file.size) + (row.say ? ' · ' + row.say : '') + (row.progress > 0 && row.progress < 1 ? ' · ' + Math.round(row.progress * 100) + '%' : '');
		else if (row.state === 'failed' || row.state === 'stopped') text = row.say;
		else if (r.back) text = size(r.before) + ' → ' + size(r.size);
		else if (r.frames) text = size(r.before) + ' → ' + size(r.size) + (r.video ? '' : ' · ' + percent(r)) + C.mediaNote(r);
		else text = size(r.before) + ' → ' + size(r.size) + ' · ' + percent(r) + (r.exact ? ' · restores your JPEG exactly' + (r.exactKept ? ' · lossy is no smaller' : '') : r.fallback ? ' · made lossless: this browser could not open the smaller file' : r.jpeg ? (r.before > C.CARRY_BYTES ? ' · over ' + C.CARRY_BYTES / 1048576 + ' MB, so made from its pixels' : ' · ' + (r.mode === 'lossless' ? 'made from its pixels, so the JPEG can\'t be restored' : 'lossy')) : r.note === 'bits8' ? ' · kept at 8 bits' : r.note === 'colors' ? ' · converted to sRGB' : r.mode === 'lossless' ? ' · lossless' : '') + (r.refused ? ' · this browser cannot open this file' : '');
		note.textContent = text;
		download.hidden = row.state !== 'done';
		media(row);
	}
	function media(row) {
		const r = row.state === 'done' && row.result?.frames && !row.result.back ? row.result : null;
		if (row.shown?.result === r) return;
		row.shown?.node.remove(); row.shown?.end(); row.shown = null;
		if (!r) return;
		row.shown = {...C.showMade(r.blob, 'rapier-jxl-view__media', row.outputName), result: r};
		row.node.append(row.shown.node);
	}
	function overall(of = view) {
		if (!of) return;
		const rows = of.rows, done = rows.filter(row => row.state === 'done'), settled = rows.filter(row => row.state !== 'waiting' && row.state !== 'working').length;
		const working = rows.some(row => row.state === 'working' || row.state === 'waiting');
		let fraction = rows.length ? (settled + rows.filter(row => row.state === 'working').reduce((sum, row) => sum + (row.progress || 0), 0)) / rows.length : 0;
		of.line.style.setProperty('--rapier-progress', String(Math.min(1, fraction)));
		of.line.hidden = !working;
		const before = done.reduce((sum, row) => sum + row.result.before, 0), after = done.reduce((sum, row) => sum + row.result.size, 0);
		of.count.textContent = !rows.length ? '' : (working ? settled + ' of ' + rows.length + ' · ' : done.length + ' of ' + rows.length + ' converted · ') + (done.length ? size(before) + ' → ' + size(after) : '');
		of.cancel.hidden = !of.running;
		of.all.hidden = done.length < 2;
	}

	const PART = 'jxlcomplete', held = () => ['ready', 'carried', 'stored'].includes(RapierParts.status(PART)?.status);
	const unavailable = error => Object.assign(new Error(/^Google Play /.test(String(error?.message)) ? error.message : _rapierErrorWords(error, 'Not converted: needs JPEG XL complete')), {shown: true});
	function completeFor(self, row) {
		return async () => {
			if (!held()) await RapierParts.check(PART).catch(() => {});
			if (RapierParts.status(PART)?.status === 'carried') { await _rapierPartWait(PART).catch(error => { throw unavailable(error); }); return; }
			if (held()) return;
			if (self.declined) throw Object.assign(new Error('Not converted: needs JPEG XL complete'), {shown: true});
			self.asking ||= (async () => {
				const bytes = RapierParts.pin(PART)?.bytes || 0;
				const yes = await rapierConfirm({title: 'Download JPEG XL complete?', message: '• ' + size(bytes) + ', once.\n• Converts videos and animations.\n• Works offline after.', confirmLabel: 'Download', plain: true}) === true;
				if (!yes) { self.declined = true; return false; }
				const popup = _rapierProgressOpen({label: 'Downloading JPEG XL complete'});
				const follow = ({detail: {id, status, progress}}) => {
					if (id !== PART) return;
					if (status === 'downloading') popup.set(progress > 0 ? progress : null, 'Downloading JPEG XL complete' + (progress > 0 ? ' · ' + Math.floor(progress * 100) + '%' : ''));
					else if (status === 'installing') popup.set(null, 'Starting JPEG XL complete');
				};
				addEventListener('rapier:part', follow);
				try { await RapierParts.need(PART); }
				catch (error) { popup.end(); throw unavailable(error); }
				finally { removeEventListener('rapier:part', follow); }
				if (row) { self.follow = {row, popup}; follow1(self, row); } else popup.end();
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
					const key = keyOf(self), mode = self.mode, effort = self.effort;
					const made = await C.convert(row.file, {mode, effort, complete: completeFor(self, row), signal: AbortSignal.any([signal, row.stop.signal]), say: text => { row.say = text; paint(row); follow1(self, row); }, progress: value => { row.progress = value; paint(row); overall(self); follow1(self, row); }});
					const {also, ...kept} = made;
					row.results.set(key, kept);
					if (also) row.results.set('lossless|' + effort, also);
					if (kept.ext && !row.outputName.toLowerCase().endsWith(kept.ext)) row.outputName = C.outputName(row.file.name, new Set(self.rows.filter(other => other !== row).map(other => other.outputName.toLowerCase())), kept.ext);
					const now = row.results.get(keyOf(self));
					if (now) { row.result = now; row.state = 'done'; } else row.state = 'waiting';
				} catch (error) {
					if (error?.name === 'AbortError') { row.state = 'stopped'; row.say = 'Canceled'; }
					else if (error?.code === 'IMAGE_CANCELLED' && (row.again = (row.again || 0) + 1) <= 3) row.state = 'waiting';
					else if (C.exhausted(error)) {
						out = true; row.state = 'stopped'; row.say = 'Not converted: this device ran out of memory';
						self.help.textContent = 'This device ran out of memory. The files that finished are kept; choose the rest again, a few at a time.';
					} else { row.state = 'failed'; row.say = C.refusal(error, row.file); }
				}
				row.stop = null;
				if (row.removed) row.results.clear();
				paint(row); overall(self); follow1(self, row);
			}
		};
		try { await Promise.all(Array.from({length: LANES}, lane)); }
		finally {
			for (const row of self.rows) if (row.state === 'waiting') { row.state = 'stopped'; row.say = signal.aborted ? 'Canceled' : 'Not converted'; paint(row); }
			self.running = false; self.controller = null; overall(self);
			if (!signal.aborted) document.getElementById('sr-live')?.replaceChildren(document.createTextNode(self.rows.filter(row => row.state === 'done').length + ' files converted'));
			if (!signal.aborted) try { self.settled?.(self.rows.map(row => ({file: row.file, name: row.name, state: row.state, say: row.say, before: row.result?.before, size: row.result?.size}))); } catch (_) {}
		}
	}

	const keyOf = of => of.mode + '|' + of.effort;
	function remake() {
		for (const row of view.rows) {
			if (row.state === 'working') continue;
			const hit = row.results.get(keyOf(view));
			if (hit) { row.result = hit; row.state = 'done'; } else row.state = 'waiting';
			paint(row);
		}
		overall(); void run();
	}
	function seekTo(of) {
		const {min, max} = C.EFFORT, value = C.effortOf(of.slider.value);
		of.seek.style.setProperty('--seek-frac', String((value - min) / (max - min)));
		of.level.textContent = String(value);
		of.slider.setAttribute('aria-valuetext', 'Effort ' + value);
	}

	function add(files) {
		if (!view || !files.length) return;
		view.help.textContent = '';
		const fragment = document.createDocumentFragment();
		for (const file of files) {
			const row = {file, state: 'waiting', progress: 0, say: '', results: new Map(), result: null};
			const node = make('li', 'rapier-jxl-view__row'), text = make('div', 'rapier-jxl-view__row-text'), actions = make('div', 'rapier-jxl-view__row-actions');
			const download = make('button', 'settings-action-btn rapier-jxl-view__row-download', 'Download'), remove = make('button', 'navigator-close');
			text.append(make('div', 'rapier-jxl-view__row-name', file.name), make('div', 'rapier-jxl-view__row-note'));
			download.type = 'button'; download.hidden = true; remove.type = 'button'; remove.setAttribute('aria-label', 'Remove ' + file.name);
			remove.innerHTML = view.shut.innerHTML;
			download.addEventListener('click', () => save(row.result.blob, row.outputName));
			remove.addEventListener('click', () => {
				if (row.state === 'working') { row.removed = true; row.stop?.abort(); }
				const at = view.rows.indexOf(row);
				view.rows.splice(at, 1); node.remove(); row.shown?.end(); row.results.clear(); row.result = null; overall();
				(view.list.children[at]?.querySelector('.navigator-close') || view.pick.querySelector('input'))?.focus();
			});
			actions.append(download, remove); node.append(text, actions); fragment.append(node);
			row.node = node; row.name = file.name; row.outputName = C.outputName(file.name, new Set(view.rows.map(other => other.outputName.toLowerCase()))); view.rows.push(row); paint(row);
		}
		view.list.append(fragment); overall(); void run();
	}
	async function save(blob, name) {
		if (typeof window.RapierMcpApp?.saveFile === 'function') {
			if (!await window.RapierMcpApp.saveFile(blob, name)) showToast('Couldn’t save ' + name, 'error');
			return;
		}
		if (typeof window.RapierPlatform?.files?.exportArtifact !== 'function') {
			const link = make('a'), url = URL.createObjectURL(blob);
			link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
			setTimeout(() => URL.revokeObjectURL(url), 4000);
			return;
		}
		const place = {}, saved = await _download(blob, name, place);
		if (saved === null) showToast('Couldn’t save ' + name, 'error');
		else if (saved === true && place.where) showToast('Saved ' + (place.name || name) + place.where, 'success');
	}
	function saveAll() {
		const done = view.rows.filter(row => row.state === 'done').map(row => ({name: row.outputName, blob: row.result.blob, crc: row.result.crc, size: row.result.size}));
		const zips = C.zipSeries(done);
		void (async () => { for (const [at, zip] of zips.entries()) {
			if (at) await new Promise(next => setTimeout(next, 600));
			await save(zip.blob, zips.length === 1 ? 'rapier-jxl.zip' : 'rapier-jxl-' + (at + 1) + '.zip');
		} })();
	}

	function adopt(fresh) {
		const early = document.querySelector('[data-rapier-early-part="jxl"]');
		if (!early) return fresh;
		early._rapierEarlyRetire?.();
		const chosen = [...early.querySelector('input[type="file"]')?.files || []];
		early.remove();
		fresh.chosen = chosen;
		for (const sheet of document.querySelectorAll('style[data-rapier-early-sheet]')) sheet.remove();
		const held = [early, ...early.querySelectorAll('[data-rapier-early-inert]')];
		for (const node of held) { node.inert = false; delete node.dataset.rapierEarlyInert; }
		early.removeAttribute('data-rapier-early-part');
		for (const node of early.querySelectorAll('[style=""]')) node.removeAttribute('style');
		overall(fresh);
		if (!early.isEqualNode(fresh.root)) return fresh;
		const at = node => {
			const steps = [];
			for (; node !== fresh.root; node = node.parentNode) steps.unshift(Array.prototype.indexOf.call(node.parentNode.childNodes, node));
			return steps.reduce((parent, index) => parent.childNodes[index], early);
		};
		const kept = {...fresh, root: early};
		for (const [key, value] of Object.entries(fresh)) {
			if (key !== 'root' && value instanceof Node) kept[key] = at(value);
			else if (Array.isArray(value) && value.length && value.every(item => item instanceof Node)) kept[key] = value.map(at);
		}
		return kept;
	}

	function open() {
		if (view) return;
		if (!_rapierJxlEncoderPresent()) {
			document.querySelector('[data-rapier-early-part="jxl"]')?.remove();
			showToast('This copy has no JPEG XL encoder.', 'error');
			return;
		}
		view = adopt(build());
		const {root} = view;
		view.wasFocus = document.activeElement;
		for (const node of document.body.children) if (!node.inert && node.id !== 'toast-root' && node.id !== 'sr-live') { node.inert = true; view.inert.push(node); }
		document.body.append(root);
		view.maker = _rapierJxlMakerPart.bind(root, {save, complete: state => face.complete(state)});
		_rapierSwitchSlide(view.group);
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
			view.mode = button.dataset.mode;
			for (const each of view.modes) { const on = each === button; each.toggleAttribute('data-active', on); each.setAttribute('aria-checked', String(on)); }
			_rapierSwitchSlide(view.group);
			paintQuick(view);
			remake();
		});
		const {qualityOpen, effortOpen, qualityDrop, effortDrop} = view.quick;
		const toggle = (drop, opener) => { const show = drop.hidden; dropQuick(view); drop.hidden = !show; opener.toggleAttribute('data-active', show); opener.setAttribute('aria-expanded', String(show)); };
		qualityOpen.addEventListener('click', () => toggle(qualityDrop, qualityOpen));
		effortOpen.addEventListener('click', () => toggle(effortDrop, effortOpen));
		qualityDrop.addEventListener('click', event => { const mode = event.target.closest('[data-mode]')?.dataset.mode; if (!mode) return; dropQuick(view); view.modes.find(button => button.dataset.mode === mode)?.click(); });
		effortDrop.addEventListener('click', event => { const level = event.target.closest('[data-effort]')?.dataset.effort; if (!level) return; dropQuick(view); configure({effort: Number(level)}); });
		root.addEventListener('pointerdown', event => { if (!view.quick.root.contains(event.target)) dropQuick(view); });
		paintQuick(view);
		view.slider.addEventListener('input', () => seekTo(view));
		view.slider.addEventListener('pointerdown', () => view.seek.classList.add('rapier-draw-seek--active'));
		for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) view.slider.addEventListener(event, () => view.seek.classList.remove('rapier-draw-seek--active'));
		view.slider.addEventListener('change', () => { view.effort = C.effortOf(view.slider.value); paintQuick(view); remake(); });
		seekTo(view);
		view.group.addEventListener('keydown', event => {
			const step = {ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1}[event.key];
			if (!step) return;
			const at = view.modes.findIndex(button => button.hasAttribute('data-active')), next = view.modes[(at + step + view.modes.length) % view.modes.length];
			event.preventDefault(); next.click(); next.focus();
		});
		root.addEventListener('keydown', event => { if (event.key !== 'Escape') return; event.preventDefault(); if (!dropQuick(view)) close(); });
		root.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); view.pick.toggleAttribute('data-over', true); } });
		root.addEventListener('dragleave', event => { if (!root.contains(event.relatedTarget)) view.pick.removeAttribute('data-over'); });
		root.addEventListener('drop', event => { if (!event.dataTransfer?.files.length) return; event.preventDefault(); view.pick.removeAttribute('data-over'); add([...event.dataTransfer.files]); });
		root.addEventListener('paste', event => { const files = [...event.clipboardData?.files || []].filter(file => /^(image|video)\//.test(file.type)); if (files.length) { event.preventDefault(); add(files); } });
		sceneWhenNear(view);
		exampleWhenNear(view);
		overall();
		view.pick.querySelector('input').focus({preventScroll: true});
		if (view.chosen?.length) { const chosen = view.chosen; view.chosen = null; view.input.value = ''; add(chosen); }
	}
	function sceneWhenNear(self) {
		if (!_rapierPartAvailable('jxlscene')) { self.scene.hidden = true; return; }
		self.near = new IntersectionObserver(entries => {
			if (!entries.some(entry => entry.isIntersecting)) return;
			self.near.disconnect(); self.near = null;
			RapierParts.check('jxlscene').catch(() => {}).then(() => RapierParts.need('jxlscene')).then(() => {
				if (view === self && !self.mounted) self.mounted = _rapierJxlScenePart.mount(self.scene, self.stage, save);
			}, () => { if (view === self) self.stage.replaceWith(make('p', 'rapier-jxl-view__note', C.SCENE.missing)); });
		}, {root: self.stage.closest('.rapier-jxl-view__body'), rootMargin: '100% 0px'});
		self.near.observe(self.stage);
	}
	function exampleWhenNear(self) {
		if (!_rapierPartAvailable('jxlexample')) { self.example.hidden = true; return; }
		const near = new IntersectionObserver(entries => {
			if (!entries.some(entry => entry.isIntersecting)) return;
			near.disconnect();
			RapierParts.check('jxlexample').catch(() => {}).then(() => RapierParts.need('jxlexample')).then(() => {
				if (view !== self || self.exampleShown) return;
				const E = globalThis.RapierJxlExample, bytes = Uint8Array.from(atob(E.JXL), c => c.charCodeAt(0));
				self.exampleShown = C.showMade(new Blob([bytes], {type: 'image/jxl'}), 'rapier-jxl-view__media', 'Earth from the International Space Station, animated JPEG XL');
				self.exampleSlot.replaceChildren(self.exampleShown.node);
				self.exampleNote.textContent = 'GIF ' + size(E.GIF_BYTES) + ' → JPEG XL ' + size(bytes.length) + ' · ' + percent({size: bytes.length, before: E.GIF_BYTES});
			}, error => {
				if (view !== self) return;
				if (error?.cause?.code === 'part_not_carried') self.example.hidden = true;
				else self.exampleSlot.replaceChildren(make('p', 'rapier-jxl-view__note', C.EXAMPLE.missing));
			});
		}, {root: self.example.closest('.rapier-jxl-view__body'), rootMargin: '100% 0px'});
		near.observe(self.example);
		self.exampleNear = near;
	}
	function close() {
		if (!view) return;
		view.controller?.abort();
		view.near?.disconnect(); view.exampleNear?.disconnect(); view.mounted?.unmount();
		const done = view;
		view = null;
		done.follow?.popup.end();
		for (const row of done.rows) { row.shown?.end(); row.results.clear(); row.result = null; }
		done.exampleShown?.end();
		if (done.notices?.root.parentElement === done.root) done.notices.home.append(done.notices.root);
		done.maker?.unbind();
		done.root.remove();
		for (const node of done.inert) node.inert = false;
		if (typeof _rapierDoorPathMark === 'function') _rapierDoorPathMark('jxl', false);
		try { done.wasFocus?.focus({preventScroll: true}); } catch (_) {}
	}
	function configure({mode, effort} = {}) {
		if (!view) return;
		view.modes.find(button => button.dataset.mode === mode && mode !== view.mode)?.click();
		if (effort === undefined || C.effortOf(effort) === view.effort) return;
		view.slider.value = String(C.effortOf(effort)); seekTo(view);
		view.effort = C.effortOf(effort); paintQuick(view); remake();
	}
	function paintQuick(of) {
		const {qualityOpen, effortOpen, qualityDrop, effortDrop} = of.quick;
		qualityOpen.textContent = 'Quality: ' + QUALITY_WORDS[of.mode];
		effortOpen.textContent = 'Effort: ' + of.effort;
		for (const button of qualityDrop.children) { const on = button.dataset.mode === of.mode; button.toggleAttribute('data-active', on); button.setAttribute('aria-checked', String(on)); }
		for (const button of effortDrop.children) { const on = Number(button.dataset.effort) === of.effort; button.toggleAttribute('data-active', on); button.setAttribute('aria-checked', String(on)); }
	}
	function dropQuick(of) {
		let was = false;
		for (const [drop, opener] of [[of.quick.qualityDrop, of.quick.qualityOpen], [of.quick.effortDrop, of.quick.effortOpen]]) {
			if (!drop.hidden) was = true;
			drop.hidden = true; opener.removeAttribute('data-active'); opener.setAttribute('aria-expanded', 'false');
		}
		return was;
	}
	const say = text => { if (view) view.help.textContent = text; };
	const face = Object.freeze({open, close, save, configure, say, settled: fn => { if (view) view.settled = fn; }, add: files => add([...files]), has: file => !!view?.rows.some(row => row.file === file),
		complete: state => completeFor(state, null)(), get state() { return Object.freeze({open: !!view}); }});
	_rapierJxlPart = face;
	if (_rapierJxlDoor?.born) _rapierBootFactsPublished.then(open, open);
})();
