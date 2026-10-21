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

const RAPIER_ORNAMENTS_URL = 'https://cdn.jsdelivr.net/gh/jackskip22/rapier-plugins@v1.2.19/';
const _rapierOrnamentDoor = {providers: new Map(), allowed: new Set(), held: new Map(), bringing: new Map()};
const _RAPIER_ORNAMENT_KINDS = Object.freeze({
	templates: {noun: 'Page borders', pins: () => RapierPins.BORDER_PINS, admit: bytes => RapierDrawOrnaments.admitTemplate(bytes), what: 'traced page borders'},
	elements: {noun: 'Elements', pins: () => RapierPins.ELEMENT_PINS, admit: bytes => RapierDrawOrnaments.admitElements(bytes), what: 'traced ornaments'},
	lettersets: {noun: 'Letter sets', pins: () => RapierPins.LETTERSET_PINS, admit: bytes => RapierDrawOrnaments.admitLetterGallery(bytes), what: 'ornamental letter sets'},
});
function _rapierOrnamentProvider(kind) {
	const door = _rapierOrnamentDoor, spec = _RAPIER_ORNAMENT_KINDS[kind];
	if (!door.providers.has(kind) && globalThis.RapierPluginLoader) {
		const pins = spec.pins();
		const files = pins.map(pin => ({name: pin.id, flat: kind + '-' + pin.id + '.json', url: RAPIER_ORNAMENTS_URL + kind + '/' + pin.id + '.json', bytes: pin.bytes, sri: pin.sha384}));
		door.providers.set(kind, RapierPluginLoader.files({key: kind, noun: spec.noun, dash: ' — ', version: kind + ' ' + pins.length + ' ' + pins[0].sha384.slice(0, 16), files}));
	}
	return door.providers.get(kind) || null;
}
const _rapierOrnamentSettled = provider => new Promise(resolve => {
	const started = Date.now(), poll = setInterval(() => { if (provider.status !== 'checking' || Date.now() - started > 3000) { clearInterval(poll); resolve(); } }, 50);
});
function _rapierOrnamentAsk(kind, retry = false) {
	const spec = _RAPIER_ORNAMENT_KINDS[kind], total = spec.pins().reduce((sum, pin) => sum + pin.bytes, 0);
	const mb = value => value >= 1e6 ? (value / 1e6).toFixed(1) + ' MB' : Math.round(value / 1e3) + ' KB';
	const host = window.RapierPlatform?.resources.installMessage?.(kind, retry ? 'error' : 'prompt') || '';
	return new Promise(resolve => {
		let answered = false;
		const answer = value => { if (!answered) { answered = true; resolve(value); } };
		const state = _rapierComposerOpen(retry ? spec.noun + ' did not arrive' : 'Download ' + spec.noun + '?', (open) => {
			const words = _rapierComposerEl('p', 'link-dialog__description', retry ? (host || 'Rapier could not reach or verify them. Try again.') : (host || '\u2022 ' + spec.pins().length + ' files of ' + spec.what + ' from the ornament book.\n\u2022 ' + mb(total) + ' packed to about a third, once.\n\u2022 Works offline.'));
			words.style.whiteSpace = 'pre-line';
			const yes = _rapierComposerEl('button', 'link-dialog__btn link-dialog__btn--primary', retry ? 'retry' : 'download');
			yes.type = 'button';
			yes.addEventListener('click', () => { if (open.close(false)) answer(true); });
			return [words, yes];
		}, () => answer(false));
		void state;
	});
}
function _rapierOrnamentBring(kind) {
	const door = _rapierOrnamentDoor;
	if (door.held.has(kind)) return Promise.resolve(door.held.get(kind));
	if (!door.bringing.has(kind)) door.bringing.set(kind, (async () => {
		const provider = _rapierOrnamentProvider(kind), spec = _RAPIER_ORNAMENT_KINDS[kind];
		if (!provider) throw new Error(spec.noun + ' are not available here.');
		await _rapierOrnamentSettled(provider);
		for (let retry = false; provider.status !== 'ready'; retry = true) {
			if (!door.allowed.has(kind) && !await _rapierOrnamentAsk(kind, retry && provider.status === 'error')) throw Object.assign(new Error('canceled'), {canceled: true});
			door.allowed.add(kind);
			const end = _rapierPluginProgress(kind, spec.noun);
			try { await provider[provider.status === 'error' ? 'reinstall' : 'install'](); } catch (_) {  } finally { end(); }
			if (provider.status === 'error') door.allowed.delete(kind);
		}
		const bytes = await provider.bytes(), rows = [];
		for (const pin of spec.pins()) {
			if (rows.length) await new Promise(resolve => setTimeout(resolve, 0));
			const row = spec.admit(bytes[pin.id]);
			if (!row) throw new Error(spec.noun + ' could not be read: ' + pin.id);
			rows.push(row);
		}
		door.held.set(kind, rows);
		return rows;
	})().finally(() => door.bringing.delete(kind)));
	return door.bringing.get(kind);
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
function _rapierComposerElements() {
	if (rapier.document.docKind !== 'markdown') { showToast('Elements go in Markdown documents', 'info'); return; }
	const target = _rapierImageInsertionTarget();
	void _rapierOrnamentBring('elements').then(packs => {
		const groups = new Map();
		for (const pack of packs) for (const item of pack.items) { if (!groups.has(item.group)) groups.set(item.group, []); groups.get(item.group).push(item); }
		if (groups.has('Lettering')) { const lettering = groups.get('Lettering'); groups.delete('Lettering'); groups.set('Lettering', lettering); }
		_rapierComposerOpen('Elements', state => {
			const body = _rapierComposerEl('div', 'rapier-composer__groups');
			let open = null;
			const ink = () => _rapierComposerInk() === RapierOrnaments.ELEMENT_INK ? _rapierComposerHex(getComputedStyle(document.body).color) : _rapierComposerInk();
			const draw = () => {
				body.replaceChildren();
				if (open === null) {
					const list = _rapierComposerEl('div', 'rapier-composer__grid rapier-composer__grid--groups');
					list.setAttribute('role', 'group'); list.setAttribute('aria-label', 'groups');
					for (const [name, items] of groups) {
						const card = _rapierComposerEl('button', 'rapier-composer__card rapier-composer__card--group');
						card.type = 'button'; card.dataset.group = name; card.setAttribute('aria-label', name + ', ' + items.length);
						const sample = items[0];
						card.append(_rapierOrnamentThumbnail(sample, ink(), sample.tile ? 2 : 0), _rapierComposerEl('span', 'rapier-composer__name', name + ' \u00b7 ' + items.length));
						card.addEventListener('click', () => { open = name; draw(); panelTop(); });
						list.append(card);
					}
					body.append(list);
					return;
				}
				const back = _rapierComposerEl('button', 'link-dialog__btn', '\u2039 ' + open);
				back.type = 'button'; back.addEventListener('click', () => { open = null; draw(); panelTop(); });
				const grid = _rapierComposerEl('div', 'rapier-composer__grid rapier-composer__grid--items');
				grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', open);
				for (const item of groups.get(open)) {
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
	}, error => { if (!error?.canceled) showToast(String(error.message || error), 'error'); });
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
	const response = await fetch(RAPIER_ORNAMENTS_URL + kind + '/' + pin.id + '.json', {integrity: 'sha384-' + pin.sha384, credentials: 'omit'});
	if (!response.ok) throw new Error(spec.noun + ' could not be reached. Try again.');
	const row = spec.admit(new Uint8Array(await response.arrayBuffer()));
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

_rapierComposerPart = Object.freeze({borders: _rapierComposerBorders, elements: _rapierComposerElements, insert: _rapierComposerInsert, recolor: _rapierComposerRecolor,
	galleryPiece: _rapierComposerGalleryPiece});
