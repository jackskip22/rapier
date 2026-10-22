// SPDX-License-Identifier: AGPL-3.0-only
const _rapierComposerSheet = {ink: null};
const _RAPIER_COMPOSER_INKS = Object.freeze([
	['red', '#b32034'], ['orange', '#c2410c'], ['gold', '#865818'], ['green', '#1c7547'], ['teal', '#0f766e'], ['blue', '#175dc4'],
	['indigo', '#4338ca'], ['purple', '#7924d7'], ['pink', '#be185d'], ['gray', '#57606a']]);

function _rapierComposerEl(tag, className, text) {
	const element = document.createElement(tag);
	if (className) element.className = className;
	if (text != null) element.textContent = text;
	return element;
}
function _rapierComposerHex(color) {
	const context = document.createElement('canvas').getContext('2d');
	context.fillStyle = '#121212';
	context.fillStyle = color || '#121212';
	return /^#[0-9a-f]{6}$/.test(context.fillStyle) ? context.fillStyle : '#121212';
}
function _rapierComposerPicture(svg, label) {
	const image = _rapierComposerEl('img', 'rapier-composer__picture');
	image.alt = label || '';
	image.draggable = false;
	image.src = 'data:image/svg+xml;base64,' + btoa(svg);
	return image;
}
function _rapierComposerOpen(title, fill, onClose) {
	const overlay = _rapierComposerEl('div', 'link-dialog__overlay');
	overlay.id = 'rapier-composer';
	const panel = _rapierComposerEl('div', 'link-dialog rapier-composer');
	panel.setAttribute('role', 'dialog');
	panel.setAttribute('aria-modal', 'true');
	panel.setAttribute('aria-label', title);
	const state = _rapierBeginEngineDialog(overlay, onClose);
	const actions = _rapierComposerEl('div', 'link-dialog__actions');
	const cancel = _rapierComposerEl('button', 'link-dialog__btn', 'cancel');
	cancel.type = 'button';
	cancel.addEventListener('click', () => state.cancel(true));
	actions.append(cancel);
	panel.append(_rapierComposerEl('div', 'link-dialog__title', title), ...fill(state, panel), actions);
	overlay.append(panel);
	overlay.addEventListener('click', event => { if (event.target === overlay) state.cancel(true); });
	requestAnimationFrame(() => (panel.querySelector('.rapier-composer__card, .rapier-composer__swatch') || cancel).focus({preventScroll: true}));
	return state;
}

