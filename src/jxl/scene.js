// SPDX-License-Identifier: AGPL-3.0-only
(() => {
	const S = globalThis.RapierJxlScene;
	const OPTIONS = Object.freeze({exact: {fidelity: 'exact', effort: 2}, fast: {fidelity: {quality: 90}, effort: 3}, small: {fidelity: {quality: 90}, effort: 7}});
	const PANORAMA = [4096, 2048];
	const make = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
	const size = n => n < 1048576 ? (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
	function choices(label, entries) {
		const group = make('div', 'theme-switcher theme-switcher--joined theme-switcher--onoff');
		group.setAttribute('role', 'radiogroup'); group.setAttribute('aria-label', label);
		const buttons = entries.map(([value, words], at) => {
			const button = make('button', 'theme-switcher__btn onoff-btn', words);
			button.type = 'button'; button.dataset.value = value; button.setAttribute('role', 'radio'); button.setAttribute('aria-checked', String(!at));
			button.toggleAttribute('data-active', !at);
			return button;
		});
		group.append(...buttons);
		const state = {group, value: entries[0][0]};
		const choose = button => {
			state.value = button.dataset.value;
			for (const each of buttons) { const on = each === button; each.toggleAttribute('data-active', on); each.setAttribute('aria-checked', String(on)); }
			_rapierSwitchSlide(group);
		};
		group.addEventListener('click', event => { const button = event.target.closest('button'); if (button && button.dataset.value !== state.value) choose(button); });
		group.addEventListener('keydown', event => {
			const step = {ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1}[event.key];
			if (!step) return;
			const at = buttons.findIndex(button => button.hasAttribute('data-active')), next = buttons[(at + step + buttons.length) % buttons.length];
			event.preventDefault(); choose(next); next.focus();
		});
		return state;
	}

	function mount(section, stage) {
		const canvas = make('canvas', 'rapier-jxl-scene__canvas');
		canvas.setAttribute('aria-label', '3D scene');
		const side = Math.max(256, Math.min(2048, Math.round(stage.clientWidth * (devicePixelRatio || 1))));
		canvas.width = canvas.height = side;
		const view = S.scene(canvas, 'view');
		if (!view) { stage.replaceWith(make('p', 'rapier-jxl-view__note', 'This browser cannot draw the scene.')); return {unmount() {}}; }
		stage.replaceChildren(canvas);
		const what = choices('Picture', [['view', 'View'], ['panorama', 'Panorama']]), how = choices('Quality', [['exact', 'Exact'], ['fast', 'Fast'], ['small', 'Smallest']]);
		const part = make('div', 'rapier-jxl-view__part'), save = make('button', 'settings-action-btn rapier-jxl-view__all', 'Save');
		const list = make('ul', 'rapier-jxl-view__list'), vr = make('button', 'settings-action-btn rapier-jxl-view__all', 'Enter VR');
		save.type = 'button'; vr.type = 'button'; vr.hidden = true;
		part.append(what.group, how.group);
		stage.after(part, save, list, vr);
		_rapierSwitchSlide(what.group); _rapierSwitchSlide(how.group);

		const start = performance.now(), frames = [], urls = [];
		const targets = {};
		let shown = true, frame = 0, drawnAt = 0, last = null, closed = false, offersVr = false;
		const loop = now => {
			frame = 0;
			if (closed || view.lost()) return;
			drawnAt = (now - start) / 1000; view.draw(drawnAt);
			frames.push(now); if (frames.length > 600) frames.shift();
			if (shown) frame = requestAnimationFrame(loop);
		};
		const seen = new IntersectionObserver(([entry]) => { shown = entry.isIntersecting; if (shown && !frame) frame = requestAnimationFrame(loop); });
		seen.observe(canvas);
		const dropped = (from, to) => {
			const all = frames.filter(t => t >= from - 200), gaps = all.slice(1).map((t, i) => t - all[i]).sort((a, b) => a - b), period = gaps[gaps.length >> 2] || 16.7;
			return all.slice(1).reduce((n, t, i) => t > from && all[i] < to ? n + Math.max(0, Math.round((t - all[i]) / period) - 1) : n, 0);
		};
		function row(name, note) {
			const node = make('li', 'rapier-jxl-view__row'), text = make('div', 'rapier-jxl-view__row-text'), line = make('div', 'rapier-jxl-view__row-note', note);
			text.append(make('div', 'rapier-jxl-view__row-name', name), line); node.append(text); list.prepend(node);
			return {node, line};
		}
		function actions(node, url, name) {
			const box = make('div', 'rapier-jxl-view__row-actions');
			for (const [label, act] of [['Open', () => window.open(url, '_blank', 'noopener')], ['Download', () => { const link = make('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); }]]) {
				const button = make('button', 'settings-action-btn', label); button.type = 'button'; button.addEventListener('click', act); box.append(button);
			}
			node.append(box);
		}
		async function reopened(bytes, target) {
			try {
				const pixels = await target.scene.read(), back = await RapierEmbeddedImages.codec('decode', bytes);
				if (!pixels || back.data.length !== pixels.length) return 'not opened again';
				let max = 0;
				for (let i = 0; i < pixels.length; i++) if (i % 4 !== 3) { const d = Math.abs(back.data[i] - pixels[i]); if (d > max) max = d; }
				return max === 0 ? 'opened again: identical' : 'opened again: largest change ' + max + ' of 255';
			} catch (_) { return 'not opened again'; }
		}
		const targetFor = kind => {
			const [w, h] = kind === 'panorama' ? PANORAMA : [canvas.width, canvas.height], held = targets[kind];
			if (held && held.canvas.width === w) return held;
			held?.scene?.release();
			const other = new OffscreenCanvas(w, h);
			return targets[kind] = {canvas: other, scene: S.scene(other, kind === 'panorama' ? 'pano' : 'view')};
		};
		save.addEventListener('click', async () => {
			if (save.disabled) return;
			save.disabled = true;
			const kind = what.value, quality = how.value;
			const [w, h] = kind === 'panorama' ? PANORAMA : [canvas.width, canvas.height], name = kind + '-' + w + 'x' + h + '-' + quality + '.jxl';
			const working = row(name, 'Saving');
			try {
				const t0 = performance.now(), target = targetFor(kind);
				if (!target.scene) throw new Error('This browser cannot draw the picture.');
				target.scene.draw(drawnAt);
				const bytes = await RapierEmbeddedImages.codec('encode', target.canvas, OPTIONS[quality], {progress: value => { working.line.textContent = 'Saving · ' + Math.round(value * 100) + '%'; }});
				const t1 = performance.now(), lost = dropped(t0, t1), blob = new Blob([bytes], {type: 'image/jxl'}), url = URL.createObjectURL(blob);
				urls.push(url);
				if (kind === 'panorama') last = blob;
				const seconds = ((t1 - t0) / 1000).toFixed(1) + ' s', frameWords = lost + (lost === 1 ? ' frame' : ' frames') + ' dropped';
				working.line.textContent = size(bytes.length) + ' · ' + seconds + ' · ' + frameWords;
				actions(working.node, url, name);
				const words = await reopened(bytes, target);
				if (!closed) working.line.textContent = size(bytes.length) + ' · ' + seconds + ' · ' + frameWords + ' · ' + words;
				vr.hidden = !(last && offersVr);
			} catch (error) {
				working.node.querySelector('.rapier-jxl-view__row-name').textContent = 'Not saved';
				working.line.textContent = globalThis.RapierJxlConvert?.refusal(error) || String(error?.message || error);
			} finally { save.disabled = false; }
		});
		navigator.xr?.isSessionSupported('immersive-vr').then(ok => { offersVr = ok; vr.hidden = !(ok && last); }, () => {});
		vr.addEventListener('click', async () => {
			if (!last) return;
			try { await S.enterPanorama(await createImageBitmap(last)); }
			catch (error) { row('Not in VR', String(error?.message || error)); }
		});
		return {unmount() {
			closed = true; seen.disconnect();
			if (frame) cancelAnimationFrame(frame);
			view.release(); for (const target of Object.values(targets)) target.scene?.release();
			for (const url of urls) URL.revokeObjectURL(url);
		}};
	}
	_rapierJxlScenePart = Object.freeze({mount});
})();
