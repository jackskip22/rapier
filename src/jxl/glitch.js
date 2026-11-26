// SPDX-License-Identifier: AGPL-3.0-only
(() => {
	const C = globalThis.RapierJxlConvert, R = globalThis.RapierJxlGlitchRing;
	const ENGINE = (() => { try { return JSON.parse('RAPIER_JXL_GLITCH_ENGINE'); } catch (_) { return null; } })();
	const QUALITY_WORDS = Object.freeze({high: 'High', veryhigh: 'Very high', lossless: 'Lossless'});
	const LONG_MAX = 1280, LONG_MIN = 512;
	const make = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
	const size = bytes => bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + ' KB' : (bytes / 1048576).toFixed(bytes < 10485760 ? 2 : 1) + ' MB';
	const icon = paths => '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
	const ICONS = Object.freeze({
		undo: '<polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>',
		reset: '<polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>',
		clear: '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>',
		surprise: '<polyline points="16 3 21 3 21 8"></polyline><line x1="4" y1="20" x2="21" y2="3"></line><polyline points="21 16 21 21 16 21"></polyline><line x1="15" y1="15" x2="21" y2="21"></line><line x1="4" y1="4" x2="9" y2="9"></line>'});
	const action = (name, words) => {
		const button = make('button', 'settings-action-btn rapier-jxl-maker__action');
		button.type = 'button'; button.dataset.act = name; button.setAttribute('aria-label', words);
		button.innerHTML = icon(ICONS[name]); button.append(make('span', '', words));
		return button;
	};
	const box = (words, cls = '') => { const button = make('button', 'settings-action-btn rapier-jxl-view__all' + cls, words); button.type = 'button'; return button; };
	const row = (...nodes) => { const node = make('div', 'rapier-jxl-maker__row'); node.append(...nodes); return node; };
	const part = (label, ...nodes) => { const node = make('div', 'rapier-jxl-view__part'); node.append(make('p', 'rapier-jxl-view__label', label), ...nodes); return node; };

	function build() {
		const root = make('div', 'rapier-jxl-maker rapier-jxl-glitch'), fold = make('div', 'rapier-jxl-view__fold');
		const pick = make('label', 'settings-action-btn rapier-jxl-view__pick'), input = make('input');
		pick.append(C.pickLabel(make('span')), input);
		input.type = 'file'; input.accept = 'image/*,.jxl,.heic,.heif';
		const stage = make('div', 'rapier-jxl-glitch__stage'), frame = make('div', 'rapier-jxl-glitch__frame'), canvas = make('canvas', 'rapier-jxl-glitch__picture');
		canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'The glitched picture');
		frame.append(canvas); stage.append(frame); stage.hidden = true;
		const status = make('p', 'rapier-jxl-view__note rapier-jxl-view__note--center rapier-jxl-glitch__status');
		status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
		const breaking = make('div', 'rapier-jxl-glitch__controls'), actions = make('div', 'rapier-jxl-maker__actions');
		actions.append(action('undo', 'Undo'), action('reset', 'Reset'), action('clear', 'Clear'), action('surprise', 'Surprise'));
		const another = box('Picture'), capture = box('Capture');
		breaking.append(actions, row(another, capture));
		breaking.hidden = true;
		const capturing = make('div', 'rapier-jxl-glitch__controls');
		const modes = make('div', 'theme-switcher theme-switcher--joined theme-switcher--onoff');
		modes.setAttribute('role', 'radiogroup'); modes.setAttribute('aria-label', 'Quality');
		const modeButtons = Object.keys(C.QUALITY).map(mode => {
			const button = make('button', 'theme-switcher__btn onoff-btn', QUALITY_WORDS[mode]), on = mode === 'high';
			button.type = 'button'; button.dataset.mode = mode; button.setAttribute('role', 'radio'); button.setAttribute('aria-checked', String(on)); button.toggleAttribute('data-active', on);
			return button;
		});
		modes.append(...modeButtons);
		const effortRow = make('div', 'rapier-jxl-view__effort rapier-jxl-view__effort--range'), seek = make('span', 'rapier-draw-seek'), track = make('span', 'rapier-draw-seek-track');
		const head = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle'), level = make('output', 'rapier-jxl-view__effort-level'), slider = make('input');
		effortRow.setAttribute('role', 'group'); effortRow.setAttribute('aria-label', 'Effort');
		slider.type = 'range'; slider.min = String(C.EFFORT.min); slider.max = String(C.EFFORT.max); slider.step = '1'; slider.value = String(C.EFFORT.start); slider.setAttribute('aria-label', 'Effort');
		track.setAttribute('aria-hidden', 'true'); head.setAttribute('class', 'rapier-draw-seek-head'); head.setAttribute('viewBox', '0 0 24 24'); head.setAttribute('aria-hidden', 'true');
		for (const [name, value] of [['cx', '12'], ['cy', '12'], ['r', '10']]) ring.setAttribute(name, value);
		head.append(ring); seek.append(track, head, level, slider);
		effortRow.append(make('span', 'rapier-jxl-view__end', 'Fast'), seek, make('span', 'rapier-jxl-view__end', 'Small'));
		const quality = part('Quality:', modes), effort = part('Effort:', effortRow);
		C.liftToLabel(seek, level, effort.firstElementChild);
		const back = box('Back'), make_ = box('Capture'), line = make('div', 'rapier-progress__bar rapier-jxl-view__line');
		line.hidden = true;
		const saveJxl = box('Save JXL'), savePng = box('Save PNG'), saves = row(saveJxl, savePng);
		saves.hidden = true;
		capturing.append(quality, effort, row(back, make_), line, saves);
		capturing.hidden = true;
		fold.append(pick, stage, status, breaking, capturing, _rapierToolFooter('/jxl', 'rapier-jxl', 'rapier-jxl', false, C.LINKS.slice(2)));
		root.append(fold, _rapierToolAlso('/jxl'));
		return {root, pick, input, stage, frame, canvas, context: canvas.getContext('2d', {willReadFrequently: true}), status, breaking, actions, another, capture,
			capturing, modes, modeButtons, seek, level, slider, back, make: make_, line, saves, saveJxl, savePng,
			mode: 'high', effortValue: C.EFFORT.start, strengths: {}, seed: 1, history: [], picture: null, name: 'picture', native: null, busy: false, wanted: false, captured: null};
	}

	function engineOf(self) {
		if (!ENGINE) return Promise.reject(new Error('This copy has no glitch engine.'));
		const url = URL.createObjectURL(new Blob([ENGINE], {type: 'text/javascript'})), worker = new Worker(url, {name: 'glitch worker'}), waiting = new Map();
		let next = 1;
		self.worker = worker; self.workerUrl = url;
		worker.addEventListener('message', ({data}) => { const w = waiting.get(data.id); if (!w) return; waiting.delete(data.id); data.error ? w.reject(Object.assign(new Error(data.error.message), {code: data.error.code})) : w.resolve(data); });
		worker.addEventListener('error', event => { event.preventDefault(); for (const w of waiting.values()) w.reject(new Error(event.message || 'The glitch engine stopped.')); waiting.clear(); });
		self.call = (message, transfer = []) => new Promise((resolve, reject) => { const id = next++; waiting.set(id, {resolve, reject}); worker.postMessage({...message, id}, transfer); });
		return self.call({type: 'hello'});
	}

	async function load(self, file) {
		if (!self.live || !file) return;
		let bitmap;
		try { bitmap = await createImageBitmap(file, {imageOrientation: 'from-image'}); }
		catch (error) { say(self, C.refusal(error, file)); return; }
		if (!self.live) { bitmap.close(); return; }
		const long = Math.max(bitmap.width, bitmap.height), scale = long > LONG_MAX ? LONG_MAX / long : long < LONG_MIN ? LONG_MIN / long : 1;
		const width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
		self.canvas.width = width; self.canvas.height = height;
		self.context.drawImage(bitmap, 0, 0, width, height); bitmap.close();
		const data = self.context.getImageData(0, 0, width, height).data;
		self.picture = {width, height, data: data.slice()}; self.name = String(file.name || 'picture').replace(/\.[^.]*$/, '') || 'picture';
		self.pick.hidden = true; self.stage.hidden = false; self.breaking.hidden = false; self.capturing.hidden = true; forget(self);
		fit(self);
		try { await self.ready; await self.call({type: 'picture', data, width, height}, [data.buffer]); }
		catch (error) { say(self, error.message); return; }
		render(self);
	}
	function fit(self) {
		if (!self.picture || !self.ring) return;
		const width = self.stage.clientWidth, most = Math.max(240, Math.round(innerHeight * 0.7)), {width: w, height: h} = self.picture;
		const scale = Math.min(width / w, most / h), fw = Math.max(1, Math.floor(w * scale)), fh = Math.max(1, Math.floor(h * scale));
		self.frame.style.width = fw + 'px'; self.frame.style.height = fh + 'px';
		self.ring.layout(fw, fh);
	}

	function render(self) { forget(self); self.wanted = true; if (!self.busy) void pump(self); }
	async function pump(self) {
		self.busy = true;
		try {
			while (self.wanted && self.picture && self.live) {
				self.wanted = false;
				const t = performance.now();
				let out;
				try { out = await self.call({type: 'render', strengths: {...self.strengths}, seed: self.seed, decode: self.native === false}); }
				catch (error) { say(self, error.message); continue; }
				if (!self.live) return;
				let by = 'rapier-jxl';
				if (out.pixels) self.context.putImageData(new ImageData(new Uint8ClampedArray(out.pixels.data.buffer, out.pixels.data.byteOffset, out.pixels.data.length), out.pixels.width, out.pixels.height), 0, 0);
				else {
					try {
						const shown = await createImageBitmap(new Blob([out.bytes], {type: 'image/jxl'}));
						self.context.drawImage(shown, 0, 0, self.canvas.width, self.canvas.height); shown.close(); self.native = true; by = 'this browser';
					} catch (_) {
						self.native = false; self.wanted = true; continue;
					}
				}
				if (!self.capturing.hidden) continue;
				say(self, Math.round(performance.now() - t) + ' ms · ' + by);
			}
		} finally { self.busy = false; }
	}

	const get = (self, id) => self.strengths[id] ?? 0;
	function remember(self) { self.history.push({strengths: {...self.strengths}, seed: self.seed}); if (self.history.length > 200) self.history.shift(); paintButtons(self); }
	function paintButtons(self) {
		const button = name => self.actions.querySelector('[data-act="' + name + '"]');
		button('undo').disabled = !self.history.length;
		button('reset').disabled = !self.ring || !get(self, self.ring.chosen);
		button('clear').disabled = !Object.values(self.strengths).some(v => v > 0);
	}
	function changed(self) { self.ring?.draw(); paintButtons(self); render(self); }
	function act(self, name) {
		if (!self.ring) return;
		if (name === 'undo') { const was = self.history.pop(); if (!was) return; self.strengths = {...was.strengths}; self.seed = was.seed; }
		else if (name === 'reset') { remember(self); self.strengths[self.ring.chosen] = 0; }
		else if (name === 'clear') { remember(self); self.strengths = {}; }
		else if (name === 'surprise') {
			remember(self);
			self.seed = 1 + Math.floor(Math.random() * 2147483646);
			self.strengths = Object.fromEntries(self.segments.map(s => [s.id, Math.random() < 0.28 ? 0.2 + 0.75 * Math.random() : 0]));
		}
		changed(self);
	}

	function forget(self) { self.captured = null; self.saves.hidden = true; }
	function capturingShown(self, on) {
		self.breaking.hidden = on; self.capturing.hidden = !on;
		if (!on) say(self, '');
		else if (!self.captured) say(self, '');
	}
	async function captureIt(self) {
		if (!self.picture || self.making) return;
		self.making = true; self.make.disabled = true; self.saves.hidden = true;
		const {width, height} = self.canvas, data = new Uint8Array(self.context.getImageData(0, 0, width, height).data.buffer);
		const options = self.mode === 'lossless' ? {fidelity: 'exact', effort: self.effortValue} : {fidelity: {quality: C.QUALITY[self.mode]}, effort: self.effortValue};
		const signal = (self.controller = new AbortController()).signal, codec = globalThis.RapierEmbeddedImages.codec;
		self.line.hidden = false; self.line.style.setProperty('--rapier-progress', '0');
		const progress = value => self.line.style.setProperty('--rapier-progress', String(Math.max(0, Math.min(1, value))));
		say(self, 'Making the file');
		try {
			const made = await codec('encode', {width, height, data}, options, {signal, progress});
			if (!self.live) return;
			self.captured = {bytes: made, png: null};
			self.saves.hidden = false;
			say(self, 'Glitch ' + size(made.length));
			progress(0);
			const original = await codec('encode', {width, height, data: self.picture.data.slice()}, options, {signal, progress});
			if (self.live && self.captured?.bytes === made) say(self, 'Glitch ' + size(made.length) + ' · original ' + size(original.length));
		} catch (error) {
			if (self.live) say(self, error?.name === 'AbortError' ? 'Canceled' : C.exhausted(error) ? 'This device ran out of memory.' : C.refusal(error));
		} finally { self.making = false; self.make.disabled = false; self.line.hidden = true; }
	}
	function saveIt(self, kind) {
		const captured = self.captured;
		if (!captured) return;
		if (kind === 'jxl') { self.host.save?.(new Blob([captured.bytes], {type: 'image/jxl'}), self.name + '-glitch.jxl'); return; }
		self.canvas.toBlob(blob => { if (blob && self.live) self.host.save?.(blob, self.name + '-glitch.png'); }, 'image/png');
	}
	function say(self, text) { self.status.textContent = text || ''; }

	function mount(panel, host = {}) {
		const self = build();
		self.host = host; self.live = true;
		panel.append(self.root);
		_rapierSwitchSlide(self.modes);
		self.ready = engineOf(self).then(({segments}) => {
			if (!self.live) return;
			self.segments = segments;
			self.ring = R.createRing([segments.filter(s => !s.inner), segments.filter(s => s.inner)], {get: id => get(self, id), on: {
				choose: () => paintButtons(self), start: () => remember(self), change: (id, value) => { self.strengths[id] = value; paintButtons(self); render(self); }, end: () => {},
			}});
			self.frame.append(self.ring.root, self.ring.label);
			paintButtons(self); fit(self);
		});
		self.ready.catch(error => say(self, error.message));
		self.resize = new ResizeObserver(() => fit(self));
		self.resize.observe(self.stage);
		self.input.addEventListener('change', () => { const file = self.input.files[0]; self.input.value = ''; void load(self, file); });
		self.another.addEventListener('click', () => self.input.click());
		for (const button of self.actions.querySelectorAll('[data-act]')) button.addEventListener('click', () => act(self, button.dataset.act));
		self.capture.addEventListener('click', () => capturingShown(self, true));
		self.back.addEventListener('click', () => { self.controller?.abort(); capturingShown(self, false); });
		self.make.addEventListener('click', () => void captureIt(self));
		self.saveJxl.addEventListener('click', () => saveIt(self, 'jxl'));
		self.savePng.addEventListener('click', () => saveIt(self, 'png'));
		for (const button of self.modeButtons) button.addEventListener('click', () => {
			if (button.dataset.mode === self.mode) return;
			self.mode = button.dataset.mode; forget(self);
			for (const each of self.modeButtons) { const on = each === button; each.toggleAttribute('data-active', on); each.setAttribute('aria-checked', String(on)); }
			_rapierSwitchSlide(self.modes);
		});
		self.modes.addEventListener('keydown', event => {
			const step = {ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1}[event.key];
			if (!step) return;
			const at = self.modeButtons.findIndex(button => button.hasAttribute('data-active')), next = self.modeButtons[(at + step + self.modeButtons.length) % self.modeButtons.length];
			event.preventDefault(); event.stopPropagation(); next.click(); next.focus();
		});
		const level = () => {
			const value = Number(self.slider.value);
			self.seek.style.setProperty('--seek-frac', String((value - C.EFFORT.min) / (C.EFFORT.max - C.EFFORT.min)));
			self.level.textContent = String(value); self.slider.setAttribute('aria-valuetext', 'Effort ' + value);
		};
		self.slider.addEventListener('input', level);
		self.slider.addEventListener('change', () => { self.effortValue = C.effortOf(self.slider.value); forget(self); });
		self.slider.addEventListener('pointerdown', () => self.seek.classList.add('rapier-draw-seek--active'));
		for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) self.slider.addEventListener(type, () => self.seek.classList.remove('rapier-draw-seek--active'));
		level();
		self.root.addEventListener('keydown', event => {
			if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && !event.target.matches?.('input[type="number"],input[type="text"]')) { event.preventDefault(); act(self, 'undo'); }
		});
		paintButtons(self);
		return self;
	}
	function take(self, files) {
		const file = [...files].find(each => /^image\//.test(each.type) || /\.(jxl|heic|heif)$/i.test(each.name));
		if (file) void load(self, file);
	}
	function unmount(self) {
		self.live = false;
		self.controller?.abort(); self.resize?.disconnect();
		self.worker?.terminate(); if (self.workerUrl) URL.revokeObjectURL(self.workerUrl);
		self.root.remove();
	}
	_rapierJxlGlitchPart = Object.freeze({mount, unmount, take});
})();