const RAPIER_ORNAMENTS_URL = 'https://cdn.jsdelivr.net/gh/jackskip22/rapier-plugins@v1.2.25/';
const _rapierOrnamentDoor = {providers: new Map(), allowed: new Set(), held: new Map(), bringing: new Map(), hubs: new Map(), plugins: new Map()};
const RAPIER_ORNAMENT_FORMAT = 1;
const _RAPIER_ORNAMENT_KINDS = Object.freeze({
	templates: {noun: 'Page borders', pins: () => RapierPins.BORDER_PINS, admit: bytes => RapierDrawOrnaments.admitTemplate(bytes), what: 'traced page borders'},
	elements: {noun: 'Elements', pins: () => RapierPins.ELEMENT_PINS, admit: bytes => RapierDrawOrnaments.admitElements(bytes), what: 'traced ornaments'},
	lettersets: {noun: 'Letter sets', pins: () => RapierPins.LETTERSET_PINS, admit: bytes => RapierDrawOrnaments.admitLetterGallery(bytes), what: 'ornamental letter sets'},
});
const _RAPIER_ELEMENT_FAMILIES = Object.freeze(['ac', 'dn', 'oz']);
const _RAPIER_ELEMENT_FAMILY_NAMES = Object.freeze({ac: 'A\u2013C', dn: 'D\u2013N', oz: 'O\u2013Z'});
const _rapierOrnamentNoun = (kind, family) => _RAPIER_ORNAMENT_KINDS[kind].noun + (kind === 'elements' && family ? ' ' + _RAPIER_ELEMENT_FAMILY_NAMES[family] : '');
const _rapierElementFamily = id => { const first = String(id).replace(/^elements-/, '')[0] || 'z'; return first <= 'c' ? 'ac' : first <= 'n' ? 'dn' : 'oz'; };
const _rapierOrnamentSlot = (kind, family) => kind === 'elements' && family ? kind + '-' + family : kind;
const _rapierOrnamentInFamily = (kind, family, pin) => kind !== 'elements' || !family || _rapierElementFamily(pin.id) === family;
const _rapierOrnamentPins = (kind, family) => _RAPIER_ORNAMENT_KINDS[kind].pins().filter(pin => _rapierOrnamentInFamily(kind, family, pin));
const _rapierPinsDigest = pins => { let hash = 2166136261; for (const char of pins.map(pin => pin.zsha384).join()) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return (hash >>> 0).toString(16); };
function _rapierOrnamentProvider(kind, family = null) {
	const door = _rapierOrnamentDoor, spec = _RAPIER_ORNAMENT_KINDS[kind], key = _rapierOrnamentSlot(kind, family);
	if (kind === 'elements' && !family) return null;
	if (!door.providers.has(key) && globalThis.RapierPluginLoader) {
		const pins = spec.pins().filter(pin => _rapierOrnamentInFamily(kind, family, pin));
		const files = pins.map(pin => ({name: pin.id, id: 'rapier-' + kind + '-' + pin.id, flat: kind + '-' + pin.id + '.json.gz', url: RAPIER_ORNAMENTS_URL + kind + '/' + pin.id + '.json.gz', bytes: pin.zbytes, sri: pin.zsha384}));
		door.providers.set(key, RapierPluginLoader.files({key, noun: _rapierOrnamentNoun(kind, family), dash: ' — ', version: key + ' ' + pins.length + ' ' + _rapierPinsDigest(pins), plural: true, quiet: true, format: RAPIER_ORNAMENT_FORMAT, reads: [RAPIER_ORNAMENT_FORMAT], files}));
	}
	return door.providers.get(key) || null;
}
const _rapierOrnamentSettled = provider => new Promise(resolve => {
	const started = Date.now(), poll = setInterval(() => { if (!['checking', 'installing'].includes(provider.status) || Date.now() - started > 20000) { clearInterval(poll); resolve(); } }, 50);
});
const _RAPIER_GALLERY_PLUGINS = Object.freeze({
	borders: {name: 'Page borders', slots: Object.freeze([{kind: 'templates'}])},
	elements: {name: 'Elements', slots: Object.freeze(_RAPIER_ELEMENT_FAMILIES.map(family => ({kind: 'elements', family})))},
	letters: {name: 'Letter sets', slots: Object.freeze([{kind: 'lettersets'}])},
});
const _rapierGalleryPluginOf = kind => kind === 'templates' ? 'borders' : kind === 'elements' ? 'elements' : 'letters';
const _rapierGallerySlotKey = row => _rapierOrnamentSlot(row.kind, row.family || null);
const _rapierGalleryPins = id => _RAPIER_GALLERY_PLUGINS[id].slots.flatMap(row => _rapierOrnamentPins(row.kind, row.family || null));
const _rapierGalleryBytes = id => _rapierGalleryPins(id).reduce((sum, pin) => sum + pin.zbytes, 0);
const _rapierGalleryMark = {
	store: () => RapierBundleIO.store('gallery'),
	async write(id) {
		if (_rapierGalleryProviders(id).some(provider => provider?.update)) return;
		try {
			const sets = _rapierGalleryProviders(id).map((provider, index) => ({slot: _rapierGallerySlotKey(_RAPIER_GALLERY_PLUGINS[id].slots[index]), version: provider.version, names: provider.files.map(file => file.name)}));
			await this.store().put(id, {sri: RapierParts.pin('presets')?.sri || '', sets});
		} catch (_) {}
	},
	async clear(id) { try { await this.store().remove(id); } catch (_) {} },
};
function _rapierGalleryProviders(id) { return _RAPIER_GALLERY_PLUGINS[id].slots.map(row => _rapierOrnamentProvider(row.kind, row.family || null)); }
async function _rapierGalleryStatus(id) {
	const providers = _rapierGalleryProviders(id);
	if (providers.some(provider => !provider)) return {status: 'absent', deletable: false};
	await Promise.all(providers.map(_rapierOrnamentSettled));
	const states = providers.map(provider => provider.status);
	const status = states.every(each => each === 'ready') ? 'ready' : states.includes('downloading') || states.includes('installing') ? 'downloading' : states.includes('error') ? 'error' : 'absent';
	const waiting = providers.map(provider => provider.update).filter(Boolean);
	return {status, deletable: providers.every(provider => provider.deletable !== false), update: waiting.length ? {files: waiting.reduce((sum, each) => sum + each.files, 0), bytes: waiting.reduce((sum, each) => sum + each.bytes, 0), required: waiting.some(each => each.required)} : null};
}
const _rapierGalleryAnnounce = (id, status, progress = 0) => { try { window.dispatchEvent(new CustomEvent('rapier:gallery', {detail: {id, status, progress}})); } catch (_) {} };
async function _rapierGalleryAsk(id, retry, reason, required = null) {
	const plugin = _RAPIER_GALLERY_PLUGINS[id];
	if (required && !retry) {
		const size = _rapierPluginSize(required.bytes), words = plugin.name + ' need an update to work with this Rapier \u00b7 ' + size;
		return await rapierConfirm({title: 'Update ' + plugin.name + '?', message: words, confirmLabel: 'update', plain: true}) === true;
	}
	const mb = value => value >= 1e6 ? (value / 1e6).toFixed(1) + ' MB' : Math.round(value / 1e3) + ' KB';
	const kinds = [...new Set(plugin.slots.map(row => row.kind))];
	const host = [...new Set(kinds.map(kind => window.RapierPlatform?.resources.installMessage?.(kind, retry ? 'error' : 'prompt') || '').filter(Boolean))].join('\n');
	const words = retry ? host || reason || 'Rapier could not reach or verify ' + plugin.name + '. Try again.'
		: host || '• ' + mb(_rapierGalleryBytes(id)) + ', once, from jsDelivr.\n• ' + _rapierGalleryPins(id).length + ' files of ' + _RAPIER_ORNAMENT_KINDS[kinds[0]].what + '.\n• Works offline after.';
	return await rapierConfirm({title: retry ? plugin.name + ' did not arrive' : 'Download ' + plugin.name + '?', message: words, confirmLabel: retry ? 'retry' : 'download', plain: true}) === true;
}
function _rapierOrnamentHub(after = 0, words = 'Downloading') {
	const rows = new Set(), now = {fraction: null, words};
	const hub = {
		join(wait = 0) { const row = _rapierProgressOpen({label: now.words, after: wait}); row.set(now.fraction, now.words); rows.add(row); return row; },
		set(fraction, words) { now.fraction = fraction; now.words = words; for (const row of rows) row.set(fraction, words); },
		end() { for (const row of rows) row.end(); rows.clear(); },
	};
	hub.join(after);
	return hub;
}
function _rapierGalleryEnsure(id) {
	const door = _rapierOrnamentDoor, plugin = _RAPIER_GALLERY_PLUGINS[id];
	if (door.plugins.has(id)) { door.hubs.get(id)?.join(); return door.plugins.get(id); }
	door.plugins.set(id, (async () => {
		const providers = _rapierGalleryProviders(id), sizes = plugin.slots.map(row => _rapierOrnamentPins(row.kind, row.family || null).reduce((sum, pin) => sum + pin.zbytes, 0)), total = sizes.reduce((sum, size) => sum + size, 0);
		if (providers.some(provider => !provider)) throw new Error(plugin.name + ' is not available here.');
		await Promise.all(providers.map(_rapierOrnamentSettled));
		for (let retry = false; !providers.every(provider => provider.status === 'ready'); retry = true) {
			const needed = providers.filter(provider => provider.status !== 'ready' && provider.update?.required);
			const required = needed.length ? {bytes: needed.reduce((sum, provider) => sum + provider.update.bytes, 0)} : null;
			if ((!door.allowed.has(id) || required && !retry) && !await _rapierGalleryAsk(id, retry, providers.find(provider => provider.status === 'error')?.error || '', required)) {
				showToast(required ? plugin.name + ' wait for the update' : 'Download canceled', 'info');
				throw Object.assign(new Error('canceled'), {canceled: true});
			}
			door.allowed.add(id);
			const hub = _rapierOrnamentHub(0, 'Downloading ' + plugin.name); door.hubs.set(id, hub);
			let before = 0;
			_rapierGalleryAnnounce(id, 'downloading', 0);
			try {
				for (const [index, provider] of providers.entries()) {
					if (provider.status !== 'ready') {
						const slot = _rapierGallerySlotKey(plugin.slots[index]);
						const follow = event => {
							const {status, progress} = event.detail || {};
							if (status === 'downloading') {
								const fraction = (before + (progress || 0) / 100 * sizes[index]) / total;
								hub.set(fraction, 'Downloading ' + plugin.name + ' · ' + Math.floor(fraction * 100) + '%'); _rapierGalleryAnnounce(id, 'downloading', Math.floor(fraction * 100));
							}
						};
						window.addEventListener('rapier:' + slot + 'plugin', follow);
						try { await provider[provider.status === 'error' ? 'reinstall' : 'install'](); } catch (_) {  } finally { window.removeEventListener('rapier:' + slot + 'plugin', follow); }
						if (provider.status === 'error') break;
					}
					before += sizes[index];
				}
			} finally { hub.end(); door.hubs.delete(id); }
			if (providers.some(provider => provider.status === 'error')) { door.allowed.delete(id); _rapierGalleryAnnounce(id, 'error'); }
			else if (!providers.every(provider => provider.status === 'ready')) { _rapierGalleryAnnounce(id, 'absent'); throw new Error(plugin.name + ' did not finish downloading. Try again.'); }
		}
		await _rapierGalleryMark.write(id);
		_rapierGalleryAnnounce(id, 'ready');
	})().finally(() => { door.plugins.delete(id); }));
	return door.plugins.get(id);
}
function _rapierGalleryUpdate(id) {
	const door = _rapierOrnamentDoor, plugin = _RAPIER_GALLERY_PLUGINS[id];
	if (door.plugins.has(id)) { door.hubs.get(id)?.join(); return door.plugins.get(id); }
	door.plugins.set(id, (async () => {
		const all = _rapierGalleryProviders(id), providers = all.filter(provider => provider?.update);
		const sizes = providers.map(provider => provider.update.bytes), total = sizes.reduce((sum, size) => sum + size, 0) || 1;
		if (!providers.length) return;
		const hub = _rapierOrnamentHub(0, 'Updating ' + plugin.name); door.hubs.set(id, hub);
		_rapierGalleryAnnounce(id, 'downloading', 0);
		let before = 0;
		try {
			for (const [index, provider] of providers.entries()) {
				const event = 'rapier:' + _rapierGallerySlotKey(plugin.slots[all.indexOf(provider)]) + 'plugin';
				const follow = change => {
					const {status, progress} = change.detail || {};
					if (status === 'downloading') { const fraction = (before + (progress || 0) / 100 * sizes[index]) / total; hub.set(fraction, 'Updating ' + plugin.name + ' \u00b7 ' + Math.floor(fraction * 100) + '%'); _rapierGalleryAnnounce(id, 'downloading', Math.floor(fraction * 100)); }
				};
				window.addEventListener(event, follow);
				try { await provider.install(); } finally { window.removeEventListener(event, follow); }
				before += sizes[index];
			}
			await _rapierGalleryMark.write(id);
		} catch (error) {
			showToast(String(error?.message || error), 'error');
			throw error;
		} finally { hub.end(); door.hubs.delete(id); _rapierGalleryAnnounce(id, 'ready'); }
	})().finally(() => { door.plugins.delete(id); }));
	return door.plugins.get(id);
}
const _rapierGalleryNoted = new Set();
function _rapierGalleryNoteUse(id) {
	const providers = _rapierGalleryProviders(id), waiting = providers.filter(provider => provider?.update);
	if (!waiting.length || _rapierGalleryNoted.has(id)) return;
	_rapierGalleryNoted.add(id);
	const bytes = waiting.reduce((sum, provider) => sum + provider.update.bytes, 0);
	try { window.dispatchEvent(new CustomEvent('rapier:plugin-update', {detail: {key: id, noun: _RAPIER_GALLERY_PLUGINS[id].name, plural: true, version: providers.map(provider => provider.version).join('|'), bytes}})); } catch (_) {}
}
async function _rapierOrnamentInflate(zipped, pin) {
	if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot unpack the download.');
	const out = new Uint8Array(await new Response(new Blob([zipped]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
	if (out.length > 64e6) throw new Error('unexpected size of ' + pin.id);
	return out;
}
function _rapierOrnamentBring(kind, family = null) {
	const door = _rapierOrnamentDoor, slot = _rapierOrnamentSlot(kind, family);
	if (kind === 'elements' && !family) return _RAPIER_ELEMENT_FAMILIES.reduce((chain, each) => chain.then(async rows => [...rows, ...await _rapierOrnamentBring(kind, each)]), Promise.resolve([]));
	if (door.held.has(slot)) return Promise.resolve(door.held.get(slot));
	if (door.bringing.has(slot)) { door.hubs.get(slot)?.join(); return door.bringing.get(slot); }
	door.bringing.set(slot, (async () => {
		const provider = _rapierOrnamentProvider(kind, family), spec = _RAPIER_ORNAMENT_KINDS[kind], noun = _rapierOrnamentNoun(kind, family);
		if (!provider) throw new Error(noun + ' is not available here.');
		await _rapierOrnamentSettled(provider);
		const quiet = provider.status === 'ready';
		await _rapierGalleryEnsure(_rapierGalleryPluginOf(kind));
		_rapierGalleryNoteUse(_rapierGalleryPluginOf(kind));
		const bytes = await provider.bytes(), rows = [], pins = _rapierOrnamentPins(kind, family);
		const hub = _rapierOrnamentHub(quiet ? 400 : 0, 'Opening ' + noun); door.hubs.set(slot, hub);
		try {
			for (const pin of pins.filter(pin => bytes[pin.id])) {
				hub.set(rows.length / pins.length, 'Opening ' + noun);
				await new Promise(resolve => setTimeout(resolve, 0));
				const row = spec.admit(await _rapierOrnamentInflate(bytes[pin.id], pin));
				if (!row) throw new Error(noun + ' could not be read: ' + pin.id);
				rows.push(row);
			}
		} finally { hub.end(); door.hubs.delete(slot); }
		door.held.set(slot, rows);
		return rows;
	})().finally(() => door.bringing.delete(slot)));
	return door.bringing.get(slot);
}
function _rapierElementGroups() {
	const groups = new Map();
	for (const pin of RapierPins.ELEMENT_PINS) {
		if (!groups.has(pin.group)) groups.set(pin.group, {name: pin.group, family: _rapierElementFamily(pin.id), count: 0, items: null});
		groups.get(pin.group).count += pin.items;
	}
	if (groups.has('Lettering')) { const lettering = groups.get('Lettering'); groups.delete('Lettering'); groups.set('Lettering', lettering); }
	for (const group of groups.values()) {
		const packs = _rapierOrnamentDoor.held.get(_rapierOrnamentSlot('elements', group.family));
		if (packs) group.items = packs.flatMap(pack => pack.items.filter(item => item.group === group.name));
	}
	return [...groups.values()];
}
const _rapierOrnamentWaiting = new Map();
let _rapierOrnamentFrame = 0;
function _rapierOrnamentDrain() {
	_rapierOrnamentFrame = 0;
	const end = performance.now() + 6;
	for (const [image, rect] of _rapierOrnamentWaiting) {
		if (performance.now() > end) break;
		_rapierOrnamentWaiting.delete(image);
		_rapierOrnamentSeen.unobserve(image);
		if (image.isConnected) image._rapierDraw?.(rect);
	}
	if (_rapierOrnamentWaiting.size) _rapierOrnamentFrame = requestAnimationFrame(_rapierOrnamentDrain);
}
const _rapierOrnamentSeen = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
	for (const entry of entries) {
		if (!entry.target.isConnected) { _rapierOrnamentWaiting.delete(entry.target); _rapierOrnamentSeen.unobserve(entry.target); }
		else if (entry.isIntersecting) _rapierOrnamentWaiting.set(entry.target, entry.boundingClientRect);
		else _rapierOrnamentWaiting.delete(entry.target);
	}
	if (_rapierOrnamentWaiting.size && !_rapierOrnamentFrame) _rapierOrnamentFrame = requestAnimationFrame(_rapierOrnamentDrain);
}, {rootMargin: '200px'}) : null;
function _rapierOrnamentWatch(image) { if (_rapierOrnamentSeen) _rapierOrnamentSeen.observe(image); else image._rapierDraw(); }
const _RAPIER_ORNAMENT_PAINT = 'onmessage=async({data:{id,d,box,tiles,ink,width,height}})=>{try{' +
	'const canvas=new OffscreenCanvas(width,height),context=canvas.getContext("2d"),path=new Path2D(d),[x,y,w,h]=box,scale=Math.min(width/(w*tiles),height/h);' +
	'context.translate((width-w*tiles*scale)/2,(height-h*scale)/2);context.scale(scale,scale);context.translate(-x,-y);context.fillStyle=ink;' +
	'for(let i=0;i<tiles;i++){context.fill(path,"evenodd");context.translate(w,0);}' +
	'postMessage({id,blob:await canvas.convertToBlob({type:"image/png"})});}catch(error){postMessage({id,error:String(error&&error.message||error)});}};';
const _rapierOrnamentPainter = {worker: null, broken: typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function' || typeof Path2D !== 'function', pending: new Map(), next: 1};
const _rapierOrnamentSVG = image => { image.src = 'data:image/svg+xml;base64,' + btoa(image._rapierPiece.svg()); };
function _rapierOrnamentPaint(image, rect, done) {
	const piece = image._rapierPiece, ratio = Math.min(3, window.devicePixelRatio || 1), painter = _rapierOrnamentPainter;
	if (!painter.broken && !painter.worker) {
		try {
			const url = URL.createObjectURL(new Blob([_RAPIER_ORNAMENT_PAINT], {type: 'text/javascript'}));
			painter.worker = new Worker(url);
			URL.revokeObjectURL(url);
			painter.worker.onmessage = ({data: {id, blob, error}}) => {
				const waiting = painter.pending.get(id);
				painter.pending.delete(id);
				if (!waiting) return;
				if (error || !blob) _rapierOrnamentSVG(waiting.image);
				else if (waiting.image.isConnected) waiting.image.src = waiting.image._rapierUrl = URL.createObjectURL(blob);
				waiting.done?.();
			};
			painter.worker.onerror = () => {
				painter.broken = true;
				for (const waiting of painter.pending.values()) { _rapierOrnamentSVG(waiting.image); waiting.done?.(); }
				painter.pending.clear();
			};
		} catch (_) { painter.broken = true; }
	}
	const width = Math.round((rect?.width || image.clientWidth) * ratio), height = Math.round((rect?.height || image.clientHeight) * ratio);
	if (painter.broken || width < 1 || height < 1) { _rapierOrnamentSVG(image); done?.(); return; }
	const id = painter.next++;
	painter.pending.set(id, {image, done});
	painter.worker.postMessage({id, d: piece.d, box: piece.box, tiles: piece.tiles, ink: piece.ink, width, height});
}
function _rapierOrnamentTile(piece, className, watched = true) {
	const image = _rapierComposerEl('img', className);
	image.alt = ''; image.draggable = false; image.decoding = 'async';
	image._rapierPiece = piece;
	image.dataset.draw = '1';
	image._rapierDraw = (rect, done) => _rapierOrnamentPaint(image, rect, done);
	if (watched) _rapierOrnamentWatch(image);
	return image;
}
function _rapierOrnamentRelease(root) {
	for (const image of root.querySelectorAll('img')) if (image._rapierUrl) { URL.revokeObjectURL(image._rapierUrl); image._rapierUrl = null; }
}
function _rapierOrnamentThumbnail(item, ink, tiles) {
	const image = _rapierComposerEl('img', 'rapier-composer__picture');
	image.alt = ''; image.draggable = false; image.decoding = 'async'; image.dataset.draw = '1';
	image._rapierDraw = () => { image.src = 'data:image/svg+xml;base64,' + btoa(tiles ? RapierOrnaments.elementSVG(item, {ink, tiles}) : RapierOrnaments.thumbnailSVG(item, ink)); };
	_rapierOrnamentWatch(image);
	return image;
}

function _rapierComposerInk() { return _rapierComposerSheet.ink || RapierOrnaments.ELEMENT_INK; }
function _rapierComposerSwatches(onChange) {
	const row = _rapierComposerEl('div', 'rapier-composer__inks');
	row.setAttribute('role', 'group');
	row.setAttribute('aria-label', 'color');
	const paint = () => { for (const swatch of row.querySelectorAll('[data-ink]')) swatch.setAttribute('aria-pressed', String((swatch.dataset.ink || null) === (_rapierComposerSheet.ink || ''))); };
	const choose = ink => { _rapierComposerSheet.ink = ink || null; paint(); onChange(); };
	const make = (label, ink) => {
		const swatch = _rapierComposerEl('button', 'rapier-composer__swatch');
		swatch.type = 'button';
		swatch.dataset.ink = ink || '';
		swatch.setAttribute('aria-label', label);
		swatch.title = label;
		if (ink) swatch.style.setProperty('--swatch', ink); else swatch.classList.add('rapier-composer__swatch--text');
		swatch.addEventListener('click', () => choose(ink));
		return swatch;
	};
	row.append(make('text color', ''), ..._RAPIER_COMPOSER_INKS.map(([name, hex]) => make(name, hex)));
	const custom = _rapierComposerEl('label', 'rapier-composer__swatch rapier-composer__swatch--custom');
	custom.title = 'custom color';
	const input = _rapierComposerEl('input');
	input.type = 'color';
	input.value = '#7924d7';
	input.setAttribute('aria-label', 'custom color');
	input.addEventListener('input', () => choose(input.value.toLowerCase()));
	custom.append(input);
	row.append(custom);
	paint();
	return row;
}
async function _rapierComposerAdd(item, options, target, stamp) {
	const svg = RapierOrnaments.elementSVG(item, options);
	if (!svg) throw new Error('That ornament could not be drawn');
	const asset = await RapierImageAssets.createAsset(new TextEncoder().encode(svg), null, {codec: 'image/svg+xml', title: item.name});
	const raw = '![' + _rapierEscapeImageAlt(item.name) + '][' + asset.label + '] <!--md-layout:v1 ' + RapierOrnaments.elementLayout(item) + '-->';
	const normalized = {asset, reference: asset.label, dataUrl: asset.url, width: asset.width, height: asset.height};
	return RapierEmbeddedImages.insert(normalized, raw, target, stamp);
}
async function _rapierComposerPlace(svg, title, layout, target) {
	if (_rapierUserMutationBlocked() || !svg) return false;
	if (rapier.document.docKind !== 'markdown') { showToast('Letters go in Markdown documents', 'info'); return false; }
	const settled = await _rapierWithSettledExternalDocument(() => Object.freeze(_rapierMutationStamp()), {quiet: true});
	if (!settled.settled) return false;
	try {
		const asset = await RapierImageAssets.createAsset(new TextEncoder().encode(svg), null, {codec: 'image/svg+xml', title});
		const raw = '![' + _rapierEscapeImageAlt(title) + '][' + asset.label + '] <!--md-layout:v1 ' + layout + '-->';
		const done = await RapierEmbeddedImages.insert({asset, reference: asset.label, dataUrl: asset.url, width: asset.width, height: asset.height}, raw, target || _rapierImageInsertionTarget(), settled.value);
		if (!done) showToast('Document changed; choose the letter again', 'info');
		return !!done;
	} catch (error) { showToast(String(error.message || error), 'error'); return false; }
}
async function _rapierComposerInsert(request = {}) {
	if (_rapierUserMutationBlocked()) return false;
	if (rapier.document.docKind !== 'markdown') { showToast('Elements go in Markdown documents', 'info'); return false; }
	const target = request.target || _rapierImageInsertionTarget();
	const settled = await _rapierWithSettledExternalDocument(() => Object.freeze(_rapierMutationStamp()), {quiet: true});
	if (!settled.settled) return false;
	try {
		const done = await _rapierComposerAdd(request.item, {ink: request.ink || RapierOrnaments.ELEMENT_INK, ...(request.tiles ? {tiles: request.tiles} : null)}, target, settled.value);
		if (!done) showToast('Document changed; choose the element again', 'info');
		return !!done;
	} catch (error) { showToast(String(error.message || error), 'error'); return false; }
}
async function _rapierComposerElements() {
	if (rapier.document.docKind !== 'markdown') { showToast('Elements go in Markdown documents', 'info'); return; }
	const target = _rapierImageInsertionTarget();
	try { await _rapierGalleryEnsure('elements'); }
	catch (error) { if (!error?.canceled) showToast(String(error?.message || error), 'error'); return; }
	_rapierComposerOpen('Elements', state => {
		const body = _rapierComposerEl('div', 'rapier-composer__groups');
		let open = null, wanted = null, groups = _rapierElementGroups();
		const ink = () => _rapierComposerInk() === RapierOrnaments.ELEMENT_INK ? _rapierComposerHex(getComputedStyle(document.body).color) : _rapierComposerInk();
		const cover = group => {
			if (group.items?.length) { const sample = group.items[0]; return _rapierOrnamentThumbnail(sample, ink(), sample.tile ? 2 : 0); }
			const preview = globalThis.RapierGalleryPreviews?.ELEMENT_PREVIEWS?.find(row => row.group === group.name), image = _rapierComposerEl('img', 'rapier-composer__picture');
			image.alt = ''; image.draggable = false; image.decoding = 'async'; if (preview) image.src = preview.src;
			return image;
		};
		const enter = async group => {
			wanted = group.name;
			if (!group.items) {
				try { await _rapierOrnamentBring('elements', group.family); }
				catch (error) { if (!error?.canceled) showToast(String(error.message || error), 'error'); return; }
				if (!body.isConnected) return;
				groups = _rapierElementGroups();
			}
			open = wanted; draw(); panelTop();
		};
		const draw = () => {
			body.replaceChildren();
			const group = open !== null && groups.find(each => each.name === open);
			if (!group?.items) {
				open = null;
				const list = _rapierComposerEl('div', 'rapier-composer__grid rapier-composer__grid--groups');
				list.setAttribute('role', 'group'); list.setAttribute('aria-label', 'groups');
				for (const each of groups) {
					const card = _rapierComposerEl('button', 'rapier-composer__card rapier-composer__card--group');
					card.type = 'button'; card.dataset.group = each.name; card.setAttribute('aria-label', each.name + ', ' + each.count);
					card.append(cover(each), _rapierComposerEl('span', 'rapier-composer__name', each.name + ' \u00b7 ' + each.count));
					card.addEventListener('click', () => void enter(each));
					list.append(card);
				}
				body.append(list);
				return;
			}
			const back = _rapierComposerEl('button', 'link-dialog__btn', '\u2039 ' + open);
			back.type = 'button'; back.addEventListener('click', () => { open = null; draw(); panelTop(); });
			const grid = _rapierComposerEl('div', 'rapier-composer__grid rapier-composer__grid--items');
			grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', open);
			for (const item of group.items) {
				const card = _rapierComposerEl('button', 'rapier-composer__card');
				card.type = 'button'; card.dataset.piece = item.id; card.setAttribute('aria-label', item.name);
				card.append(_rapierOrnamentThumbnail(item, ink(), item.tile ? Math.min(3, RapierOrnaments.bandTiles(item)) : 0));
				card.addEventListener('click', () => { if (state.close(false)) void _rapierComposerInsert({item, ink: _rapierComposerSheet.ink, target}); });
				grid.append(card);
			}
			body.append(back, grid);
		};
		const panelTop = () => document.querySelector('#rapier-composer .rapier-composer')?.scrollTo?.(0, 0);
		draw();
		return [_rapierComposerSwatches(draw), body];
	});
}

function _rapierComposerBorders() {
	const stamp = Object.freeze(_rapierMutationStamp());
	void _rapierOrnamentBring('templates').then(rows => {
		_rapierComposerOpen('Page borders', state => {
			const ink = _rapierComposerHex(getComputedStyle(document.body).color), parts = [];
			for (const [heading, wanted] of [['Title pages', row => /^Title/.test(row.name)], ['Borders', row => !/^Title/.test(row.name)]]) {
				const group = rows.filter(wanted);
				if (!group.length) continue;
				const grid = _rapierComposerEl('div', 'rapier-composer__grid rapier-composer__grid--borders');
				grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', heading);
				for (const row of group) {
					const card = _rapierComposerEl('button', 'rapier-composer__card');
					card.type = 'button'; card.dataset.border = row.id; card.setAttribute('aria-label', row.name);
					card.append(_rapierOrnamentThumbnail(row, ink, 0), _rapierComposerEl('span', 'rapier-composer__name', row.name.replace(/^Title border /, '').replace(/^Border /, '')));
					card.addEventListener('click', () => { if (state.close(false)) void _rapierPresetPart.startPage(row, stamp); });
					grid.append(card);
				}
				parts.push(_rapierComposerEl('div', 'link-dialog__label', heading + ' \u00b7 ' + group.length), grid);
			}
			return parts;
		});
	}, error => { if (!error?.canceled) showToast(String(error.message || error), 'error'); });
}

function _rapierComposerRecolor() {
	const image = _rapierImageRuntime.image, record = _rapierImageRecord(_rapierImageRuntime.blockId, _rapierImageRuntime.imageIndex);
	const url = image && _rapierDrawImageDataUrl(image);
	if (!record || !url) return;
	const text = new TextDecoder().decode(Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), character => character.charCodeAt(0)));
	const current = RapierOrnaments.readElement(text);
	if (!current) return;
	const title = /<title>([^<]*)<\/title>/.exec(text)?.[1] || 'Element';
	const target = {replaceImage: {blockId: record.block.id, imageIndex: record.imageIndex}};
	_rapierComposerSheet.ink = current.ink === RapierOrnaments.ELEMENT_INK ? null : current.ink;
	_rapierComposerOpen('Color', state => [_rapierComposerSwatches(async () => {
		const ink = _rapierComposerInk(), svg = RapierOrnaments.recolorElement(text, ink);
		if (!svg || !state.close(false)) return;
		const settled = await _rapierWithSettledExternalDocument(() => Object.freeze(_rapierMutationStamp()), {quiet: true});
		if (!settled.settled) return;
		try {
			const asset = await RapierImageAssets.createAsset(new TextEncoder().encode(svg), null, {codec: 'image/svg+xml', title: record.image.title || ''});
			const alt = record.image.alt ?? title.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
			const normalized = {asset, reference: asset.label, dataUrl: asset.url, width: asset.width, height: asset.height};
			if (!await RapierEmbeddedImages.insert(normalized, '![' + _rapierEscapeImageAlt(alt) + '][' + asset.label + ']', target, settled.value)) showToast('Document changed; choose the color again', 'info');
		} catch (error) { showToast(String(error.message || error), 'error'); }
	})]);
}

