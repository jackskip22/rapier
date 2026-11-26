// SPDX-License-Identifier: AGPL-3.0-only
(() => {
	const C = globalThis.RapierJxlConvert;
	const LANES = 2;
	const QUALITY_WORDS = Object.freeze({high: 'High', veryhigh: 'Very high', lossless: 'Lossless'});
	const START_MODE = 'high';
	const JXL_VERSION = (() => { try { return JSON.parse('RAPIER_JXL_VERSION'); } catch (_) { return null; } })();
	const UPLOAD_KB = (() => { try { return JSON.parse('RAPIER_JXL_UPLOAD_KB'); } catch (_) { return null; } })();
	const ANDROID_APP = 'https://play.google.com/store/apps/details?id=app.rapier&referrer=utm_source%3Djxl-page';
	let view = null;
	const make = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
	const size = bytes => bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + ' KB' : bytes < 1073741824 ? (bytes / 1048576).toFixed(bytes < 10485760 ? 2 : 1) + ' MB' : (bytes / 1073741824).toFixed(2) + ' GB';
	const percent = r => { const change = Math.round((1 - r.size / r.before) * 100); return change > 0 ? change + '% smaller' : change < 0 ? -change + '% larger' : 'same size'; };

	const anchor = (label, href) => { const link = make('a', '', label); link.href = href; link.target = '_blank'; link.rel = 'noopener'; return link; };
	function about() {
		const list = _rapierInfoSheetShow('rapier-jxl', C.ABOUT);
		for (const [label, href] of C.LINKS) { const item = make('li'); item.append(anchor(label, href)); list.append(item); }
	}
	const ADVANCED = Object.freeze({
		limits: Object.freeze(C.ADVANCED.limits.map(bytes => [bytes, C.bytesWords(bytes)])),
		sides: Object.freeze(C.ADVANCED.sides.map(side => [side, side ? String(side) : 'Original']))});
	function arrowKeys(group, buttons) {
		group.addEventListener('keydown', event => {
			const step = {ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1}[event.key];
			if (!step) return;
			const list = buttons(), at = list.findIndex(button => button.hasAttribute('data-active')), next = list[(at + step + list.length) % list.length];
			event.preventDefault(); next.click(); next.focus();
		});
	}
	function advancedPart() {
		const node = make('div', 'settings-disclosure-shell rapier-jxl-view__advanced rapier-jxl-view__full'), id = 'rapier-jxl-advanced';
		const title = make('button', 'settings-disclosure-title rapier-jxl-view__advanced-title'), glyph = make('span', 'settings-disclosure-title__glyph');
		title.type = 'button'; title.setAttribute('aria-expanded', 'false'); title.setAttribute('aria-controls', id); glyph.setAttribute('aria-hidden', 'true');
		title.append(make('span', 'rapier-jxl-view__label', 'Advanced'), glyph);
		const shell = make('div', 'settings-disclosure'), inner = make('div', 'settings-disclosure__inner'), body = make('div', 'rapier-jxl-view__advanced-body');
		shell.id = id; shell.dataset.open = 'false'; shell.setAttribute('aria-hidden', 'true'); shell.inert = true;
		const part = {node, title, shell, onQuality: null, onChange: null};
		const joined = (label, choices, chosen) => {
			const group = make('div', 'theme-switcher theme-switcher--joined theme-switcher--onoff');
			group.setAttribute('role', 'radiogroup'); group.setAttribute('aria-label', label);
			for (const [value, words] of choices) {
				const button = make('button', 'theme-switcher__btn onoff-btn', words);
				button.type = 'button'; button.dataset.value = String(value); button.setAttribute('role', 'radio');
				group.append(button);
			}
			const control = {group, value: null, set(value) {
				control.value = value;
				for (const each of group.children) { const on = each.dataset.value === String(value); each.toggleAttribute('data-active', on); each.setAttribute('aria-checked', String(on)); }
				_rapierSwitchSlide(group);
			}};
			group.addEventListener('click', event => {
				const button = event.target.closest('button[data-value]');
				if (!button || Number(button.dataset.value) === control.value) return;
				control.set(Number(button.dataset.value)); chosen();
			});
			arrowKeys(group, () => [...group.children]);
			return control;
		};
		const onoff = (label, chosen, under) => {
			const stack = make('div', 'settings-switch-stack'), group = make('div', 'theme-switcher theme-switcher--joined theme-switcher--onoff');
			const button = make('button', 'theme-switcher__btn onoff-btn');
			group.dataset.switchLabel = label; group.setAttribute('role', 'group'); group.setAttribute('aria-label', label);
			button.type = 'button'; button.setAttribute('role', 'switch');
			let below = null;
			const control = {on: false, set(on) {
				control.on = on;
				button.textContent = label + ': ' + (on ? 'On' : 'Off'); button.toggleAttribute('data-active', on); button.setAttribute('aria-checked', String(on));
				if (below) { below.dataset.open = String(on); below.inert = !on; if (on) _rapierSwitchSlide(under); }
			}};
			group.append(button); stack.append(group);
			if (under) { below = make('div', 'settings-disclosure settings-switch-stack__under'); const holder = make('div', 'settings-disclosure__inner'); holder.append(under); below.append(holder); stack.append(below); }
			button.addEventListener('click', () => { control.set(!control.on); chosen(); });
			control.set(false);
			control.node = stack;
			return control;
		};
		const labelled = (words, ...nodes) => { const box = make('div', 'rapier-jxl-view__part'); box.append(make('p', 'rapier-jxl-view__label', words), ...nodes); return box; };
		const row = make('div', 'rapier-jxl-view__effort rapier-jxl-view__effort--range'), seek = make('span', 'rapier-draw-seek'), track = make('span', 'rapier-draw-seek-track');
		const head = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle'), level = make('output', 'rapier-jxl-view__effort-level'), slider = make('input');
		slider.type = 'range'; slider.min = '1'; slider.max = '100'; slider.step = '1'; slider.setAttribute('aria-label', 'Quality number');
		track.setAttribute('aria-hidden', 'true'); head.setAttribute('class', 'rapier-draw-seek-head'); head.setAttribute('viewBox', '0 0 24 24'); head.setAttribute('aria-hidden', 'true');
		for (const [name, value] of [['cx', '12'], ['cy', '12'], ['r', '10']]) ring.setAttribute(name, value);
		head.append(ring); seek.append(track, head, level, slider);
		row.append(make('span', 'rapier-jxl-view__end', 'Small'), seek, make('span', 'rapier-jxl-view__end', 'Best'));
		const number = labelled('Quality number:', row);
		C.liftToLabel(seek, level, number.firstElementChild);
		part.show = value => { slider.value = String(value); seek.style.setProperty('--seek-frac', String((value - 1) / 99)); level.textContent = String(value); slider.setAttribute('aria-valuetext', 'Quality ' + value); };
		slider.addEventListener('input', () => { part.show(Number(slider.value)); part.onQuality?.(Number(slider.value), false); });
		slider.addEventListener('change', () => part.onQuality?.(Number(slider.value), true));
		slider.addEventListener('pointerdown', () => seek.classList.add('rapier-draw-seek--active'));
		for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) slider.addEventListener(event, () => seek.classList.remove('rapier-draw-seek--active'));
		const changed = () => part.onChange?.(part.read());
		part.limit = joined('Size limit', ADVANCED.limits, changed);
		part.limitOn = onoff('Size limit', changed, part.limit.group);
		part.side = joined('Longer side', ADVANCED.sides, changed);
		part.location = onoff('Remove location', changed);
		part.read = () => ({limit: part.limitOn.on ? part.limit.value : 0, limitChoice: part.limit.value, side: part.side.value, location: !part.location.on});
		part.set = ({limit, limitChoice, side, location} = {}) => {
			if (limitChoice !== undefined) part.limit.set(limitChoice);
			if (limit !== undefined) { if (limit) part.limit.set(limit); part.limitOn.set(!!limit); }
			if (side !== undefined) part.side.set(side);
			if (location !== undefined) part.location.set(!location);
		};
		part.limit.set(C.ADVANCED.limit); part.side.set(0);
		body.append(number, part.limitOn.node, labelled('Longer side:', part.side.group), part.location.node);
		inner.append(body); shell.append(inner); node.append(title, shell);
		title.addEventListener('click', () => {
			const open = shell.dataset.open !== 'true';
			shell.dataset.open = String(open); shell.inert = !open; shell.setAttribute('aria-hidden', String(!open)); title.setAttribute('aria-expanded', String(open));
			if (open) for (const group of body.querySelectorAll('.theme-switcher')) _rapierSwitchSlide(group);
		});
		return part;
	}
	const STORED = Object.freeze({quality: 'jxlQuality', limit: 'jxlSizeLimit', limitChoice: 'jxlSizeLimitChoice', side: 'jxlLongerSide', removeLocation: 'jxlRemoveLocation'});
	const stored = field => { try { return typeof RapierPreferences === 'object' ? RapierPreferences.read(STORED[field]) : undefined; } catch (_) { return undefined; } };
	const store = (field, value) => { try { if (typeof RapierPreferences === 'object') RapierPreferences.write(STORED[field], value); } catch (_) {} };
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
		const pick = make('label', 'settings-action-btn rapier-jxl-view__pick'), input = make('input'), pickText = C.pickLabel(make('span'));
		pick.append(pickText, input);
		input.type = 'file'; input.accept = 'image/*,video/*,.jxl,.exr,.hdr'; input.multiple = true;
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
		slider.type = 'range'; slider.min = String(C.STILL_EFFORT.min); slider.max = String(C.STILL_EFFORT.max); slider.step = '1'; slider.value = String(C.STILL_EFFORT.start); slider.setAttribute('aria-label', 'Effort');
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
		const advanced = advancedPart();
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
		fold.append(pick, files, quick, quality, effort, advanced.node);
		const links = make('div', 'rapier-tool-footer rapier-jxl-view__links'), linkLine = make('p', 'rapier-tool-footer__line');
		const release = JXL_VERSION ? [['rapier-jxl ' + JXL_VERSION, 'https://github.com/jackskip22/rapier-jxl/releases/tag/v' + JXL_VERSION]] : [];
		const android = typeof _rapierAndroidBrowser === 'function' && _rapierAndroidBrowser() ? [['Android app', ANDROID_APP]] : [];
		linkLine.append(...[...release, ...C.LINKS, ...android].map(([label, href]) => anchor(label, href)));
		links.append(linkLine);
		const more = make('section', 'rapier-jxl-view__more'), moreTitle = make('h2', 'rapier-jxl-view__title', C.COMPARE.title), facts = make('ul', 'rapier-jxl-view__facts');
		moreTitle.id = 'rapier-jxl-compare'; more.setAttribute('aria-labelledby', moreTitle.id);
		for (const fact of C.COMPARE.lines) facts.append(make('li', 'rapier-jxl-view__note', UPLOAD_KB ? fact.replace('{upload}', UPLOAD_KB) : fact.replace(' about {upload} KB,', '')));
		more.append(moreTitle, facts, make('p', 'rapier-jxl-view__note', C.COMPARE.basis));
		const scene = make('section', 'rapier-jxl-view__more'), sceneTitle = make('h2', 'rapier-jxl-view__title', C.SCENE.title), stage = make('div', 'rapier-jxl-scene__stage');
		sceneTitle.id = 'rapier-jxl-scene'; scene.setAttribute('aria-labelledby', sceneTitle.id);
		scene.append(sceneTitle, make('p', 'rapier-jxl-view__note', C.SCENE.note), stage);
		const clipBlock = spec => {
			const local = spec.local !== false;
			const section = make('section', 'rapier-jxl-view__more'), title = make('h2', 'rapier-jxl-view__title', spec.title), slot = make('div', 'rapier-jxl-view__example rapier-jxl-view__example--full'), note = make('p', 'rapier-jxl-view__note' + (local ? '' : ' rapier-jxl-view__note--center'));
			title.id = spec.id; section.setAttribute('aria-labelledby', title.id);
			section.append(title, slot);
			if (spec.credit) section.append(make('p', 'rapier-jxl-view__note', spec.credit));
			section.append(note);
			return {spec, section, slot, note, shown: null, near: null};
		};
		const example = clipBlock({...C.EXAMPLE, id: 'rapier-jxl-example'}), clip = clipBlock({...C.CLIP, id: 'rapier-jxl-clip'});
		const localNote = make('p', 'rapier-jxl-view__note', C.LOCAL_NOTE.join(' '));
		const big = {section: make('section', 'rapier-jxl-view__more'), title: make('h2', 'rapier-jxl-view__title', C.BIG.title), row: make('div', 'rapier-jxl-view__bigbar'),
			load: make('button', 'settings-action-btn', C.BIG.button), info: make('button', 'settings-info-btn'), box: make('div', 'rapier-jxl-view__big'), note: make('p', 'rapier-jxl-view__note rapier-jxl-view__note--center'), timer: 0, url: null, playing: false};
		big.title.id = C.BIG.id; big.section.setAttribute('aria-labelledby', big.title.id);
		big.load.type = 'button'; big.info.type = 'button'; big.info.setAttribute('aria-label', 'about progressive JPEG XL'); big.info.setAttribute('aria-haspopup', 'dialog');
		big.info.innerHTML = info.innerHTML;
		big.box.hidden = big.note.hidden = true; big.note.setAttribute('aria-live', 'polite');
		big.box.style.aspectRatio = C.BIG.width + ' / ' + C.BIG.height;
		big.row.append(big.load, big.box, big.info); big.section.append(big.title, big.row, big.note);
		_rapierJxlMakerPart.tabs(body, [fold, localNote, example.section, links, more, big.section, clip.section, _rapierToolAlso('/jxl')], [scene, _rapierToolAlso('/jxl')]);
		root.append(bar, body);
		return {info, root, shut, input, group, modes, quick: {root: quick, qualityOpen, effortOpen, qualityDrop, effortDrop}, effort: C.EFFORT.start, quality: C.QUALITY[START_MODE], limit: 0, side: 0, location: true, advanced, slider, seek, level, line, count, cancel, list, all, help, pick, pickText, scene, stage, clips: [example, clip], big, showing: null, following: null, rows: [], mode: START_MODE, running: false, controller: null, inert: [], wasFocus: null};
	}

	function clearPicture(self) {
		const row = self.showing;
		self.showing = null;
		row?.picture?.close();
		if (row) row.picture = null;
		self.pick.querySelector('img')?.remove();
		filled(self);
	}
	function showPicture(self, row, manual = false) {
		if (self !== view || row.removed) return;
		if (self.showing !== row) {
			clearPicture(self); self.showing = row;
			row.picture = C.createPicture(shown => {
				if (self !== view || self.showing !== row || row.removed) return;
				const previous = self.pick.querySelector('img');
				if (!shown) { previous?.remove(); filled(self); return; }
				if (previous?.getAttribute('src') === shown.url) return;
				const image = make('img', 'rapier-jxl-view__pick-picture');
				image.alt = row.name; image.decoding = 'async'; image.src = shown.url;
				if (previous) previous.replaceWith(image); else self.pick.prepend(image);
				filled(self);
			});
			if (row.state === 'done') void row.picture.finish(row.result.blob);
			else void row.picture.source(row.file);
		}
		if (manual) self.pick.scrollIntoView({block: 'nearest'});
	}
	function followPicture(self, row) {
		if (self !== view || row.removed || row.state !== 'working' || self.following?.run === row.previewRun) return;
		self.following = {row, run: row.previewRun}; showPicture(self, row);
	}
	function sourcePicture(row) {
		if (!row.removed && row.owner === view) void row.picture?.source(row.file);
	}
	function finishPicture(row, blob) {
		if (row.removed || row.owner !== view) return;
		if (!row.owner.showing) showPicture(row.owner, row);
		else void row.picture?.finish(blob);
	}
	function filled(of) {
		of.pick.toggleAttribute('data-filled', !!of.pick.querySelector('img') || of.rows.some(row => row.state === 'working' || row.state === 'waiting'));
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
		else text = size(r.before) + ' → ' + size(r.size) + ' · ' + percent(r) + (r.side ? ' · ' + r.side + ' px' : '') + (r.located ? ' · location removed' : '') + (r.exact ? ' · restores your JPEG exactly' + (r.exactKept ? ' · lossy is no smaller' : '') : r.fallback ? ' · made lossless: this browser could not open the smaller file' : r.jpeg ? (r.before > C.CARRY_BYTES ? ' · over ' + C.CARRY_BYTES / 1048576 + ' MB, so made from its pixels' : ' · ' + (r.mode === 'lossless' ? 'made from its pixels, so the JPEG can\'t be restored' : 'lossy')) : r.note === 'bits8' ? ' · kept at 8 bits' : r.note === 'colors' ? ' · converted to sRGB' : r.mode === 'lossless' ? ' · lossless' : '') + (r.refused ? ' · this browser cannot open this file' : '');
		note.textContent = text;
		download.hidden = row.state !== 'done';
		row.nameButton.disabled = row.state !== 'done';
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
		const rows = of.rows, done = rows.filter(row => row.state === 'done' && row.result), settled = rows.filter(row => row.state !== 'waiting' && row.state !== 'working').length;
		const working = rows.some(row => row.state === 'working' || row.state === 'waiting');
		let fraction = rows.length ? (settled + rows.filter(row => row.state === 'working').reduce((sum, row) => sum + (row.progress || 0), 0)) / rows.length : 0;
		of.line.style.setProperty('--rapier-progress', String(Math.min(1, fraction)));
		of.line.hidden = !working;
		const before = done.reduce((sum, row) => sum + row.result.before, 0), after = done.reduce((sum, row) => sum + row.result.size, 0);
		of.count.textContent = !rows.length ? '' : (working ? settled + ' of ' + rows.length + ' · ' : done.length + ' of ' + rows.length + ' converted · ') + (done.length ? size(before) + ' → ' + size(after) : '');
		of.cancel.hidden = !of.running;
		of.all.hidden = done.length < 2;
		filled(of);
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
				row.state = 'working'; row.progress = 0; row.say = ''; row.stop = new AbortController();
				const previewRun = row.previewRun = {};
				const current = () => self === view && row.previewRun === previewRun && row.state === 'working' && !row.removed && !signal.aborted && !row.stop?.signal.aborted;
				paint(row); overall(self);
				if (!self.following) followPicture(self, row);
				try {
					const key = keyOf(self), {quality, effort, limit, side, location} = self;
					const made = await C.convert(row.file, {quality, effort, maxBytes: limit, side, location, complete: completeFor(self, row), signal: AbortSignal.any([signal, row.stop.signal]),
						onPreview: (frame, preview) => { if (!current()) return; followPicture(self, row); return row.picture?.preview(frame, preview); },
						say: text => { row.say = text; paint(row); follow1(self, row); },
						progress: value => {
							if (current() && value > 0 && (!row.progress || !self.following)) followPicture(self, row);
							row.progress = value; paint(row); overall(self); follow1(self, row);
						}});
					const {also, ...kept} = made;
					row.results.set(key, kept);
					if (also && (!limit || also.size <= limit)) row.results.set(keyOf({effort, limit, side, location}, 100), also);
					if (kept.ext && !row.outputName.toLowerCase().endsWith(kept.ext)) row.outputName = C.outputName(row.file.name, new Set(self.rows.filter(other => other !== row).map(other => other.outputName.toLowerCase())), kept.ext);
					const now = row.results.get(keyOf(self));
					if (now) { row.result = now; row.state = 'done'; finishPicture(row, now.blob); }
					else { row.state = 'waiting'; sourcePicture(row); }
				} catch (error) {
					row.picture?.stop();
					if (error?.name === 'AbortError') { row.state = 'stopped'; row.say = 'Canceled'; }
					else if (error?.code === 'IMAGE_CANCELLED' && (row.again = (row.again || 0) + 1) <= 3) row.state = 'waiting';
					else if (C.exhausted(error)) {
						out = true; row.state = 'stopped'; row.say = 'Not converted: this device ran out of memory';
						self.help.textContent = 'This device ran out of memory. The files that finished are kept; choose the rest again, a few at a time.';
					} else { row.state = 'failed'; row.say = C.refusal(error, row.file); }
				}
				row.stop = null; row.previewRun = null;
				if (row.removed) row.results.clear();
				paint(row); overall(self); follow1(self, row);
			}
		};
		try { await Promise.all(Array.from({length: LANES}, lane)); }
		finally {
			for (const row of self.rows) if (row.state === 'waiting') { row.picture?.stop(); row.state = 'stopped'; row.say = signal.aborted ? 'Canceled' : 'Not converted'; paint(row); }
			self.running = false; self.controller = null; overall(self);
			if (!signal.aborted) document.getElementById('sr-live')?.replaceChildren(document.createTextNode(self.rows.filter(row => row.state === 'done').length + ' files converted'));
			if (!signal.aborted) try { self.settled?.(self.rows.map(row => ({file: row.file, name: row.name, state: row.state, say: row.say, before: row.result?.before, size: row.result?.size}))); } catch (_) {}
		}
	}

	const keyOf = (of, quality = of.quality) => [quality, of.effort, of.limit, of.side, of.location].join('|');
	function remake() {
		for (const row of view.rows) {
			if (row.state === 'working') continue;
			const hit = row.results.get(keyOf(view));
			if (hit) { row.result = hit; row.state = 'done'; finishPicture(row, hit.blob); }
			else { row.state = 'waiting'; sourcePicture(row); }
			paint(row);
		}
		overall(); void run();
	}
	function seekTo(of) {
		const {min, max, long, slow} = C.STILL_EFFORT, value = C.effortOf(of.slider.value, C.STILL_EFFORT);
		of.seek.style.setProperty('--seek-frac', String((value - min) / (max - min)));
		of.seek.classList.toggle('rapier-jxl-view__seek--slow', value === slow);
		of.seek.classList.toggle('rapier-jxl-view__seek--long', value === long);
		of.level.textContent = String(value);
		of.slider.setAttribute('aria-valuetext', 'Effort ' + value);
	}

	function add(files) {
		if (!view || !files.length) return;
		const self = view;
		view.help.textContent = '';
		const fragment = document.createDocumentFragment();
		for (const file of files) {
			const row = {file, owner: self, state: 'waiting', progress: 0, say: '', results: new Map(), result: null, picture: null};
			const node = make('li', 'rapier-jxl-view__row'), text = make('div', 'rapier-jxl-view__row-text'), actions = make('div', 'rapier-jxl-view__row-actions');
			const download = make('button', 'settings-action-btn rapier-jxl-view__row-download', 'Download'), remove = make('button', 'navigator-close');
			const name = make('button', 'rapier-jxl-view__row-name', file.name);
			name.type = 'button'; name.disabled = true; name.setAttribute('aria-label', 'Show ' + file.name);
			name.addEventListener('click', () => { if (row.state === 'done') showPicture(self, row, true); });
			row.nameButton = name;
			text.append(name, make('div', 'rapier-jxl-view__row-note'));
			download.type = 'button'; download.hidden = true; remove.type = 'button'; remove.setAttribute('aria-label', 'Remove ' + file.name);
			remove.innerHTML = view.shut.innerHTML;
			download.addEventListener('click', () => save(row.result.blob, row.outputName));
			remove.addEventListener('click', () => {
				row.removed = true; row.stop?.abort();
				if (self.following?.row === row) self.following = null;
				if (self.showing === row) clearPicture(self);
				const at = self.rows.indexOf(row);
				self.rows.splice(at, 1); node.remove(); row.shown?.end(); row.results.clear(); row.result = null; overall(self);
				(self.list.children[at]?.querySelector('.navigator-close') || self.pick.querySelector('input'))?.focus();
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
		kept.big = Object.fromEntries(Object.entries(fresh.big).map(([key, value]) => [key, value instanceof Node ? at(value) : value]));
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
		view.cancel.addEventListener('click', () => { view.controller?.abort(); view.following = null; clearPicture(view); });
		view.all.addEventListener('click', saveAll);
		for (const button of view.modes) button.addEventListener('click', () => {
			if (button.dataset.mode === view.mode) return;
			setQuality(view, C.QUALITY[button.dataset.mode]);
			remake();
		});
		view.advanced.onQuality = (value, final) => {
			if (!final) { lightQuality(view, value); return; }
			if (value === view.quality) return;
			setQuality(view, value); remake();
		};
		view.advanced.onChange = read => { remember(read); remake(); };
		{
			const limitChoice = stored('limitChoice'), limit = stored('limit');
			view.advanced.set({limitChoice: C.ADVANCED.limits.includes(limitChoice) ? limitChoice : C.ADVANCED.limit, limit: C.ADVANCED.limits.includes(limit) ? limit : 0,
				side: C.ADVANCED.sides.includes(stored('side')) ? stored('side') : 0, location: stored('removeLocation') !== true});
			Object.assign(view, view.advanced.read());
			setQuality(view, stored('quality') ?? C.QUALITY[START_MODE], false);
		}
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
		view.slider.addEventListener('change', () => void effortChosen(view));
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
		for (const block of view.clips) clipWhenNear(view, block);
		bigWhenPressed(view);
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
	function clipWhenNear(self, block) {
		const {spec} = block;
		if (!_rapierPartAvailable(spec.part)) { block.section.hidden = true; return; }
		block.near = new IntersectionObserver(entries => {
			if (!entries.some(entry => entry.isIntersecting)) return;
			block.near.disconnect();
			RapierParts.check(spec.part).catch(() => {}).then(() => RapierParts.need(spec.part)).then(() => {
				if (view !== self || block.shown) return;
				const E = globalThis[spec.global], bytes = Uint8Array.from(atob(E.JXL), c => c.charCodeAt(0));
				block.shown = C.showMade(new Blob([bytes], {type: 'image/jxl'}), 'rapier-jxl-view__media', spec.alt);
				block.slot.replaceChildren(block.shown.node);
				block.note.textContent = spec.caption ?? 'GIF ' + size(E.GIF_BYTES) + ' → JPEG XL ' + size(bytes.length) + ' · ' + percent({size: bytes.length, before: E.GIF_BYTES});
			}, error => {
				if (view !== self) return;
				if (error?.cause?.code === 'part_not_carried') block.section.hidden = true;
				else block.slot.replaceChildren(make('p', 'rapier-jxl-view__note', spec.missing));
			});
		}, {root: block.section.closest('.rapier-jxl-view__body'), rootMargin: '100% 0px'});
		block.near.observe(block.section);
	}
	function bigWhenPressed(self) {
		const big = self.big, spec = C.BIG;
		if (!_rapierPartAvailable(spec.part)) { big.section.hidden = true; return; }
		big.info.addEventListener('click', () => _rapierInfoSheetShow('Progressive JPEG XL', spec.about));
		big.load.addEventListener('click', () => {
			if (big.playing) return;
			big.playing = true; big.load.hidden = true; stopBig(big);
			big.box.hidden = big.note.hidden = false; big.box.replaceChildren(); big.note.textContent = 'Loading';
			void globalThis.RapierEmbeddedImages.whenJxlDisplayKnown?.().then(native => { if (native !== true) return RapierParts.need('jxlcomplete'); }).catch(() => {});
			RapierParts.check(spec.part).catch(() => {}).then(() => RapierParts.need(spec.part)).then(() => {
				if (view !== self) return;
				const E = globalThis[spec.global], bytes = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
				const passes = [[E.AT[0], bytes(E.EIGHTH), '1:8'], [E.AT[1], bytes(E.QUARTER), '1:4'], [E.AT[2], bytes(E.JXL), spec.width + ' × ' + spec.height]];
				const total = E.AT[2], start = performance.now();
				let shown = -1;
				const tick = () => {
					if (view !== self) return;
					const got = Math.min(total, Math.round((performance.now() - start) / 1000 * spec.rate));
					let pass = shown;
					while (pass + 1 < passes.length && got >= passes[pass + 1][0]) pass++;
					if (pass > shown) { shown = pass; void showBig(self, passes[pass][1]); }
					big.note.textContent = size(got) + ' of ' + size(total) + (shown >= 0 ? ' · ' + passes[shown][2] : '');
					if (got < total) big.timer = setTimeout(tick, 100);
					else { big.timer = 0; big.playing = false; }
				};
				tick();
			}, error => {
				if (view !== self) return;
				big.playing = false; big.load.hidden = false; big.box.hidden = true;
				if (error?.cause?.code === 'part_not_carried') big.section.hidden = true;
				else big.note.textContent = spec.missing;
			});
		});
	}
	async function showBig(self, bytes) {
		const big = self.big, images = globalThis.RapierEmbeddedImages, seq = big.seq = (big.seq || 0) + 1;
		let blob;
		try { blob = await images.previewBlob(bytes, {maxPixels: C.BIG.width * C.BIG.height}); } catch (error) { console.warn('JPEG XL pass', error?.code, error?.message); return; }
		if (view !== self || big.seq !== seq || !blob) return;
		const url = URL.createObjectURL(blob), image = make('img');
		image.alt = C.BIG.alt; image.src = url;
		try { await image.decode(); } catch (_) { URL.revokeObjectURL(url); if (!big.url) big.note.textContent = C.SHOW_REFUSED; return; }
		if (view !== self || big.seq !== seq) { URL.revokeObjectURL(url); return; }
		const first = !big.zoomed, region = bigRegion(big);
		placeBig(image, region, !first);
		big.box.replaceChildren(image);
		if (big.url) URL.revokeObjectURL(big.url);
		big.url = url;
		if (!first) return;
		big.zoomed = true;
		placeBig(image, region, true);
		if (!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
			const [hold, length] = C.BIG.zoom;
			image.animate([{transform: 'translate(0px, 0px) scale(' + region.whole + ')'}, {transform: 'translate(' + region.left + 'px, ' + region.top + 'px) scale(1)'}],
				{delay: hold, duration: length, easing: 'ease-in-out', fill: 'backwards'});
		}
		let across = big.box.getBoundingClientRect().width;
		big.resize = new ResizeObserver(() => {
			const shown = big.box.querySelector('img'), now = big.box.getBoundingClientRect().width;
			if (!shown || now === across) return;
			across = now;
			for (const motion of shown.getAnimations()) motion.finish();
			placeBig(shown, bigRegion(big), true);
		});
		big.resize.observe(big.box);
	}
	function bigRegion(big) {
		const spec = C.BIG, ratio = globalThis.devicePixelRatio || 1, box = big.box.getBoundingClientRect();
		const width = spec.width / ratio, height = spec.height / ratio, snap = value => Math.round(value * ratio) / ratio;
		const at = (side, size, focus) => snap(Math.min(0, Math.max(side - size, side / 2 - focus / ratio)));
		return {width, height, left: at(box.width, width, spec.focus[0]), top: at(box.height, height, spec.focus[1]), whole: box.width / width};
	}
	function placeBig(image, region, zoomed) {
		Object.assign(image.style, {width: region.width + 'px', height: region.height + 'px', maxWidth: 'none', transformOrigin: '0 0',
			transform: zoomed ? 'translate(' + region.left + 'px, ' + region.top + 'px)' : 'scale(' + region.whole + ')'});
	}
	function stopBig(big) {
		clearTimeout(big.timer); big.timer = 0; big.seq = (big.seq || 0) + 1;
		big.resize?.disconnect(); big.resize = null; big.zoomed = false;
		if (big.url) URL.revokeObjectURL(big.url);
		big.url = null;
	}
	function close() {
		if (!view) return;
		view.controller?.abort();
		view.near?.disconnect(); for (const block of view.clips) block.near?.disconnect(); view.mounted?.unmount();
		const done = view;
		view = null;
		done.follow?.popup.end();
		clearPicture(done); done.following = null;
		for (const row of done.rows) { row.removed = true; row.shown?.end(); row.results.clear(); row.result = null; }
		for (const block of done.clips) block.shown?.end();
		stopBig(done.big);
		if (done.notices?.root.parentElement === done.root) done.notices.home.append(done.notices.root);
		done.maker?.unbind();
		done.root.remove();
		for (const node of done.inert) node.inert = false;
		if (typeof _rapierDoorPathMark === 'function') _rapierDoorPathMark('jxl', false);
		try { done.wasFocus?.focus({preventScroll: true}); } catch (_) {}
	}
	async function effortChosen(of) {
		let chosen = C.effortOf(of.slider.value, C.STILL_EFFORT);
		if (chosen === C.STILL_EFFORT.slow && chosen !== of.effort) {
			const yes = await rapierConfirm({title: 'Effort 10', message: C.SLOW_WORDS, confirmLabel: 'Use effort 10', plain: true, bare: true}) === true;
			if (view !== of) return;
			if (!yes) { chosen = C.STILL_EFFORT.slow - 1; of.slider.value = String(chosen); seekTo(of); }
		}
		of.effort = chosen; paintQuick(of); remake();
	}
	function remember({limit, limitChoice, side, location}) {
		Object.assign(view, {limit, side, location});
		store('limit', limit); store('limitChoice', limitChoice); store('side', side); store('removeLocation', !location);
	}
	function lightQuality(of, value) {
		const mode = Object.keys(C.QUALITY).find(each => C.QUALITY[each] === value) ?? null;
		for (const each of of.modes) { const on = each.dataset.mode === mode; each.toggleAttribute('data-active', on); each.setAttribute('aria-checked', String(on)); }
		_rapierSwitchSlide(of.group);
		return mode;
	}
	function setQuality(of, value, remember = true) {
		of.quality = C.qualityOf(value);
		of.mode = lightQuality(of, of.quality);
		of.advanced.show(of.quality);
		paintQuick(of);
		if (remember) store('quality', of.quality);
	}
	function configure({mode, quality, effort, maxBytes, side, location} = {}) {
		if (!view) return;
		let again = false;
		const asked = typeof quality === 'number' ? C.qualityOf(quality) : quality === 'medium' ? C.qualityOf(75) : C.QUALITY[quality] ?? C.QUALITY[mode];
		if (asked !== undefined && asked !== view.quality) { setQuality(view, asked); again = true; }
		const advanced = {...maxBytes !== undefined && {limit: C.ADVANCED.limits.includes(maxBytes) ? maxBytes : 0}, ...side !== undefined && {side: C.ADVANCED.sides.includes(side) ? side : 0}, ...location !== undefined && {location: !!location}};
		if (Object.keys(advanced).length) {
			view.advanced.set(advanced);
			const read = view.advanced.read();
			if (read.limit !== view.limit || read.side !== view.side || read.location !== view.location) { remember(read); again = true; }
		}
		if (effort !== undefined && C.effortOf(effort, C.STILL_EFFORT) !== view.effort) {
			view.slider.value = String(C.effortOf(effort, C.STILL_EFFORT)); seekTo(view);
			view.effort = C.effortOf(effort, C.STILL_EFFORT); paintQuick(view); again = true;
		}
		if (again) remake();
	}
	function paintQuick(of) {
		const {qualityOpen, effortOpen, qualityDrop, effortDrop} = of.quick;
		qualityOpen.textContent = 'Quality: ' + (QUALITY_WORDS[of.mode] ?? of.quality);
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
		complete: state => completeFor(state, null)(),
		ownsInputTarget: node => !!view && node instanceof Element && view.root.isConnected && view.root.contains(node) && !node.closest('[inert]'),
		get state() { return Object.freeze({open: !!view}); }});
	_rapierJxlPart = face;
	if (_rapierJxlDoor?.born) _rapierBootFactsPublished.then(open, open);
})();
