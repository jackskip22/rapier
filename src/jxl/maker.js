// SPDX-License-Identifier: AGPL-3.0-only
(() => {
	const C = globalThis.RapierJxlConvert, M = globalThis.RapierJxlMaker;
	const QUALITY_WORDS = Object.freeze({lossless: 'Lossless', high: 'High', smaller: 'Medium'});
	const SIZE_WORDS = Object.freeze({first: 'First', largest: 'Largest', smallest: 'Smallest'});
	const FIT_WORDS = Object.freeze({contain: 'Fit', cover: 'Fill', none: 'Original'});
	const RATES = Object.freeze([10, 15, 24, 30]), SIDES = Object.freeze([320, 480, 720, 1280, 1920]);
	const SLOP = 6, HOLD = 380;
	const make = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
	const size = bytes => bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + ' KB' : (bytes / 1048576).toFixed(bytes < 10485760 ? 2 : 1) + ' MB';
	const icon = paths => '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
	const ICONS = Object.freeze({
		skip: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>',
		copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>',
		remove: '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>',
		reverse: '<polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>',
		boomerang: '<polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path>',
		undo: '<polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>',
		fade: '<circle cx="9" cy="12" r="6"></circle><circle cx="15" cy="12" r="6"></circle>',
		redo: '<polyline points="15 14 20 9 15 4"></polyline><path d="M4 20v-7a4 4 0 0 1 4-4h12"></path>'});

	function switcher(label, values, words, start) {
		const group = make('div', 'theme-switcher theme-switcher--joined theme-switcher--onoff');
		group.setAttribute('role', 'radiogroup'); group.setAttribute('aria-label', label);
		const buttons = values.map(value => {
			const button = make('button', 'theme-switcher__btn onoff-btn', words(value));
			button.type = 'button'; button.dataset.value = String(value); button.setAttribute('role', 'radio');
			const on = value === start; button.setAttribute('aria-checked', String(on)); button.toggleAttribute('data-active', on);
			return button;
		});
		group.append(...buttons);
		const set = value => { for (const button of buttons) { const on = button.dataset.value === String(value); button.toggleAttribute('data-active', on); button.setAttribute('aria-checked', String(on)); } _rapierSwitchSlide(group); };
		group.addEventListener('keydown', event => {
			const step = {ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1}[event.key];
			if (!step) return;
			const at = buttons.findIndex(button => button.hasAttribute('data-active')), next = buttons[(at + step + buttons.length) % buttons.length];
			event.preventDefault(); event.stopPropagation(); next.click(); next.focus();
		});
		return {group, buttons, set, on: pick => buttons.forEach(button => button.addEventListener('click', () => { const value = values.find(each => String(each) === button.dataset.value); set(value); pick(value); }))};
	}
	function seeker(label, min, max, step, value) {
		const seek = make('span', 'rapier-draw-seek'), track = make('span', 'rapier-draw-seek-track'), head = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle'), input = make('input');
		input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(value); input.setAttribute('aria-label', label);
		track.setAttribute('aria-hidden', 'true'); head.setAttribute('class', 'rapier-draw-seek-head'); head.setAttribute('viewBox', '0 0 24 24'); head.setAttribute('aria-hidden', 'true');
		for (const [name, at] of [['cx', '12'], ['cy', '12'], ['r', '10']]) ring.setAttribute(name, at);
		head.append(ring); seek.append(track, head, input);
		const show = () => seek.style.setProperty('--seek-frac', String((Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min) || 1)));
		input.addEventListener('input', show);
		input.addEventListener('pointerdown', () => seek.classList.add('rapier-draw-seek--active'));
		for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) input.addEventListener(event, () => seek.classList.remove('rapier-draw-seek--active'));
		show();
		return {seek, input, show};
	}
	const field = (label, value, {min, max, step = 1, wide = false} = {}) => {
		const input = make('input', 'rapier-jxl-maker__field' + (wide ? ' rapier-jxl-maker__field--wide' : ''));
		input.type = 'number'; input.inputMode = 'numeric'; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(value); input.setAttribute('aria-label', label);
		return input;
	};
	const action = (name, words, label = words) => {
		const button = make('button', 'settings-action-btn rapier-jxl-maker__action');
		button.type = 'button'; button.dataset.act = name; button.setAttribute('aria-label', label);
		button.innerHTML = icon(ICONS[name]); button.append(make('span', '', words));
		return button;
	};
	const part = (label, ...nodes) => { const node = make('div', 'rapier-jxl-view__part rapier-jxl-maker__part'); node.append(make('p', 'rapier-jxl-view__label', label), ...nodes); return node; };
	const row = (...nodes) => { const node = make('div', 'rapier-jxl-maker__row'); node.append(...nodes); return node; };

	function build() {
		const root = make('div', 'rapier-jxl-maker'), fold = make('div', 'rapier-jxl-view__fold');
		const note = make('p', 'rapier-jxl-view__note', 'Runs locally on your device - no uploads. Rapier is a single HTML file that works offline. Free and open source.');
		const pick = make('label', 'settings-action-btn rapier-jxl-view__pick'), input = make('input');
		pick.append(make('span', '', 'Choose or drop pictures, GIFs or videos'), input);
		input.type = 'file'; input.accept = 'image/*,video/*,.heic,.heif'; input.multiple = true;

		const clip = make('div', 'rapier-jxl-maker__clip'), clipVideo = make('video', 'rapier-jxl-maker__video');
		clipVideo.muted = true; clipVideo.playsInline = true; clipVideo.preload = 'auto'; clipVideo.disablePictureInPicture = true; clipVideo.loop = false;
		const clipName = make('div', 'rapier-jxl-view__row-name'), clipNote = make('div', 'rapier-jxl-view__row-note');
		const start = seeker('Start', 0, 1, 0.01, 0), end = seeker('End', 0, 1, 0.01, 1), startAt = make('output', 'rapier-jxl-view__effort-level'), endAt = make('output', 'rapier-jxl-view__effort-level');
		const startRow = make('div', 'rapier-jxl-view__effort'), endRow = make('div', 'rapier-jxl-view__effort');
		startRow.append(make('span', 'rapier-jxl-maker__label', 'Start'), start.seek, startAt); endRow.append(make('span', 'rapier-jxl-maker__label', 'End'), end.seek, endAt);
		const rate = switcher('Frames a second', RATES, value => String(value), 30), side = switcher('Longer side', SIDES, value => String(value), 720);
		const take = make('button', 'settings-action-btn rapier-jxl-view__all', 'Add frames'), drop = make('button', 'settings-action-btn rapier-jxl-view__all', 'Cancel');
		take.type = drop.type = 'button';
		clip.append(clipName, clipVideo, clipNote, startRow, endRow, part('Frames a second', rate.group), part('Longer side', side.group), row(drop, take));
		clip.hidden = true;

		const strip = make('div', 'rapier-jxl-maker__strip');
		strip.setAttribute('role', 'listbox'); strip.setAttribute('aria-multiselectable', 'true'); strip.setAttribute('aria-label', 'Frames'); strip.tabIndex = 0;
		const sum = make('p', 'rapier-jxl-view__note rapier-jxl-maker__sum');
		const actions = make('div', 'rapier-jxl-maker__actions');
		actions.append(action('skip', 'Skip', 'Skip or restore'), action('copy', 'Copy', 'Duplicate'), action('remove', 'Delete'), action('reverse', 'Reverse'), action('boomerang', 'Boomerang'), action('fade', 'Fade', 'Crossfade'), action('undo', 'Undo'), action('redo', 'Redo'));
		const from = field('From frame', 1, {min: 1, max: 1}), to = field('To frame', 1, {min: 1, max: 1}), every = field('Every', 1, {min: 1, max: 999}), choose = make('button', 'settings-action-btn rapier-jxl-maker__go', 'Select'), everything = make('button', 'settings-action-btn rapier-jxl-maker__go', 'All');
		choose.type = everything.type = 'button';
		const range = row(make('span', 'rapier-jxl-maker__label', 'From'), from, make('span', 'rapier-jxl-maker__label', 'To'), to, make('span', 'rapier-jxl-maker__label', 'Every'), every, choose, everything);
		const delay = field('Delay in milliseconds', M.DELAY.start, {min: M.DELAY.min, max: M.DELAY.max, wide: true}), loops = field('Loops', 0, {min: M.LOOPS.min, max: M.LOOPS.max, wide: true});
		loops.value = ''; loops.placeholder = 'Forever';
		const timing = row(make('span', 'rapier-jxl-maker__label', 'Delay'), delay, make('span', 'rapier-jxl-maker__label', 'ms'), make('span', 'rapier-jxl-maker__label rapier-jxl-maker__gap', 'Loops'), loops);
		const edit = make('div', 'rapier-jxl-maker__edit');
		edit.append(strip, sum, actions, range, timing);
		edit.hidden = true;

		const sizes = switcher('Canvas size', M.SIZES, value => SIZE_WORDS[value], 'first'), fits = switcher('Fit', M.FITS, value => FIT_WORDS[value], 'contain');
		const scales = switcher('Scale', M.SCALES, value => Math.round(value * 100) + '%', 1);
		const align = make('div', 'rapier-jxl-maker__align'), aligns = [];
		align.setAttribute('role', 'radiogroup'); align.setAttribute('aria-label', 'Alignment');
		for (const y of M.ALIGNS) for (const x of M.ALIGNS) {
			const cell = make('button', 'rapier-jxl-maker__cell');
			cell.type = 'button'; cell.dataset.x = String(x); cell.dataset.y = String(y); cell.setAttribute('role', 'radio');
			cell.setAttribute('aria-label', ({0: 'top', 0.5: 'middle', 1: 'bottom'})[y] + ' ' + ({0: 'left', 0.5: 'center', 1: 'right'})[x]);
			const on = x === 0.5 && y === 0.5; cell.toggleAttribute('data-active', on); cell.setAttribute('aria-checked', String(on));
			aligns.push(cell); align.append(cell);
		}
		const canvasPart = make('div', 'rapier-jxl-maker__canvas');
		canvasPart.append(part('Canvas', sizes.group), part('Fit', fits.group), part('Align', align), part('Scale', scales.group));
		canvasPart.hidden = true;

		const modes = switcher('Quality', Object.keys(C.QUALITY), value => QUALITY_WORDS[value], 'lossless');
		const effortRow = make('div', 'rapier-jxl-view__effort'), effort = seeker('Effort', C.EFFORT.min, C.EFFORT.max, 1, C.EFFORT.start), level = make('output', 'rapier-jxl-view__effort-level');
		effortRow.setAttribute('role', 'group'); effortRow.setAttribute('aria-label', 'Effort');
		effort.seek.insertBefore(level, effort.input);
		effortRow.append(make('span', 'rapier-jxl-view__end', 'Fast'), effort.seek, make('span', 'rapier-jxl-view__end', 'Smallest file'));
		const quality = part('Quality', modes.group), effortPart = part('Effort', effortRow);

		const go = make('button', 'settings-action-btn rapier-jxl-view__all rapier-jxl-maker__make', 'Make JPEG XL');
		go.type = 'button'; go.disabled = true;
		const line = make('div', 'rapier-progress__bar rapier-jxl-view__line'), status = make('p', 'rapier-jxl-view__note rapier-jxl-maker__status');
		line.hidden = true; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
		const cancel = make('button', 'settings-action-btn rapier-jxl-view__all', 'Cancel');
		cancel.type = 'button'; cancel.hidden = true;

		const preview = make('div', 'rapier-jxl-maker__preview'), before = make('figure', 'rapier-jxl-maker__pane'), after = make('figure', 'rapier-jxl-maker__pane');
		const beforeCanvas = make('canvas', 'rapier-jxl-maker__media'), beforeNote = make('figcaption', 'rapier-jxl-view__note'), afterNote = make('figcaption', 'rapier-jxl-view__note');
		const afterSlot = make('div', 'rapier-jxl-maker__slot');
		before.append(beforeCanvas, beforeNote); after.append(afterSlot, afterNote);
		preview.append(before, after); preview.hidden = true; after.hidden = true;
		const download = make('button', 'settings-action-btn rapier-jxl-view__all', 'Download');
		download.type = 'button'; download.hidden = true;

		fold.append(note, pick, clip, edit, canvasPart, quality, effortPart, go, line, status, cancel, preview, download, _rapierToolFooter('/jxl', 'rapier-jxl', 'rapier-jxl', false));
		const more = make('section', 'rapier-jxl-view__more'), moreTitle = make('h2', 'rapier-jxl-view__title', M.ANSWERS.title);
		moreTitle.id = 'rapier-jxl-maker-answers'; more.setAttribute('aria-labelledby', moreTitle.id);
		more.append(moreTitle);
		for (const [question, answer] of M.ANSWERS.items) more.append(make('h3', 'rapier-jxl-maker__question', question), make('p', 'rapier-jxl-view__note', answer));
		root.append(fold, more, _rapierToolAlso('/jxl'));
		return {root, input, pick, clip, clipVideo, clipName, clipNote, start, end, startAt, endAt, rate, side, take, drop, edit, strip, sum, actions, from, to, every, choose, everything, delay, loops,
			canvasPart, sizes, fits, scales, aligns, modes, effort, level, go, line, status, cancel, preview, before, beforeCanvas, beforeNote, after, afterSlot, afterNote, download,
			frames: [], history: [], future: [], selected: new Set(), anchor: 0, sources: [], waiting: [], settings: {size: 'first', scale: 1, fit: 'contain', align: [0.5, 0.5]},
			mode: 'lossless', modeChosen: false, effortValue: C.EFFORT.start, result: null, controller: null, thumbs: new WeakMap(), cells: new Map()};
	}

	async function pictureOf(data, width, height) {
		const picture = {width, height, data};
		const scale = Math.min(1, 360 / Math.max(width, height));
		picture.show = await createImageBitmap(new ImageData(new Uint8ClampedArray(data.buffer, data.byteOffset, width * height * 4), width, height), {premultiplyAlpha: 'premultiply', resizeWidth: Math.max(1, Math.round(width * scale)), resizeHeight: Math.max(1, Math.round(height * scale)), resizeQuality: 'medium'});
		return picture;
	}
	function showOf(picture) {
		const {a, b, t} = picture.mix, width = a.show.width, height = a.show.height, canvas = new OffscreenCanvas(width, height), context = canvas.getContext('2d');
		context.drawImage(a.show, 0, 0, width, height); context.globalAlpha = t; context.drawImage(b.show, 0, 0, width, height);
		picture.show = canvas.transferToImageBitmap();
	}
	const held = self => { const seen = new Set(); let pixels = 0; for (const frame of self.frames) if (!frame.picture.mix && !seen.has(frame.picture)) { seen.add(frame.picture); pixels += frame.picture.width * frame.picture.height; } return pixels; };
	const shownError = text => Object.assign(new Error(text), {shown: true});

	async function add(self, files) {
		if (!self.live || !files.length) return;
		for (const file of M.byName(files)) self.waiting.push(file);
		if (self.reading) return;
		self.reading = true;
		try {
			while (self.waiting.length && self.live) {
				const file = self.waiting.shift();
				try { await addOne(self, file); }
				catch (error) {
					if (error?.name === 'AbortError') { say(self, 'Canceled'); continue; }
					say(self, file.name + ': ' + (C.exhausted(error) ? 'this device ran out of memory' : C.refusal(error, file)));
				}
			}
		} finally { self.reading = false; working(self, false); }
	}
	async function addOne(self, file) {
		const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
		const kind = M.mediaKind(head, file.type);
		if (C.kindOf(head) === 'other' && kind === 'video') return clipOf(self, file);
		if (C.kindOf(head) === 'jxl') throw shownError('Already JPEG XL.');
		const bytes = new Uint8Array(await file.arrayBuffer()), animated = M.mediaKind(bytes, file.type);
		working(self, true, 'Reading ' + file.name);
		const signal = (self.controller = new AbortController()).signal;
		if (animated && animated !== 'video') {
			await complete(self);
			const read = await M.readAnimation(bytes, animated, {signal, convert: true, budget: Math.max(0, M.FRAME_PIXELS - held(self)), say: text => say(self, file.name + ' · ' + text), progress: value => progressTo(self, value)});
			if (read) {
				const pictures = [];
				for (const frame of read.frames) pictures.push(M.frameOf(await pictureOf(frame.data, read.width, read.height), frame.duration));
				read.frames.length = 0;
				source(self, file, animated === 'image/gif' ? 'GIF' : animated === 'image/png' ? 'APNG' : 'WebP', read.loops);
				append(self, pictures, read.cut ? file.name + ': first ' + pictures.length + ' of ' + read.total + ' frames, to fit this device' : '');
				return;
			}
		}
		await complete(self);
		const picture = await C.pixelsOf(file);
		if (held(self) + picture.width * picture.height > M.FRAME_PIXELS) throw shownError('Not added: this device has no room for more frames.');
		source(self, file, 'Pictures');
		append(self, [M.frameOf(await pictureOf(picture.data, picture.width, picture.height))]);
	}
	function source(self, file, kind, loops) {
		self.sources.push({name: file.name, size: file.size, kind});
		if (loops !== undefined && self.sources.length === 1 && !self.loopsChosen) self.loops.value = loops ? String(loops) : '';
		if (!self.modeChosen) { self.mode = self.sources.some(each => each.kind === 'Video') ? 'high' : 'lossless'; self.modes.set(self.mode); }
	}

	async function clipOf(self, file) {
		self.clipFile = file;
		const url = URL.createObjectURL(file);
		self.clipUrl && URL.revokeObjectURL(self.clipUrl); self.clipUrl = url;
		self.clipVideo.src = url; self.clipName.textContent = file.name; self.clip.hidden = false; self.pick.hidden = true;
		await new Promise((resolve, reject) => { self.clipVideo.onloadedmetadata = resolve; self.clipVideo.onerror = () => reject(shownError('This browser cannot play this video.')); });
		let length = self.clipVideo.duration;
		if (!Number.isFinite(length)) { self.clipVideo.currentTime = 1e9; await new Promise(resolve => { self.clipVideo.onseeked = resolve; }); length = self.clipVideo.duration; self.clipVideo.currentTime = 0; }
		self.clipLength = length;
		for (const each of [self.start, self.end]) { each.input.max = String(length); each.input.step = String(Math.min(0.1, length / 100)); }
		self.start.input.value = '0'; self.end.input.value = String(Math.min(length, M.SECONDS)); self.start.show(); self.end.show();
		clipWords(self);
		await new Promise(resolve => { self.clipDone = resolve; });
	}
	const clock = seconds => (seconds < 60 ? seconds.toFixed(1) : Math.floor(seconds / 60) + ':' + (seconds % 60).toFixed(1).padStart(4, '0')) + ' s';
	function clipWords(self) {
		const a = Number(self.start.input.value), b = Number(self.end.input.value);
		self.startAt.textContent = clock(a); self.endAt.textContent = clock(b);
		const plan = M.videoPlan(self.clipVideo.videoWidth, self.clipVideo.videoHeight, Math.max(0, b - a), {fps: self.clipRate || 30, longSide: self.clipSide || 720, budget: Math.max(0, M.FRAME_PIXELS - held(self))});
		self.clipNote.textContent = size(self.clipFile.size) + ' · ' + Math.max(1, Math.ceil(plan.seconds * plan.fps)) + ' frames at ' + plan.width + ' × ' + plan.height + (plan.cut ? ' · first ' + plan.seconds.toFixed(1) + ' s, to fit this device' : '');
	}
	async function takeClip(self) {
		const file = self.clipFile, startAt = Number(self.start.input.value), endAt = Number(self.end.input.value);
		self.clip.hidden = true; self.pick.hidden = false; self.clipVideo.pause();
		working(self, true, 'Playing ' + file.name);
		const signal = (self.controller = new AbortController()).signal;
		try {
			await complete(self);
			const read = await M.readVideo(file, {signal, start: startAt, end: endAt, fps: self.clipRate || 30, longSide: self.clipSide || 720, budget: Math.max(0, M.FRAME_PIXELS - held(self)), say: text => say(self, file.name + ' · ' + text), progress: value => progressTo(self, value)});
			const frames = [];
			for (const frame of read.frames) frames.push(M.frameOf(await pictureOf(frame.data, read.width, read.height), frame.duration));
			read.frames.length = 0;
			source(self, file, 'Video');
			append(self, frames, (read.sound ? file.name + ': sound dropped' : '') + (read.cut ? (read.sound ? ' · ' : file.name + ': ') + 'cut to fit this device' : ''));
		} finally { endClip(self); }
	}
	function endClip(self) {
		self.clipVideo.removeAttribute('src'); self.clipVideo.load();
		if (self.clipUrl) URL.revokeObjectURL(self.clipUrl);
		self.clipUrl = null; self.clipFile = null; self.clip.hidden = true; self.pick.hidden = false;
		const done = self.clipDone; self.clipDone = null; done?.();
	}

	async function complete(self) {
		if (typeof self.host.complete === 'function') return self.host.complete(self.completeState);
		throw shownError('Not made: needs JPEG XL complete');
	}

	function commit(self, frames, selected = self.selected) {
		if (frames === self.frames) return;
		self.history.push(self.frames); if (self.history.length > 200) self.history.shift();
		self.future = [];
		self.frames = frames; self.selected = new Set([...selected].filter(id => frames.some(frame => frame.id === id)));
		changed(self);
	}
	function undo(self, back = true) {
		const from = back ? self.history : self.future, to = back ? self.future : self.history;
		if (!from.length) return;
		to.push(self.frames); self.frames = from.pop();
		self.selected = new Set([...self.selected].filter(id => self.frames.some(frame => frame.id === id)));
		changed(self);
	}
	function append(self, frames, words = '') {
		commit(self, [...self.frames, ...frames], new Set());
		say(self, words);
	}
	function changed(self) {
		drawStrip(self);
		const any = self.frames.length > 0;
		self.edit.hidden = self.canvasPart.hidden = !any;
		self.from.max = self.to.max = String(Math.max(1, self.frames.length));
		if (Number(self.to.value) < 2 || Number(self.to.value) > self.frames.length) self.to.value = String(Math.max(1, self.frames.length));
		self.sum.textContent = M.summary(self.frames, self.settings);
		self.actions.querySelector('[data-act="undo"]').disabled = !self.history.length;
		self.actions.querySelector('[data-act="redo"]').disabled = !self.future.length;
		const chosen = self.frames.filter(frame => self.selected.has(frame.id));
		const shownDelay = (chosen.length ? chosen : self.frames)[0]?.duration;
		if (shownDelay && document.activeElement !== self.delay) self.delay.value = String(shownDelay);
		self.go.disabled = !M.timeline(self.frames).count || self.making;
		stale(self);
		play(self);
	}
	function drawStrip(self) {
		const keep = new Set();
		const nodes = self.frames.map((frame, index) => {
			keep.add(frame.id);
			let cell = self.cells.get(frame.id);
			if (!cell) {
				cell = make('div', 'rapier-jxl-maker__frame');
				cell.setAttribute('role', 'option'); cell.dataset.id = String(frame.id);
				const thumb = make('canvas', 'rapier-jxl-maker__thumb'), {show} = frame.picture, h = 72, w = Math.max(24, Math.min(160, Math.round(h * show.width / show.height)));
				thumb.width = w * 2; thumb.height = h * 2; thumb.style.width = w + 'px'; thumb.style.height = h + 'px';
				thumb.getContext('2d').drawImage(show, 0, 0, thumb.width, thumb.height);
				cell.append(thumb, make('span', 'rapier-jxl-maker__index'), make('span', 'rapier-jxl-maker__delay'));
				self.cells.set(frame.id, cell);
			}
			cell.querySelector('.rapier-jxl-maker__index').textContent = String(index + 1);
			cell.querySelector('.rapier-jxl-maker__delay').textContent = frame.duration + ' ms';
			const on = self.selected.has(frame.id);
			cell.toggleAttribute('data-active', on); cell.setAttribute('aria-selected', String(on));
			cell.toggleAttribute('data-skip', frame.skip);
			cell.setAttribute('aria-label', 'Frame ' + (index + 1) + ', ' + frame.duration + ' ms' + (frame.skip ? ', skipped' : ''));
			return cell;
		});
		for (const [id, cell] of self.cells) if (!keep.has(id)) { cell.remove(); self.cells.delete(id); }
		nodes.forEach((node, at) => { if (self.strip.children[at] !== node) self.strip.insertBefore(node, self.strip.children[at] || null); });
	}
	function choose(self, id, {toggle = false, extend = false} = {}) {
		if (extend && self.anchor) self.selected = M.span(self.frames, self.anchor, id);
		else if (toggle) { const next = new Set(self.selected); next.has(id) ? next.delete(id) : next.add(id); self.selected = next; self.anchor = id; }
		else { self.selected = self.selected.size === 1 && self.selected.has(id) ? new Set() : new Set([id]); self.anchor = id; }
		changed(self);
		self.focus = id;
	}
	function act(self, name) {
		const ids = self.selected;
		if (name === 'undo') return undo(self);
		if (name === 'redo') return undo(self, false);
		if (!self.frames.length) return;
		if (name === 'remove') {
			if (!ids.size) return;
			const first = self.frames.findIndex(frame => ids.has(frame.id)), left = M.remove(self.frames, ids), next = left[Math.min(first, left.length - 1)];
			self.anchor = self.focus = next?.id || 0;
			commit(self, left, new Set(next ? [next.id] : []));
			return;
		}
		if (name === 'skip') { if (ids.size) commit(self, M.skip(self.frames, ids)); return; }
		if (name === 'copy') { if (!ids.size) return; const {frames, made} = M.duplicate(self.frames, ids); commit(self, frames, made); return; }
		if (name === 'reverse') return commit(self, M.reverse(self.frames, ids));
		if (name === 'boomerang') return commit(self, M.boomerang(self.frames, ids));
		if (name === 'fade') { const {frames, made} = M.fade(self.frames, ids); if (made.size) { for (const frame of frames) if (made.has(frame.id)) showOf(frame.picture); commit(self, frames, made); } return; }
	}

	function press(self, event) {
		const cell = event.target.closest('.rapier-jxl-maker__frame');
		if (!cell || event.button > 0) return;
		const id = Number(cell.dataset.id), touch = event.pointerType !== 'mouse', x0 = event.clientX, y0 = event.clientY;
		if (document.activeElement !== self.strip) self.strip.focus({preventScroll: true});
		let dragging = false, held = false, timer = 0, moved = false;
		const begin = () => {
			dragging = true;
			if (!self.selected.has(id)) { self.selected = new Set([id]); self.anchor = id; changed(self); }
			self.strip.setAttribute('data-dragging', '');
			try { self.strip.setPointerCapture(event.pointerId); } catch (_) {}
		};
		if (touch) timer = setTimeout(() => { held = true; if (!self.selected.has(id)) { const next = new Set(self.selected); next.add(id); self.selected = next; self.anchor = id; changed(self); } begin(); navigator.vibrate?.(10); }, HOLD);
		const over = x => {
			const cells = [...self.strip.children];
			for (let at = 0; at < cells.length; at++) { const box = cells[at].getBoundingClientRect(); if (x < box.left + box.width / 2) return at; }
			return cells.length;
		};
		const scrollEdge = x => { const box = self.strip.getBoundingClientRect(); if (x < box.left + 32) self.strip.scrollLeft -= 12; else if (x > box.right - 32) self.strip.scrollLeft += 12; };
		const onMove = move => {
			if (move.pointerId !== event.pointerId) return;
			const far = Math.hypot(move.clientX - x0, move.clientY - y0) > SLOP;
			if (!dragging) {
				if (!far) return;
				if (touch && !held) { clearTimeout(timer); finish(); return; }
				begin();
			}
			moved = true; move.preventDefault(); scrollEdge(move.clientX);
			const to = over(move.clientX), next = M.move(self.frames, self.selected, to);
			if (next.some((frame, at) => frame !== self.frames[at])) { self.dragFrom ||= self.frames; self.frames = next; drawStrip(self); }
		};
		const stopScroll = touchEvent => { if (dragging) touchEvent.preventDefault(); };
		const finish = up => {
			clearTimeout(timer);
			removeEventListener('pointermove', onMove); removeEventListener('pointerup', finish); removeEventListener('pointercancel', finish);
			self.strip.removeEventListener('touchmove', stopScroll);
			self.strip.removeAttribute('data-dragging');
			if (self.dragFrom) { const moved = self.frames; self.frames = self.dragFrom; self.dragFrom = null; commit(self, moved); return; }
			if (!up || up.type !== 'pointerup' || held || moved) return;
			choose(self, id, {toggle: up.ctrlKey || up.metaKey, extend: up.shiftKey});
		};
		addEventListener('pointermove', onMove, {passive: false}); addEventListener('pointerup', finish); addEventListener('pointercancel', finish);
		self.strip.addEventListener('touchmove', stopScroll, {passive: false});
	}
	function keys(self, event) {
		const mod = event.ctrlKey || event.metaKey, key = event.key;
		const at = Math.max(0, self.frames.findIndex(frame => frame.id === (self.focus || self.anchor)));
		if ((key === 'ArrowLeft' || key === 'ArrowRight') && !mod) {
			const step = key === 'ArrowLeft' ? -1 : 1;
			if (event.altKey) { commit(self, M.nudge(self.frames, self.selected, step)); event.preventDefault(); return; }
			const next = self.frames[Math.max(0, Math.min(self.frames.length - 1, at + (self.focus ? step : 0)))];
			if (!next) return;
			event.preventDefault();
			if (event.shiftKey) { self.selected = M.span(self.frames, self.anchor || next.id, next.id); self.focus = next.id; changed(self); }
			else choose(self, next.id);
			self.cells.get(next.id)?.scrollIntoView({block: 'nearest', inline: 'nearest'});
			return;
		}
		if (key === 'Delete' || key === 'Backspace') { event.preventDefault(); act(self, 'remove'); return; }
		if (mod && key.toLowerCase() === 'd') { event.preventDefault(); act(self, 'copy'); return; }
		if (mod && key.toLowerCase() === 'a') { event.preventDefault(); self.selected = new Set(self.frames.map(frame => frame.id)); changed(self); return; }
		if (!mod && key.toLowerCase() === 's') { event.preventDefault(); act(self, 'skip'); return; }
		if (key === 'Escape' && self.selected.size) { event.preventDefault(); event.stopPropagation(); self.selected = new Set(); changed(self); }
	}

	function play(self) {
		cancelAnimationFrame(self.raf);
		const kept = self.frames.filter(frame => !frame.skip), canvas = M.canvasOf(self.frames, self.settings);
		self.preview.hidden = !kept.length;
		if (!kept.length) return;
		const box = self.beforeCanvas, scale = Math.min(1, 720 / Math.max(canvas.width, canvas.height));
		box.width = Math.max(1, Math.round(canvas.width * scale)); box.height = Math.max(1, Math.round(canvas.height * scale));
		const context = box.getContext('2d'), shrunk = {width: box.width, height: box.height};
		let at = -1, due = 0;
		const tick = now => {
			if (!self.live) return;
			if (now >= due) {
				at = (at + 1) % kept.length;
				const frame = kept[at], lay = (picture, alpha) => { const place = M.placement(picture, canvas, self.settings); context.globalAlpha = alpha; context.drawImage(picture.show, place.dx * scale, place.dy * scale, place.dw * scale, place.dh * scale); };
				context.clearRect(0, 0, shrunk.width, shrunk.height);
				context.imageSmoothingQuality = 'high';
				if (frame.picture.mix) { lay(frame.picture.mix.a, 1 - frame.picture.mix.t); lay(frame.picture.mix.b, frame.picture.mix.t); } else lay(frame.picture, 1);
				context.globalAlpha = 1;
				due = (due && now - due < 1000 ? due : now) + frame.duration;
			}
			self.raf = requestAnimationFrame(tick);
		};
		self.raf = requestAnimationFrame(tick);
		const total = self.sources.reduce((sum, each) => sum + each.size, 0), kinds = [...new Set(self.sources.map(each => each.kind))];
		self.beforeNote.textContent = kinds.join(' + ') + ' · ' + size(total);
	}
	function stale(self) {
		if (!self.result || self.result.key === keyOf(self)) return;
		URL.revokeObjectURL(self.result.url); self.result = null;
		self.after.hidden = true; self.download.hidden = true; self.afterSlot.replaceChildren();
	}
	const keyOf = self => JSON.stringify([self.frames.map(frame => [frame.id, frame.duration, frame.skip]), self.settings, self.mode, self.effortValue, M.loopsOf(self.loops.value)]);

	function drawer() {
		let canvas = null, context = null, from = null, fromContext = null;
		return async (picture, size, place) => {
			if (!canvas || canvas.width !== size.width || canvas.height !== size.height) { canvas = new OffscreenCanvas(size.width, size.height); context = canvas.getContext('2d', {willReadFrequently: true}); }
			if (!from || from.width !== picture.width || from.height !== picture.height) { from = new OffscreenCanvas(picture.width, picture.height); fromContext = from.getContext('2d'); }
			fromContext.putImageData(new ImageData(new Uint8ClampedArray(picture.data.buffer, picture.data.byteOffset, picture.width * picture.height * 4), picture.width, picture.height), 0, 0);
			context.clearRect(0, 0, size.width, size.height);
			context.imageSmoothingQuality = 'high';
			context.drawImage(from, place.dx, place.dy, place.dw, place.dh);
			return new Uint8Array(context.getImageData(0, 0, size.width, size.height).data.buffer);
		};
	}
	async function makeIt(self) {
		if (self.making) return;
		const canvas = M.canvasOf(self.frames, self.settings), room = M.fits(self.frames, canvas);
		if (!room.ok) { say(self, room.why === 'pixels' ? 'Over 24 megapixels a frame.' : 'Too many frames for this device: at most ' + room.most + ' at this size.'); return; }
		self.making = true; self.go.disabled = true;
		const key = keyOf(self), signal = (self.controller = new AbortController()).signal;
		working(self, true, 'Making the file');
		try {
			await complete(self);
			const animation = await M.animationOf(self.frames, {...self.settings, loops: self.loops.value}, drawer(), {signal});
			const count = animation.frames.length, lossless = self.mode === 'lossless';
			const options = lossless ? {fidelity: 'exact', effort: self.effortValue} : {fidelity: {quality: C.QUALITY[self.mode]}, effort: self.effortValue};
			const made = await globalThis.RapierEmbeddedImages.codec('encode', animation, options, {signal, progress: value => { say(self, 'Making frame ' + Math.min(count, Math.max(1, Math.ceil(value * count))) + ' of ' + count); progressTo(self, value); }});
			animation.frames.length = 0;
			if (!self.live) return;
			const blob = new Blob([made], {type: 'image/jxl'}), before = self.sources.reduce((sum, each) => sum + each.size, 0);
			self.result && URL.revokeObjectURL(self.result.url);
			self.result = {blob, url: URL.createObjectURL(blob), key, size: made.length, before, exact: lossless && M.exactOf(self.frames, self.settings)};
			await showResult(self, made);
			say(self, '');
		} catch (error) {
			say(self, error?.name === 'AbortError' ? 'Canceled' : C.exhausted(error) ? 'This device ran out of memory. Try fewer frames or a smaller scale.' : C.refusal(error));
		} finally { self.making = false; working(self, false); self.go.disabled = !M.timeline(self.frames).count; }
	}
	async function showResult(self, bytes) {
		const r = self.result, change = Math.round((1 - r.size / r.before) * 100);
		const video = self.sources.some(each => each.kind === 'Video');
		self.afterNote.textContent = 'JPEG XL · ' + size(r.size) + (video ? '' : change > 0 ? ' · ' + change + '% smaller' : change < 0 ? ' · ' + -change + '% larger' : '') + (r.exact ? ' · every frame exact' : '');
		self.after.hidden = false; self.download.hidden = false;
		if (await globalThis.RapierEmbeddedImages.whenJxlDisplayKnown?.() === true) {
			const image = make('img', 'rapier-jxl-maker__media'); image.alt = 'The animated JPEG XL'; image.src = r.url;
			self.afterSlot.replaceChildren(image); return;
		}
		const decoded = await globalThis.RapierEmbeddedImages.codec('decode', bytes.slice(), {});
		const canvas = make('canvas', 'rapier-jxl-maker__media'); canvas.width = decoded.width; canvas.height = decoded.height;
		self.afterSlot.replaceChildren(canvas);
		const context = canvas.getContext('2d');
		const frames = await Promise.all((decoded.frames?.length ? decoded.frames : [decoded]).map(async frame => ({bitmap: await createImageBitmap(new ImageData(new Uint8ClampedArray(frame.data.buffer, frame.data.byteOffset, decoded.width * decoded.height * 4), decoded.width, decoded.height)), ms: Math.max(1, (frame.durationSeconds || 0) * 1000)})));
		let at = -1, due = 0;
		const step = now => { if (self.result !== r || !self.live) { for (const frame of frames) frame.bitmap.close(); return; } if (now >= due) { at = (at + 1) % frames.length; context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(frames[at].bitmap, 0, 0); due = (due && now - due < 1000 ? due : now) + frames[at].ms; } requestAnimationFrame(step); };
		requestAnimationFrame(step);
	}
	function save(self) {
		const r = self.result;
		if (!r) return;
		const name = C.outputName(self.sources[0]?.name || 'animation');
		if (typeof self.host.save === 'function') return self.host.save(r.blob, name);
		const link = make('a'); link.href = r.url; link.download = name; document.body.append(link); link.click(); link.remove();
	}

	function say(self, text) { self.status.textContent = text || ''; }
	function progressTo(self, value) { self.line.style.setProperty('--rapier-progress', String(Math.max(0, Math.min(1, value)))); }
	function working(self, on, text) {
		self.line.hidden = !on; self.cancel.hidden = !on;
		if (on) { progressTo(self, 0); say(self, text); }
	}

	function tabs(body, still) {
		const list = make('div', 'rapier-jxl-tabs'), panels = [];
		list.setAttribute('role', 'tablist'); list.setAttribute('aria-label', 'JPEG XL');
		for (const [name, words] of [['still', 'still'], ['animated', 'animated']]) {
			const tab = make('button', 'rapier-jxl-tabs__tab', words), panel = make('div', 'rapier-jxl-view__panel');
			const on = name === 'still';
			tab.type = 'button'; tab.id = 'rapier-jxl-tab-' + name; tab.dataset.tab = name; tab.setAttribute('role', 'tab');
			tab.setAttribute('aria-selected', String(on)); tab.tabIndex = on ? 0 : -1; tab.setAttribute('aria-controls', 'rapier-jxl-panel-' + name);
			panel.id = 'rapier-jxl-panel-' + name; panel.dataset.tab = name; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id);
			panel.hidden = !on;
			list.append(tab); panels.push(panel);
		}
		panels[0].append(...still);
		body.append(list, ...panels);
	}
	function bind(root, host = {}) {
		const list = root.querySelector('.rapier-jxl-tabs');
		if (!list) return {unbind() {}};
		const buttons = [...list.querySelectorAll('[role="tab"]')], panels = Object.fromEntries([...root.querySelectorAll('.rapier-jxl-view__panel')].map(panel => [panel.dataset.tab, panel]));
		const scroller = list.closest('.rapier-jxl-view__body');
		const bound = {host, maker: null, tab: 'still'};
		const show = (name, {focus = false, address = true} = {}) => {
			if (!panels[name]) return;
			bound.tab = name;
			for (const button of buttons) { const on = button.dataset.tab === name; button.setAttribute('aria-selected', String(on)); button.tabIndex = on ? 0 : -1; if (on && focus) button.focus(); }
			for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== name;
			if (name === 'animated' && !bound.maker) bound.maker = mount(panels.animated, host);
			if (scroller) scroller.scrollTop = 0;
			if (address) try { const hash = name === 'animated' ? '#animated' : ''; if (location.hash !== hash) history.replaceState(history.state, '', location.pathname + location.search + hash); } catch (_) {}
		};
		const click = event => { const tab = event.target.closest('[role="tab"]'); if (tab) show(tab.dataset.tab, {focus: true}); };
		const key = event => {
			const step = {ArrowRight: 1, ArrowLeft: -1}[event.key], at = buttons.findIndex(button => button.getAttribute('aria-selected') === 'true');
			if (step) { event.preventDefault(); show(buttons[(at + step + buttons.length) % buttons.length].dataset.tab, {focus: true}); }
			else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); show(buttons[event.key === 'Home' ? 0 : buttons.length - 1].dataset.tab, {focus: true}); }
		};
		const files = event => {
			if (bound.tab !== 'animated' || !bound.maker) return;
			const list = event.type === 'paste' ? [...event.clipboardData?.files || []].filter(file => /^(image|video)\//.test(file.type)) : [...event.dataTransfer?.files || []];
			if (event.type === 'dragover') { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); event.stopPropagation(); bound.maker.pick.toggleAttribute('data-over', true); } return; }
			if (event.type === 'dragleave') { if (!root.contains(event.relatedTarget)) bound.maker.pick.removeAttribute('data-over'); event.stopPropagation(); return; }
			if (!list.length) return;
			event.preventDefault(); event.stopPropagation(); bound.maker.pick.removeAttribute('data-over');
			add(bound.maker, list);
		};
		list.addEventListener('click', click); list.addEventListener('keydown', key);
		for (const type of ['dragover', 'dragleave', 'drop', 'paste']) root.addEventListener(type, files, true);
		const asked = _rapierJxlDoor?.tab || (location.hash === '#animated' ? 'animated' : 'still');
		if (asked === 'animated') show('animated', {address: false});
		return {
			get tab() { return bound.tab; },
			show,
			unbind() {
				list.removeEventListener('click', click); list.removeEventListener('keydown', key);
				for (const type of ['dragover', 'dragleave', 'drop', 'paste']) root.removeEventListener(type, files, true);
				if (bound.maker) unmount(bound.maker);
				bound.maker = null;
				try { if (location.hash === '#animated') history.replaceState(history.state, '', location.pathname + location.search); } catch (_) {}
			}};
	}
	function mount(panel, host) {
		const self = build();
		self.host = host; self.live = true; self.completeState = {};
		panel.append(self.root);
		for (const each of [self.rate, self.side, self.sizes, self.fits, self.scales, self.modes]) _rapierSwitchSlide(each.group);
		self.input.addEventListener('change', () => { add(self, [...self.input.files]); self.input.value = ''; });
		self.cancel.addEventListener('click', () => { self.controller?.abort(); self.waiting.length = 0; });
		const startMoved = () => { if (Number(self.start.input.value) > Number(self.end.input.value) - 0.1) { self.end.input.value = String(Math.min(self.clipLength, Number(self.start.input.value) + 0.1)); self.end.show(); } self.clipVideo.currentTime = Number(self.start.input.value); clipWords(self); };
		const endMoved = () => { if (Number(self.end.input.value) < Number(self.start.input.value) + 0.1) { self.start.input.value = String(Math.max(0, Number(self.end.input.value) - 0.1)); self.start.show(); } self.clipVideo.currentTime = Number(self.end.input.value); clipWords(self); };
		self.start.input.addEventListener('input', startMoved); self.end.input.addEventListener('input', endMoved);
		self.rate.on(value => { self.clipRate = value; clipWords(self); }); self.side.on(value => { self.clipSide = value; clipWords(self); });
		self.take.addEventListener('click', () => { takeClip(self).catch(error => say(self, error?.name === 'AbortError' ? 'Canceled' : C.exhausted(error) ? 'This device ran out of memory.' : C.refusal(error, self.clipFile))).finally(() => working(self, false)); });
		self.drop.addEventListener('click', () => endClip(self));
		self.strip.addEventListener('pointerdown', event => press(self, event));
		self.strip.addEventListener('keydown', event => keys(self, event));
		self.strip.addEventListener('contextmenu', event => { if (event.target.closest('.rapier-jxl-maker__frame')) event.preventDefault(); });
		for (const button of self.actions.querySelectorAll('[data-act]')) button.addEventListener('click', () => act(self, button.dataset.act));
		self.choose.addEventListener('click', () => { self.selected = M.pick(self.frames, {from: self.from.value, to: self.to.value, every: self.every.value}); self.anchor = [...self.selected][0] || 0; changed(self); });
		self.everything.addEventListener('click', () => { self.selected = self.selected.size === self.frames.length ? new Set() : new Set(self.frames.map(frame => frame.id)); changed(self); });
		self.delay.addEventListener('change', () => { commit(self, M.delay(self.frames, self.selected, self.delay.value)); self.delay.value = String(M.delayOf(self.delay.value)); });
		self.loops.addEventListener('change', () => { self.loopsChosen = true; const value = M.loopsOf(self.loops.value); self.loops.value = value ? String(value) : ''; stale(self); });
		self.sizes.on(value => { self.settings = {...self.settings, size: value}; changed(self); });
		self.fits.on(value => { self.settings = {...self.settings, fit: value}; changed(self); });
		self.scales.on(value => { self.settings = {...self.settings, scale: value}; changed(self); });
		for (const cell of self.aligns) cell.addEventListener('click', () => {
			for (const each of self.aligns) { const on = each === cell; each.toggleAttribute('data-active', on); each.setAttribute('aria-checked', String(on)); }
			self.settings = {...self.settings, align: [Number(cell.dataset.x), Number(cell.dataset.y)]}; changed(self);
		});
		self.modes.on(value => { self.mode = value; self.modeChosen = true; stale(self); });
		const level = () => { self.level.textContent = self.effort.input.value; self.effort.input.setAttribute('aria-valuetext', 'Effort ' + self.effort.input.value); };
		self.effort.input.addEventListener('input', level);
		self.effort.input.addEventListener('change', () => { self.effortValue = C.effortOf(self.effort.input.value); stale(self); });
		level();
		self.go.addEventListener('click', () => makeIt(self));
		self.download.addEventListener('click', () => save(self));
		self.root.addEventListener('keydown', event => {
			const mod = event.ctrlKey || event.metaKey, typing = event.target.matches?.('input[type="number"]');
			if (mod && !typing && (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y')) { event.preventDefault(); undo(self, event.key.toLowerCase() === 'z' && !event.shiftKey); return; }
			if (mod && event.key === 'Enter') { event.preventDefault(); makeIt(self); }
		});
		return self;
	}
	function unmount(self) {
		self.live = false;
		self.controller?.abort(); cancelAnimationFrame(self.raf);
		if (self.result) URL.revokeObjectURL(self.result.url);
		if (self.clipUrl) URL.revokeObjectURL(self.clipUrl);
		for (const frame of [...self.frames, ...self.history.flat()]) frame.picture.show?.close?.();
		self.frames = []; self.history = []; self.future = [];
		self.root.remove();
	}
	_rapierJxlMakerPart = Object.freeze({tabs, bind});
})();