async function _rapierComposerGalleryPiece(name) {
	const [kind, file, key, extra] = String(name).split('/'), spec = Object.hasOwn(_RAPIER_ORNAMENT_KINDS, kind) ? _RAPIER_ORNAMENT_KINDS[kind] : null;
	const pin = spec?.pins().find(row => row.id === file);
	if (!pin || extra !== undefined || (kind === 'templates') !== (key === undefined)) return null;
	const response = await fetch(RAPIER_ORNAMENTS_URL + kind + '/' + pin.id + '.json.gz', {integrity: 'sha384-' + pin.zsha384, credentials: 'omit'});
	if (!response.ok) throw new Error(spec.noun + ' could not be reached. Try again.');
	const row = spec.admit(await _rapierOrnamentInflate(new Uint8Array(await response.arrayBuffer()), pin));
	if (!row) return null;
	if (kind === 'templates') {
		const text = RapierOrnaments.templateMarkdown(row, {paper: RapierOrnaments.paperFor(navigator.language)});
		return text && {name: row.name, text};
	}
	if (kind === 'elements') {
		const item = row.items.find(each => each.id === key);
		return item ? {name: item.name, text: RapierOrnaments.pieceMarkdown(RapierOrnaments.elementSVG(item), item.name, RapierOrnaments.elementLayout(item))} : null;
	}
	const entry = row.letters.find(each => each.key === key), title = entry && row.name + ' ' + (entry.letter || entry.key);
	return entry ? {name: title, text: RapierOrnaments.pieceMarkdown(RapierOrnaments.letterSVG(row, entry, {box: RapierDrawOrnaments.outlineBox(entry.path)}), title, 'width=25% x=50%')} : null;
}

const _rapierGalleryApi = Object.freeze({
	status: _rapierGalleryStatus,
	install: _rapierGalleryEnsure,
	update: _rapierGalleryUpdate,
	mark: id => _rapierGalleryMark.write(id),
	async forget(id) {
		const door = _rapierOrnamentDoor;
		for (const provider of _rapierGalleryProviders(id)) await provider?.forget();
		for (const row of _RAPIER_GALLERY_PLUGINS[id].slots) door.held.delete(_rapierGallerySlotKey(row));
		door.allowed.delete(id);
		await _rapierGalleryMark.clear(id);
		_rapierGalleryAnnounce(id, 'absent');
		return true;
	},
});
_rapierComposerPart = Object.freeze({gallery: _rapierGalleryApi, borders: _rapierComposerBorders, elements: _rapierComposerElements, insert: _rapierComposerInsert, recolor: _rapierComposerRecolor,
	galleryPiece: _rapierComposerGalleryPiece});
